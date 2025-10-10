// design note: comments in English

export type SelectorType = 'css' | 'xpath' | 'attr' | 'aria' | 'text';

export interface SelectorCandidate {
  type: SelectorType;
  value: string; // literal selector or text/aria expression
  weight?: number; // user-adjustable priority; higher first
}

export interface TargetLocator {
  ref?: string; // ephemeral ref from read_page
  candidates: SelectorCandidate[]; // ordered by priority
}

export type StepType =
  | 'click'
  | 'dblclick'
  | 'fill'
  | 'key'
  | 'scroll'
  | 'drag'
  | 'wait'
  | 'assert'
  | 'script'
  | 'navigate'
  | 'http'
  | 'extract'
  | 'openTab'
  | 'switchTab'
  | 'closeTab';

export interface StepBase {
  id: string;
  type: StepType;
  timeoutMs?: number; // default 10000
  retry?: { count: number; intervalMs: number; backoff?: 'none' | 'exp' };
  screenshotOnFail?: boolean; // default true
}

export interface StepClick extends StepBase {
  type: 'click' | 'dblclick';
  target: TargetLocator;
  before?: { scrollIntoView?: boolean; waitForSelector?: boolean };
  after?: { waitForNavigation?: boolean; waitForNetworkIdle?: boolean };
}

export interface StepFill extends StepBase {
  type: 'fill';
  target: TargetLocator;
  value: string; // may contain {var}
}

export interface StepKey extends StepBase {
  type: 'key';
  keys: string; // e.g. "Backspace Enter" or "cmd+a"
  target?: TargetLocator; // optional focus target
}

export interface StepScroll extends StepBase {
  type: 'scroll';
  mode: 'element' | 'offset' | 'container';
  target?: TargetLocator; // when mode = element / container
  offset?: { x?: number; y?: number };
}

export interface StepDrag extends StepBase {
  type: 'drag';
  start: TargetLocator;
  end: TargetLocator;
  path?: Array<{ x: number; y: number }>; // sampled trajectory
}

export interface StepWait extends StepBase {
  type: 'wait';
  condition:
    | { selector: string; visible?: boolean }
    | { text: string; appear?: boolean }
    | { navigation: true }
    | { networkIdle: true };
}

export interface StepAssert extends StepBase {
  type: 'assert';
  assert:
    | { exists: string }
    | { visible: string }
    | { textPresent: string }
    | { attribute: { selector: string; name: string; equals?: string; matches?: string } };
  // 失败策略：stop=失败即停（默认）、warn=仅告警并继续、retry=触发重试机制
  failStrategy?: 'stop' | 'warn' | 'retry';
}

export interface StepScript extends StepBase {
  type: 'script';
  world?: 'MAIN' | 'ISOLATED';
  code: string; // user script string
  when?: 'before' | 'after';
}

export type Step =
  | StepClick
  | StepFill
  | StepKey
  | StepScroll
  | StepDrag
  | StepWait
  | StepAssert
  | StepScript
  | (StepBase & { type: 'navigate'; url: string })
  | StepHttp
  | StepExtract
  | StepOpenTab
  | StepSwitchTab
  | StepCloseTab;

export interface StepHttp extends StepBase {
  type: 'http';
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  saveAs?: string;
  assign?: Record<string, string>;
}

export interface StepExtract extends StepBase {
  type: 'extract';
  selector?: string;
  attr?: string; // 'text'|'textContent' to read text
  js?: string; // custom JS that returns value
  saveAs: string;
}

export interface StepOpenTab extends StepBase {
  type: 'openTab';
  url?: string;
  newWindow?: boolean;
}

export interface StepSwitchTab extends StepBase {
  type: 'switchTab';
  tabId?: number;
  urlContains?: string;
  titleContains?: string;
}

export interface StepCloseTab extends StepBase {
  type: 'closeTab';
  tabIds?: number[];
  url?: string;
}

export interface VariableDef {
  key: string;
  label?: string;
  sensitive?: boolean;
  default?: string;
  rules?: { required?: boolean; pattern?: string };
}

export type NodeType =
  | 'click'
  | 'dblclick'
  | 'fill'
  | 'key'
  | 'wait'
  | 'assert'
  | 'script'
  | 'navigate'
  | 'openTab'
  | 'switchTab'
  | 'closeTab'
  | 'http'
  | 'extract'
  | 'delay';

export interface NodeBase {
  id: string;
  type: NodeType;
  name?: string;
  disabled?: boolean;
  config?: any;
  ui?: { x: number; y: number };
}

export interface Edge {
  id: string;
  from: string;
  to: string;
  label?: 'default' | 'true' | 'false' | 'onError';
}

export interface Flow {
  id: string;
  name: string;
  description?: string;
  version: number;
  meta?: {
    createdAt: string;
    updatedAt: string;
    domain?: string;
    tags?: string[];
    bindings?: Array<{ type: 'domain' | 'path' | 'url'; value: string }>;
    tool?: { category?: string; description?: string };
    exposedOutputs?: Array<{ nodeId: string; as: string }>;
  };
  variables?: VariableDef[];
  steps: Step[];
  // Flow V2（可选）：画布编排
  nodes?: NodeBase[];
  edges?: Edge[];
  subflows?: Record<string, { nodes: NodeBase[]; edges: Edge[] }>;
}

export interface RunLogEntry {
  stepId: string;
  status: 'success' | 'failed' | 'retrying' | 'warning';
  message?: string;
  tookMs?: number;
  screenshotBase64?: string; // small thumbnail (optional)
  consoleSnippets?: string[]; // critical lines
  networkSnippets?: Array<{ method: string; url: string; status?: number; ms?: number }>;
  // selector fallback info
  fallbackUsed?: boolean;
  fallbackFrom?: string;
  fallbackTo?: string;
}

export interface RunRecord {
  id: string;
  flowId: string;
  startedAt: string;
  finishedAt?: string;
  success?: boolean;
  entries: RunLogEntry[];
}

export interface RunResult {
  runId: string;
  success: boolean;
  summary: { total: number; success: number; failed: number; tookMs: number };
  url?: string | null;
  outputs?: Record<string, any> | null;
  logs?: RunLogEntry[];
  screenshots?: { onFailure?: string | null };
}
