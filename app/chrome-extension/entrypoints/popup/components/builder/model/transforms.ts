import type {
  Flow as FlowV2,
  NodeBase,
  Edge as EdgeV2,
} from '@/entrypoints/background/record-replay/types';

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export type NodeType = NodeBase['type'];

export function defaultConfigFor(t: NodeType): any {
  if (t === 'click' || t === 'fill')
    return { target: { candidates: [] }, value: t === 'fill' ? '' : undefined };
  if (t === 'navigate') return { url: '' };
  if (t === 'wait') return { condition: { text: '', appear: true } };
  if (t === 'assert') return { assert: { exists: '' } };
  if (t === 'key') return { keys: '' };
  if (t === 'delay') return { ms: 1000 };
  if (t === 'http') return { method: 'GET', url: '', headers: {}, body: null, saveAs: '' };
  if (t === 'extract') return { selector: '', attr: 'text', js: '', saveAs: '' };
  if (t === 'openTab') return { url: '', newWindow: false };
  if (t === 'switchTab') return { tabId: null, urlContains: '', titleContains: '' };
  if (t === 'closeTab') return { tabIds: [], url: '' };
  if (t === 'script') return { world: 'ISOLATED', code: '', saveAs: '', assign: {} };
  return {};
}

export function stepsToNodes(steps: any[]): NodeBase[] {
  const arr: NodeBase[] = [];
  steps.forEach((s, i) => {
    const id = s.id || newId(String(s.type || 'step'));
    const node: NodeBase = {
      id,
      type: (s.type || 'script') as NodeType,
      name: '',
      disabled: false,
      ui: { x: 200, y: 120 + i * 120 },
      config: mapStepToConfig(s),
    };
    arr.push(node);
  });
  return arr;
}

export function mapStepToConfig(s: any) {
  const t = s.type;
  if (t === 'click' || t === 'dblclick')
    return { target: s.target || { candidates: [] }, after: s.after, before: s.before };
  if (t === 'fill') return { target: s.target || { candidates: [] }, value: s.value || '' };
  if (t === 'wait') return { condition: s.condition || { text: '', appear: true } };
  if (t === 'assert') return { assert: s.assert || { exists: '' }, failStrategy: s.failStrategy };
  if (t === 'navigate') return { url: s.url || '' };
  if (t === 'script') return { world: s.world || 'ISOLATED', code: s.code || '' };
  return { ...s };
}

export function mapConfigToStep(n: NodeBase) {
  const base = { id: n.id, type: n.type } as any;
  const c = n.config || {};
  if (n.type === 'click' || n.type === 'dblclick')
    return { ...base, target: c.target || { candidates: [] }, after: c.after, before: c.before };
  if (n.type === 'fill')
    return { ...base, target: c.target || { candidates: [] }, value: c.value || '' };
  if (n.type === 'key') return { ...base, keys: c.keys || '' };
  if (n.type === 'wait') return { ...base, condition: c.condition || { text: '', appear: true } };
  if (n.type === 'assert')
    return { ...base, assert: c.assert || { exists: '' }, failStrategy: c.failStrategy };
  if (n.type === 'navigate') return { ...base, url: c.url || '' };
  if (n.type === 'delay')
    return {
      ...base,
      type: 'wait',
      timeoutMs: Math.max(0, Number(c.ms ?? 1000)),
      condition: { navigation: true },
    };
  if (n.type === 'http')
    return {
      ...base,
      type: 'http',
      method: c.method || 'GET',
      url: c.url || '',
      headers: c.headers || {},
      body: c.body,
      saveAs: c.saveAs || '',
    } as any;
  if (n.type === 'extract')
    return {
      ...base,
      type: 'extract',
      selector: c.selector || '',
      attr: c.attr || 'text',
      js: c.js || '',
      saveAs: c.saveAs || '',
    } as any;
  if (n.type === 'openTab')
    return { ...base, type: 'openTab', url: c.url || '', newWindow: !!c.newWindow } as any;
  if (n.type === 'switchTab')
    return {
      ...base,
      type: 'switchTab',
      tabId: c.tabId || undefined,
      urlContains: c.urlContains || '',
      titleContains: c.titleContains || '',
    } as any;
  if (n.type === 'closeTab')
    return {
      ...base,
      type: 'closeTab',
      tabIds: Array.isArray(c.tabIds) ? c.tabIds : undefined,
      url: c.url || '',
    } as any;
  if (n.type === 'script')
    return {
      ...base,
      world: c.world || 'ISOLATED',
      code: c.code || '',
      when: c.when,
      saveAs: c.saveAs || '',
      assign: c.assign || {},
    } as any;
  return { ...base };
}

export function topoOrder(nodes: NodeBase[], edges: EdgeV2[]): NodeBase[] {
  const id2n = new Map(nodes.map((n) => [n.id, n] as const));
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0] as const));
  for (const e of edges)
    if (!e.label || e.label === 'default') indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  const q: string[] = nodes.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id);
  const out: NodeBase[] = [];
  const nexts = new Map<string, string[]>(nodes.map((n) => [n.id, [] as string[]] as const));
  for (const e of edges) if (!e.label || e.label === 'default') nexts.get(e.from)!.push(e.to);
  while (q.length) {
    const id = q.shift()!;
    const n = id2n.get(id);
    if (!n) continue;
    out.push(n);
    for (const v of nexts.get(id)!) {
      indeg.set(v, (indeg.get(v) || 0) - 1);
      if ((indeg.get(v) || 0) === 0) q.push(v);
    }
  }
  if (out.length === nodes.length) return out;
  return nodes.slice();
}

export function nodesToSteps(nodes: NodeBase[], edges: EdgeV2[]): any[] {
  const order = edges.length ? topoOrder(nodes, edges) : nodes.slice();
  return order.map((n) => mapConfigToStep(n));
}

export function autoChainEdges(nodes: NodeBase[]): EdgeV2[] {
  const arr: EdgeV2[] = [];
  for (let i = 0; i < nodes.length - 1; i++)
    arr.push({ id: newId('e'), from: nodes[i].id, to: nodes[i + 1].id, label: 'default' });
  return arr;
}

export function summarizeNode(n?: NodeBase | null): string {
  if (!n) return '';
  if (n.type === 'click' || n.type === 'fill')
    return n.config?.target?.candidates?.[0]?.value || '未配置选择器';
  if (n.type === 'navigate') return n.config?.url || '';
  if (n.type === 'key') return n.config?.keys || '';
  if (n.type === 'delay') return `${Number(n.config?.ms || 0)}ms`;
  if (n.type === 'http') return `${n.config?.method || 'GET'} ${n.config?.url || ''}`;
  if (n.type === 'extract') return `${n.config?.selector || ''} -> ${n.config?.saveAs || ''}`;
  if (n.type === 'openTab') return `open ${n.config?.url || ''}`;
  if (n.type === 'switchTab')
    return `switch ${n.config?.tabId || n.config?.urlContains || n.config?.titleContains || ''}`;
  if (n.type === 'closeTab') return `close ${n.config?.url || ''}`;
  if (n.type === 'wait') return JSON.stringify(n.config?.condition || {});
  if (n.type === 'assert') return JSON.stringify(n.config?.assert || {});
  if (n.type === 'script') return (n.config?.code || '').slice(0, 30);
  return '';
}

export function cloneFlow(flow: FlowV2): FlowV2 {
  return JSON.parse(JSON.stringify(flow));
}
