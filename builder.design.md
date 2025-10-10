# 模块 C — 编排画布（Builder）技术设计（builder.design.md）

版本：v1.0（基于 builder.prd.md）  
目标读者：前端架构/扩展工程/MCP 工具维护者

## 1. 架构概览

- 编辑端（Popup 内）
  - 画布 UI：Vue + 画布库（建议 VueFlow），包含节点库、画布、迷你地图、属性面板、搜索/对齐、撤销/重做、自动保存。
  - 状态管理：本地 store（可用组合式 API/Pinia），维护 `nodes/edges/variables/meta` 与 UI 状态。
  - 序列化：与 `FlowV2` 对齐，保存至 `chrome.storage.local`，并确保与 `Flow` 线性模式互转。
- 执行端（Background）
  - Runner 增强：在存在 `nodes/edges` 时按 DAG 模式执行；缺省时沿用 steps[] 线性执行。
  - Node Registry：节点注册表（type→validate/run 映射），各节点内部复用 MCP 工具（chrome\_\*）。
- 消息/发布
  - 导入/导出/发布工具：沿用现有 message types 与 native host 动态工具注册流程。

## 2. 数据模型

### 2.1 Flow V2 接口（与 design.md 保持一致）

```ts
export type NodeType =
  | 'click'
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
  config?: any; // 每个节点的专有配置（见 2.2）
  ui?: { x: number; y: number };
}
export interface Edge {
  id: string;
  from: string;
  to: string;
  label?: 'default' | 'true' | 'false' | 'onError'; // M1 仅 default
}
export interface FlowV2 extends Flow {
  // 兼容 V1
  nodes?: NodeBase[];
  edges?: Edge[];
  subflows?: Record<string, { nodes: NodeBase[]; edges: Edge[] }>;
}
```

### 2.2 节点配置（config）约定

- 通用：`timeoutMs?`、`retry? { count; intervalMs; backoff? }`、`screenshotOnFail?: boolean`、`saveAs?: string`（extract/http/script 可用）。
- click/fill：`target: TargetLocator`（含 ref/candidates），fill 另有 `value: string`（支持 `{var}`）。
- key：`keys: string`（e.g. `Backspace Enter` / `cmd+a`）。
- wait：`condition: { text | selector | navigation | networkIdle }`。
- assert：`assert: { exists | visible | textPresent | attribute{ selector; name; equals? | matches? } }`。
- script：`world?: 'MAIN'|'ISOLATED'`，`code: string`，`assign?: Record<string,string>`（把返回对象字段映射到 vars）。
- http：`method; url; headers?; body?; assign?: Record<string,string>`（JSONPath → vars）。
- extract：`selector/attr/text/regex/js`（至少一种），`saveAs: string`。
- navigate/openTab/switchTab/closeTab：与现有浏览器工具参数一致（tabTarget/startUrl/refresh 保持在运行选项层）。

## 3. 画布 UI 设计

- 组件构成
  - 左侧：节点库（基础动作分组）、搜索。
  - 中间：画布区（VueFlow），支持缩放/平移/网格吸附/多选/框选/快捷键（Del/⌘C/⌘V/⌘Z/⌘Shift+Z）。
  - 右侧：属性面板（分组：基本、目标/选择器、等待/断言、变量/映射、重试/超时、备注）。
  - 底部：日志区（运行时使用，可隐藏）。
- 交互细节
  - 新建：拖入节点自动放置，连接时高亮可落点；禁止自环；断开连线回收端点。
  - 校验：必填项红框/提示；不合法连线阻止；保存前校验。
  - 兼容：从 steps[] 打开时自动串联节点；保存时可选择“覆盖 steps[]”（线性模式）或“仅保存 nodes/edges”。
- 性能与体验
  - 大图优化：虚拟化/分层渲染；节点模板缓存；平移/缩放节流；100~300 节点流畅。

## 4. Runner（DAG 模式）

### 4.1 执行语义（M1）

- 当 `nodes/edges` 存在且不为空：按拓扑排序获得可执行序列；仅处理 label=default 的边。
- 逐节点执行：
  1. 变量展开：把 config 中字符串字段里的 `{var}` 替换为 ctx.vars 的值；
  2. validate：节点注册表校验 config；
  3. run：映射到 MCP 工具（见 5），拿到结果；
  4. saveAs/assign：把产出写入 ctx.vars（或 ctx.outputs[节点ID]）。
  5. 日志：推送节点级 RunLogEntry；失败按 `failStrategy`/`retry` 处理。
- 退出条件：到达尾部或遇到不可恢复错误。

### 4.2 伪代码

