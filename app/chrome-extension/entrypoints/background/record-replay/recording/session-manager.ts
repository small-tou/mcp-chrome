import type { Edge, Flow, NodeBase, Step, VariableDef } from '../types';
import { TOOL_MESSAGE_TYPES } from '@/common/message-types';
import { NODE_TYPES } from '@/common/node-types';
import { mapStepToNodeConfig, stepsToDAG, EDGE_LABELS } from 'chrome-mcp-shared';

/**
 * Recording status state machine:
 * - idle: No active recording
 * - recording: Actively capturing user interactions
 * - paused: Temporarily paused (UI can resume)
 * - stopping: Draining final steps from content scripts before save
 */
export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopping';

export interface RecordingSessionState {
  sessionId: string;
  status: RecordingStatus;
  originTabId: number | null;
  flow: Flow | null;
  // Track tabs that have participated in this recording session
  activeTabs: Set<number>;
  // Track which tabs have acknowledged stop command
  stoppedTabs: Set<number>;
}

// Valid node types for type checking
const VALID_NODE_TYPES = new Set<string>(Object.values(NODE_TYPES));

export class RecordingSessionManager {
  private state: RecordingSessionState = {
    sessionId: '',
    status: 'idle',
    originTabId: null,
    flow: null,
    activeTabs: new Set<number>(),
    stoppedTabs: new Set<number>(),
  };

  // Session-level caches for incremental DAG sync (cleared on session start/stop)
  private stepIndexMap: Map<string, number> = new Map();
  private nodeIndexMap: Map<string, number> = new Map();
  // Monotonic counter for edge id generation (avoids collision on delete/reorder)
  private edgeSeq: number = 0;

  getStatus(): RecordingStatus {
    return this.state.status;
  }

  getSession(): Readonly<RecordingSessionState> {
    return this.state;
  }

  getFlow(): Flow | null {
    return this.state.flow;
  }

  getOriginTabId(): number | null {
    return this.state.originTabId;
  }

  addActiveTab(tabId: number): void {
    if (typeof tabId === 'number') this.state.activeTabs.add(tabId);
  }

  removeActiveTab(tabId: number): void {
    this.state.activeTabs.delete(tabId);
  }

  getActiveTabs(): number[] {
    return Array.from(this.state.activeTabs);
  }

  async startSession(flow: Flow, originTabId: number): Promise<void> {
    // Clear caches for fresh session
    this.stepIndexMap.clear();
    this.nodeIndexMap.clear();
    this.edgeSeq = 0;

    this.state = {
      sessionId: `sess_${Date.now()}`,
      status: 'recording',
      originTabId,
      flow,
      activeTabs: new Set<number>([originTabId]),
      stoppedTabs: new Set<number>(),
    };

    // Initialize caches from existing flow data (supports resume scenarios)
    this.rebuildCaches();
  }

  /**
   * Transition to stopping state. Content scripts can still send final steps.
   * Returns the sessionId for barrier verification.
   */
  beginStopping(): string {
    if (this.state.status === 'idle') return '';
    this.state.status = 'stopping';
    this.state.stoppedTabs.clear();
    return this.state.sessionId;
  }

