import { reactive, ref } from 'vue';
import type {
  Flow as FlowV2,
  NodeBase,
  Edge as EdgeV2,
} from '@/entrypoints/background/record-replay/types';
import {
  autoChainEdges,
  cloneFlow,
  defaultConfigFor,
  newId,
  nodesToSteps,
  stepsToNodes,
  summarizeNode,
  topoOrder,
} from '../model/transforms';

export function useBuilderStore(initial?: FlowV2 | null) {
  const flowLocal = reactive<FlowV2>({ id: '', name: '', version: 1, steps: [], variables: [] });
  const nodes = reactive<NodeBase[]>([]);
  const edges = reactive<EdgeV2[]>([]);
  const activeNodeId = ref<string | null>(null);
  const pendingFrom = ref<string | null>(null);
  const paletteTypes = [
    'click',
    'fill',
    'key',
    'wait',
    'assert',
    'navigate',
    'script',
    'delay',
    'http',
    'extract',
    'openTab',
    'switchTab',
    'closeTab',
  ] as NodeBase['type'][];

  // --- history (undo/redo) ---
  type Snapshot = {
    flow: Pick<FlowV2, 'name' | 'description'>;
    nodes: NodeBase[];
    edges: EdgeV2[];
  };
  const HISTORY_MAX = 50;
  const past: Snapshot[] = [];
  const future: Snapshot[] = [];
  function takeSnapshot(): Snapshot {
    return {
      flow: { name: flowLocal.name, description: flowLocal.description } as any,
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
  }
  function applySnapshot(s: Snapshot) {
    flowLocal.name = (s.flow as any).name || '';
    (flowLocal as any).description = (s.flow as any).description || '';
    nodes.splice(0, nodes.length, ...JSON.parse(JSON.stringify(s.nodes)));
    edges.splice(0, edges.length, ...JSON.parse(JSON.stringify(s.edges)));
  }
  function recordChange() {
    past.push(takeSnapshot());
    // clear redo stack on new change
    future.length = 0;
    if (past.length > HISTORY_MAX) past.splice(0, past.length - HISTORY_MAX);
  }
  function undo() {
    if (past.length === 0) return;
    const current = takeSnapshot();
    const prev = past.pop()!;
    future.push(current);
    applySnapshot(prev);
  }
  function redo() {
    if (future.length === 0) return;
    const current = takeSnapshot();
    const next = future.pop()!;
    past.push(current);
    applySnapshot(next);
  }

  function layoutIfNeeded() {
    const startX = 120,
      startY = 80,
      gapY = 120;
    nodes.forEach((n, i) => {
      if (!n.ui || isNaN(n.ui.x) || isNaN(n.ui.y)) n.ui = { x: startX, y: startY + i * gapY };
    });
  }

  function initFromFlow(flow: FlowV2) {
    const deep = cloneFlow(flow);
    Object.assign(flowLocal, deep);
    nodes.splice(
      0,
      nodes.length,
      ...(Array.isArray(deep.nodes) && deep.nodes.length
        ? deep.nodes
        : stepsToNodes(deep.steps || [])),
    );
    edges.splice(
      0,
      edges.length,
      ...(Array.isArray(deep.edges) && deep.edges.length ? deep.edges : autoChainEdges(nodes)),
    );
    layoutIfNeeded();
    activeNodeId.value = nodes[0]?.id || null;
    // reset history
    past.length = 0;
    future.length = 0;
    past.push(takeSnapshot());
  }

  function selectNode(id: string) {
    if (pendingFrom.value && pendingFrom.value !== id) {
      onConnect(pendingFrom.value, id);
      pendingFrom.value = null;
    }
    activeNodeId.value = id;
  }

  function addNode(t: NodeBase['type']) {
    const id = newId(t);
    const n: NodeBase = {
      id,
      type: t,
      name: '',
      disabled: false,
      config: defaultConfigFor(t),
      ui: { x: 200 + nodes.length * 24, y: 120 + nodes.length * 96 },
    };
    nodes.push(n);
    if (nodes.length > 1) {
      const prev = nodes[nodes.length - 2];
      edges.push({ id: newId('e'), from: prev.id, to: id, label: 'default' });
    }
    activeNodeId.value = id;
    recordChange();
  }

  function duplicateNode(id: string) {
    const src = nodes.find((n) => n.id === id);
    if (!src) return;
    const cp: NodeBase = JSON.parse(JSON.stringify(src));
    cp.id = newId(src.type);
    cp.name = src.name ? `${src.name} Copy` : '';
    const baseX = cp.ui && typeof cp.ui.x === 'number' ? cp.ui.x : 200;
    const baseY = cp.ui && typeof cp.ui.y === 'number' ? cp.ui.y : 120;
    cp.ui = { x: baseX + 40, y: baseY + 40 };
    nodes.push(cp);
    activeNodeId.value = cp.id;
    recordChange();
  }

  function removeNode(id: string) {
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx < 0) return;
    nodes.splice(idx, 1);
    for (let i = edges.length - 1; i >= 0; i--) {
      const e = edges[i];
      if (e.from === id || e.to === id) edges.splice(i, 1);
    }
    activeNodeId.value = nodes[Math.min(idx, nodes.length - 1)]?.id || null;
    recordChange();
  }

  function setNodePosition(id: string, x: number, y: number) {
    const n = nodes.find((n) => n.id === id);
    if (!n) return;
    n.ui = { x: Math.round(x), y: Math.round(y) };
    // 不计入历史栈，避免频繁记录；由用户触发操作（连接/新增/删除等）记录。
  }

  function connectFrom(id: string) {
    pendingFrom.value = id;
  }

  function onConnect(sourceId: string, targetId: string) {
    // 单一默认出边：删除同源 default 出边
    for (let i = edges.length - 1; i >= 0; i--) {
      const e = edges[i];
      if (e.from === sourceId && (!e.label || e.label === 'default')) edges.splice(i, 1);
    }
    edges.push({ id: newId('e'), from: sourceId, to: targetId, label: 'default' });
    recordChange();
  }

  function importFromSteps() {
    const arr = stepsToNodes(flowLocal.steps || []);
    nodes.splice(0, nodes.length, ...arr);
    edges.splice(0, edges.length, ...autoChainEdges(arr));
    layoutIfNeeded();
    recordChange();
  }

  function exportSteps() {
    return nodesToSteps(nodes, edges);
  }

  function summarize(id?: string) {
    const n = nodes.find((x) => x.id === id);
    return summarizeNode(n || null);
  }

  // 自动排版：根据拓扑顺序纵向排列，列宽 300、行高 120；若存在分叉，简单按顺序换行
  function layoutAuto() {
    const order = topoOrder(nodes, edges);
    const startX = 120,
      startY = 80,
      stepY = 120,
      stepX = 300,
      maxPerCol = Math.max(6, Math.ceil(order.length / 3));
    let col = 0,
      row = 0;
    for (const n of order) {
      n.ui = { x: startX + col * stepX, y: startY + row * stepY } as any;
      row++;
      if (row >= maxPerCol) {
        row = 0;
        col++;
      }
    }
    recordChange();
  }

  if (initial) initFromFlow(initial);

  return {
    flowLocal,
    nodes,
    edges,
    activeNodeId,
    pendingFrom,
    paletteTypes,
    undo,
    redo,
    initFromFlow,
    selectNode,
    addNode,
    duplicateNode,
    removeNode,
    setNodePosition,
    connectFrom,
    onConnect,
    importFromSteps,
    exportSteps,
    summarize,
    layoutAuto,
  };
}