```ts
async function runDag(flow: FlowV2, options): Promise<RunResult> {
  const ctx = { vars: resolveVars(flow.variables, options.args), outputs: {}, runId };
  const order = topoSort(flow.nodes, flow.edges); // label=default only
  for (const nodeId of order) {
    const node = getNode(nodeId);
    if (node.disabled) continue;
    const runtime = registry[node.type];
    const conf = expandTemplates(node.config, ctx.vars);
    try {
      runtime.validate(conf);
      const out = await runtime.run({ tabId, ctx, logger }, conf);
      if (conf.saveAs) ctx.vars[conf.saveAs] = out?.value ?? out;
      if (conf.assign) applyAssign(ctx.vars, out, conf.assign); // JSONPath 支持留到 M2
      logSuccess(nodeId);
    } catch (e) {
      const retryOk = await maybeRetry(runtime, conf, e);
      if (!retryOk) handleFail(nodeId, e); // stop/continue
    }
  }
  return summarize(ctx);
}
```

## 5. 节点注册表与工具映射

- 注册表结构

```ts
export interface NodeRuntime<T = any> {
  validate(config: T): { ok: boolean; errors?: string[] };
  run(ctx: NodeContext, config: T): Promise<any>;
}
export interface NodeContext {
  tabId: number;
  vars: Record<string, any>;
  outputs: Record<string, any>;
  runId: string;
  logger: (e: RunLogEntry) => void;
}
```

- 工具映射（与现有一致）：
  - click → `chrome_click_element`（双击用 `chrome_computer.double_click`）。
  - fill → `chrome_fill_or_select`；key → `chrome_keyboard`。
  - wait/assert → `wait-helper` + `chrome_read_page`；navigate/open/switch/close → `chrome_navigate`/窗口工具。
  - script → `chrome_inject_script`（MAIN/ISOLATED）。
  - http → `chrome_network_request`（已有则复用）。
  - extract → `chrome_read_page` + 内容脚本聚合。

## 6. 存储/导入/导出/发布

- 存储：沿用 `chrome.storage.local`，key 不变（rr_flows）；在 Flow 实体上新增 `nodes/edges` 字段。
- 导入导出：与线性一致，JSON 中可同时含 steps/nodes/edges；导入时做版本迁移。
- 发布为 MCP 动态工具：工具名 `flow.<slug>`；inputSchema 基于 variables + 运行选项生成；调用时走通用 `record_replay_flow_run`。

## 7. 校验与错误处理

- 编辑期校验：必填/格式/选择器空值；运行期校验：validate + 容错（默认 stop）。
- 失败截图：统一由 runner 在 catch 路径触发 screenshot 工具；日志中标出节点 ID 与错误原因。
- 选择器回退：沿用 selector-engine 策略；fallback 用信息写入日志，并在编辑器弹出更新提示。

## 8. 安全与隐私

- 敏感变量：不落盘，不导出；运行时仅从 args 注入；Overlay 表单/提示敏感字段。
- 注入世界：ISOLATED 为默认；MAIN 仅在用户明确选择时使用。
- 权限最小化：不新增超出现有扩展范围的权限。

## 9. 性能策略

- 编辑端：虚拟化/节流；避免频繁全图重绘；自动保存去抖（≥500ms）。
- 执行端：节点超时/重试/退避；M2 后引入并发与限流（全局/域级）。

## 10. 迁移与兼容

- 打开旧 Flow（仅 steps[]）→ 自动生成链式 DAG（nodes/edges）并允许切换“线性/画布”视图；
- 只要 nodes/edges 存在，优先 DAG 执行；否则走 steps[]；导出时兼容两者。

## 11. 开发分期（落地建议）

- M1（2~3 周）：
  - 选型并接入 VueFlow；完成画布基础、节点库、连线、属性面板、撤销/重做、自动保存；
  - 支持基础节点与 DAG 串行执行；线性兼容；导入导出/发布；
  - 日志/失败截图在节点上联动高亮（可先在列表展示）。
- M2：
  - If/Else/While/ForEach；OnError 分支；从节点开始调试；open/switch/close 完善；分组/折叠。
- M3：
  - 并发/限流；表达式/JSONPath 映射器；数据集/凭据；高级调试。

## 12. 开放问题

- JSONPath 与表达式语言的边界与安全沙箱如何定义？
- 节点产出统一结构与 assign/saveAs 的歧义如何避免？
- 画布超大规模（500+ 节点）时的严重退化处理策略？
- 团队协作与冲突解决是否需要引入（ID 锁/合并策略）？

---

说明：本设计围绕“高度复用现有 MCP 工具、最小化新增复杂度”的原则，画布仅作为编排与可视化层；执行统一收口到背景 Runner 与工具层，便于稳定落地与运维。