  /**
   * Mark a tab as having acknowledged the stop command.
   * Returns true if all active tabs have stopped.
   */
  markTabStopped(tabId: number): boolean {
    this.state.stoppedTabs.add(tabId);
    // Check if all active tabs have acknowledged
    for (const activeTabId of this.state.activeTabs) {
      if (!this.state.stoppedTabs.has(activeTabId)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if we're in stopping state (still accepting final steps).
   */
  isStopping(): boolean {
    return this.state.status === 'stopping';
  }

  /**
   * Check if we can accept steps (recording or stopping).
   */
  canAcceptSteps(): boolean {
    return this.state.status === 'recording' || this.state.status === 'stopping';
  }

  /**
   * Transition to paused state.
   */
  pause(): void {
    if (this.state.status === 'recording') {
      this.state.status = 'paused';
    }
  }

  /**
   * Resume from paused state.
   */
  resume(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'recording';
    }
  }

  /**
   * Finalize stop and clear session state.
   */
  async stopSession(): Promise<Flow | null> {
    const flow = this.state.flow;
    this.state.status = 'idle';
    this.state.flow = null;
    this.state.originTabId = null;
    this.state.activeTabs.clear();
    this.state.stoppedTabs.clear();
    // Clear caches
    this.stepIndexMap.clear();
    this.nodeIndexMap.clear();
    this.edgeSeq = 0;
    return flow;
  }

  updateFlow(mutator: (f: Flow) => void): void {
    const f = this.state.flow;
    if (!f) return;
    mutator(f);
    try {
      (f.meta as any).updatedAt = new Date().toISOString();
    } catch (e) {
      // ignore meta update errors
    }
  }

  /**
   * Append or upsert steps to the flow with incremental DAG sync.
   * Uses upsert semantics: if a step with the same id exists, update it in place.
   * This ensures fill steps get their final value even after initial flush.
   *
   * DAG sync: maintains flow.nodes/edges in lockstep with flow.steps during recording.
   * - New step → create node + edge from previous node
   * - Upsert step → update node.config and node.type
   * - Invariant violation → fallback to full stepsToDAG rebuild
   */
  appendSteps(steps: Step[]): void {
    const f = this.state.flow;
    if (!f || !Array.isArray(steps) || steps.length === 0) return;

    // Initialize arrays if missing
    if (!Array.isArray(f.steps)) f.steps = [];
    if (!Array.isArray(f.nodes)) f.nodes = [];
    if (!Array.isArray(f.edges)) f.edges = [];

    const nodes = f.nodes;
    const edges = f.edges;

    // Check invariants: nodes must be 1:1 with steps, edges must match linear chain
    // If violated (e.g., imported flow, manual edit), rebuild DAG
    if (!this.checkDagInvariant(f.steps, nodes, edges)) {
      this.rebuildDag();
    }

    // Process each incoming step with upsert semantics + incremental DAG sync
    let needsRebuild = false;
    for (const step of steps) {
      // Ensure step has an id
      if (!step.id) {
        step.id = `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      }

      const existingIdx = this.stepIndexMap.get(step.id);
      if (existingIdx !== undefined) {
        // Upsert: update existing step in place
        f.steps[existingIdx] = step;

        // Sync node: update config and type
        const nodeIdx = this.nodeIndexMap.get(step.id);
        if (nodeIdx === undefined || !nodes[nodeIdx]) {
          needsRebuild = true;
          continue;
        }
        nodes[nodeIdx] = {
          ...nodes[nodeIdx],
          type: this.toNodeType(step.type),
          config: mapStepToNodeConfig(step),
        };
      } else {
        // Append: new step
        const prevStepId = f.steps.length > 0 ? f.steps[f.steps.length - 1]?.id : undefined;

        f.steps.push(step);
        this.stepIndexMap.set(step.id, f.steps.length - 1);

        // Create corresponding node
        const newNode: NodeBase = {
          id: step.id,
          type: this.toNodeType(step.type),
          config: mapStepToNodeConfig(step),
        };
        nodes.push(newNode);
        this.nodeIndexMap.set(step.id, nodes.length - 1);

        // Create edge from previous node (if exists)
        if (prevStepId) {
          if (!this.nodeIndexMap.has(prevStepId)) {
            needsRebuild = true;
            continue;
          }
          const edgeId = `e_${this.edgeSeq++}_${prevStepId}_${step.id}`;
          edges.push({
            id: edgeId,
            from: prevStepId,
            to: step.id,
            label: EDGE_LABELS.DEFAULT,
          });
        }
      }
    }

    // Final invariant check: if any inconsistency detected, rebuild
    if (needsRebuild || !this.checkDagInvariant(f.steps, nodes, edges)) {
      this.rebuildDag();
    }

    // Update meta timestamp
    try {
      if (f.meta) {
        f.meta.updatedAt = new Date().toISOString();
      }
    } catch {
      // ignore meta update errors
    }

    this.broadcastTimelineUpdate(steps);
  }

  /**
   * Convert step type to valid NodeType with fallback to SCRIPT.
   * Logs a warning for unknown types to help detect upstream type drift.
   */
  private toNodeType(stepType: string): NodeBase['type'] {
    if (VALID_NODE_TYPES.has(stepType)) {
      return stepType as NodeBase['type'];
    }
    console.warn(`[RecordingSession] Unknown step type "${stepType}", falling back to "script"`);
    return NODE_TYPES.SCRIPT;
  }

  /**
   * Check DAG invariant for linear recording:
   * - nodes.length === steps.length
   * - edges.length === max(0, steps.length - 1)
   * - Last edge (if exists) points to the last step
   */
  private checkDagInvariant(steps: Step[], nodes: NodeBase[], edges: Edge[]): boolean {
    const stepCount = steps.length;
    const expectedEdgeCount = Math.max(0, stepCount - 1);

    // Check node count matches step count
    if (nodes.length !== stepCount) {
      return false;
    }

    // Check edge count matches expected linear chain
    if (edges.length !== expectedEdgeCount) {
      return false;
    }

    // Check last edge points to last step (if edges exist)
    if (edges.length > 0 && steps.length > 0) {
      const lastEdge = edges[edges.length - 1];
      const lastStepId = steps[steps.length - 1]?.id;
      if (lastEdge.to !== lastStepId) {
        return false;
      }
    }

    return true;
  }

  /**
   * Rebuild caches from current flow state.
   * Called on session start and after DAG rebuild.
   */
  private rebuildCaches(): void {
    const f = this.state.flow;
    if (!f) return;

    this.stepIndexMap.clear();
    this.nodeIndexMap.clear();

    if (Array.isArray(f.steps)) {
      for (let i = 0; i < f.steps.length; i++) {
        const id = f.steps[i]?.id;
        if (id) this.stepIndexMap.set(id, i);
      }
    }

    if (Array.isArray(f.nodes)) {
      for (let i = 0; i < f.nodes.length; i++) {
        const id = f.nodes[i]?.id;
        if (id) this.nodeIndexMap.set(id, i);
      }
    }

    // Sync edgeSeq to continue from current edge count (avoids id collision)
    this.edgeSeq = Array.isArray(f.edges) ? f.edges.length : 0;
  }

  /**
   * Full DAG rebuild from steps. Used as fallback when invariants are violated.
   * Clears existing nodes/edges and regenerates from scratch.
   */
  private rebuildDag(): void {
    const f = this.state.flow;
    if (!f || !Array.isArray(f.steps)) return;

    const dag = stepsToDAG(f.steps);

    // Clear and repopulate nodes
    if (!Array.isArray(f.nodes)) f.nodes = [];
    f.nodes.length = 0;
    for (const n of dag.nodes) {
      f.nodes.push({
        id: n.id,
        type: this.toNodeType(n.type),
        config: n.config,
      });
    }

    // Clear and repopulate edges
    if (!Array.isArray(f.edges)) f.edges = [];
    f.edges.length = 0;
    for (const e of dag.edges) {
      f.edges.push({
        id: e.id,
        from: e.from,
        to: e.to,
        label: e.label,
      });
    }

    // Rebuild caches
    this.rebuildCaches();
  }

  /**
   * Append variables to the flow. Deduplicates by key.
   */
  appendVariables(variables: VariableDef[]): void {
    const f = this.state.flow;
    if (!f || !Array.isArray(variables) || variables.length === 0) return;

    if (!f.variables) {
      f.variables = [];
    }

    // Deduplicate by key - newer definitions override older ones
    const existingKeys = new Set(f.variables.map((v) => v.key));
    for (const v of variables) {
      if (!v.key) continue;
      if (existingKeys.has(v.key)) {
        // Update existing variable
        const idx = f.variables.findIndex((fv) => fv.key === v.key);
        if (idx >= 0) {
          f.variables[idx] = v;
        }
      } else {
        f.variables.push(v);
        existingKeys.add(v.key);
      }
    }

    // Update meta timestamp
    try {
      if (f.meta) {
        f.meta.updatedAt = new Date().toISOString();
      }
    } catch {
      // ignore meta update errors
    }
  }

  // Broadcast timeline updates to relevant tabs (top-frame only)
  broadcastTimelineUpdate(steps: Step[]): void {
    try {
      if (!steps || steps.length === 0) return;
      // Send full timeline to keep UI consistent across tabs
      const fullSteps = this.state.flow?.steps || [];
      // Prefer broadcasting to all tabs that participated in this session, so timeline
      // stays consistent when user switches across tabs/windows during a single session.
      const targets = this.getActiveTabs();
      const list =
        targets && targets.length
          ? targets
          : this.state.originTabId != null
            ? [this.state.originTabId]
            : [];
      for (const tabId of list) {
        chrome.tabs.sendMessage(
          tabId,
          { action: TOOL_MESSAGE_TYPES.RR_TIMELINE_UPDATE, steps: fullSteps },
          { frameId: 0 },
        );
      }
    } catch {}
  }
}

// Singleton for wiring convenience
export const recordingSession = new RecordingSessionManager();
