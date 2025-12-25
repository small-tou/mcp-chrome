# 录制回放功能重构计划

## 目标

完全重写录制回放功能，打造超越商业级应用体验的产品。定位为全功能平台：端到端测试 + 浏览器自动化 + 用户操作录制。

## 决策

- **兼容性**: 不需要兼容现有数据，可以完全重写
- **产品定位**: 全功能商业级产品
- **iframe 支持**: 中优先级，基础支持后续迭代

---

## 整体进度概览

| 阶段                   | 状态      | 完成时间 | 主要内容                                                       |
| ---------------------- | --------- | -------- | -------------------------------------------------------------- |
| Phase 1.1 Action 系统  | ✅ 完成   | -        | 27 种 Action 类型定义、执行器注册表                            |
| Phase 1.2 选择器引擎   | ✅ 完成   | -        | 6 种策略、指纹验证、Shadow DOM 支持                            |
| Phase 1.3 数据模型统一 | 🔄 进行中 | -        | P0-P3 完成，P4 待实施                                          |
| - M1 低风险接线        | ✅ 完成   | 2025-12  | StepRunner 依赖注入、tabId 管理                                |
| - M2 可控启用 hybrid   | ✅ 完成   | 2025-12  | 执行模式配置、最小 allowlist                                   |
| - M2.1 双重策略修复    | ✅ 完成   | 2025-12  | skipRetry/skipNavWait 策略跳过                                 |
| - P1.0 存储层统一      | ✅ 完成   | 2025-12  | ensureMigratedFromLocal、importFlowFromJson                    |
| - M3-core 契约测试     | ✅ 完成   | 2025-12  | 42 个测试（adapter-policy + step-executor + session-dag-sync） |
| - P2 录制链路迁移      | ✅ 完成   | 2025-12  | 增量式 DAG 同步、双写方案                                      |
| - P4 清理旧类型        | ⏳ 待实施 | -        | 删除 Step 联合类型、Flow.steps 字段                            |
| Phase 2-7              | ⏳ 待实施 | -        | 录制系统、回放引擎、Builder、高级功能                          |

**当前测试状态**: 197 个测试全部通过

---

## 下一步任务建议（供接手者参考）

### 优先级 1: M3-full 完整集成测试

验证 hybrid 模式下各类型行为一致性，特别关注：

- aria selector 定位
- script when:'after' defer 执行时机
- control-flow 条件求值
- openTab/switchTab 后 ctx.tabId 更新

### 优先级 2: P4 清理旧类型

- 删除 `types.ts` 中的 `Step` 联合类型
- 删除 `Flow.steps` 字段（或移至 `legacy-types.ts`）
- 更新 UI Builder 保存格式

### 优先级 3: UI 刷新机制修复

IndexedDB 迁移后，popup/sidepanel 不再监听 chrome.storage.local 变化：

- 需要新的变更通知机制（可能通过 chrome.runtime.sendMessage）
- 或改用 IndexedDB observer / BroadcastChannel

### 优先级 4: 录制期实时 DAG 展示（可选）

当前 DAG 只在内存态，可考虑：

- 将 nodes/edges 包含在 timeline 广播中
- UI 端实时渲染 DAG 视图

---

## 实施进度

### 已完成

#### Phase 1.1: Action 系统 ✅

- [x] `actions/types.ts` - 完整的 Action 类型定义（27 种 Action 类型）
  - trigger/delay/click/dblclick/fill/key/scroll/drag/wait/assert/extract/script/http/screenshot/triggerEvent/setAttribute/switchFrame/loopElements/if/foreach/while/executeFlow/navigate/openTab/switchTab/closeTab/handleDownload
- [x] `actions/registry.ts` - Action 执行器注册表（支持 before/after 钩子、重试/超时、解析器）
- [x] `actions/index.ts` - 模块导出

#### Phase 1.2: 选择器引擎 - 基础框架 ✅

- [x] `shared/selector/types.ts` - 选择器类型定义（含 ExtendedSelectorTarget）
- [x] `shared/selector/stability.ts` - 稳定性评分计算
- [x] `shared/selector/strategies/` - 6 种选择器策略（testid/aria/css-unique/css-path/anchor-relpath/text）
- [x] `shared/selector/generator.ts` - 统一选择器生成（含 generateExtendedSelectorTarget）
- [x] `shared/selector/locator.ts` - 统一元素定位（支持多候选尝试与排序）

#### Phase 1.2: 选择器引擎 - 补齐商业级功能 ✅

对比 `web-editor-v2/locator.ts`，已补齐以下功能：

| 功能                    | 状态    | 说明                                                                              |
| ----------------------- | ------- | --------------------------------------------------------------------------------- |
| **指纹(Fingerprint)**   | ✅ 完成 | `fingerprint.ts` - 生成、解析、验证、相似度计算                                   |
| **DOM Path**            | ✅ 完成 | `dom-path.ts` - 路径计算、定位、比较                                              |
| **锚点+相对路径策略**   | ✅ 完成 | `strategies/anchor-relpath.ts` - anchor + nth-of-type 路径                        |
| **Shadow DOM 完整支持** | ✅ 完成 | `shadow-dom.ts` - 链遍历和查询；`generator.ts` - 链生成                           |
| **name/title/alt 属性** | ✅ 完成 | `testid.ts` + `generator.ts` - 带标签前缀规则                                     |
| **类型扩展**            | ✅ 完成 | `types.ts` - `ExtendedSelectorTarget`、`fingerprint/domPath/shadowHostChain` 字段 |

> **注意**: aria-label 属性已由 `ariaStrategy` 处理，不重复加入 testid 策略

### 进行中

#### Phase 1.3: 数据模型统一 🔄

**当前状态**：P0、P1、P2、P3 已完成。P4 待后续迭代。

- P0 ✅：录制产物转换为 DAG，可直接回放
- P1 ✅：存储层统一（ensureMigratedFromLocal、importFlowFromJson 多格式支持）
- P2 ✅：录制链路迁移（增量式 DAG 同步，双写方案）
- P3 ✅：22 个 Action Handlers 完整实现 + Scheduler 集成架构设计完成
- P4 ⏳：清理旧 Step 类型

**核心问题**：录制与回放数据格式不一致

- 录制产物：`Flow.steps: Step[]`（`recording/flow-builder.ts`）
- 回放输入：`Flow.nodes/edges`（`engine/scheduler.ts:279` 要求 DAG）
- 导致录制后无法直接回放，需要通过 Builder 转换

**类型定义位置**：
| 类型 | 旧定义 | 新定义 |
|------|--------|--------|
| Step/Action | `record-replay/types.ts:145` | `actions/types.ts:706` (AnyAction) |
| Flow | `record-replay/types.ts:251` (含 steps) | `actions/types.ts:831` (仅 nodes/edges) |
| Variable | `record-replay/types.ts:221` (key/default) | `actions/types.ts:145` (name/...) |

**受影响文件清单**：

使用旧 `Step` 的文件（15个）：

- `engine/plugins/types.ts`、`engine/runners/step-runner.ts`、`engine/runners/subflow-runner.ts`
- `engine/scheduler.ts`、`rr-utils.ts`
- `recording/session-manager.ts`、`recording/content-message-handler.ts`
- `recording/flow-builder.ts`、`recording/browser-event-listener.ts`
- `nodes/index.ts`、`nodes/types.ts`、`nodes/click.ts`、`nodes/navigate.ts`
- `nodes/conditional.ts`、`nodes/download-screenshot-attr-event-frame-loop.ts`

使用旧 `Flow` 的文件（12个）：

- Background: `index.ts`、`flow-store.ts`、`storage/indexeddb-manager.ts`
- Recording: `flow-builder.ts`、`recorder-manager.ts`、`session-manager.ts`
- Engine: `scheduler.ts`、`runners/step-runner.ts`、`plugins/types.ts`、`logging/run-logger.ts`
- UI: `builder/App.vue`、`builder/components/Sidebar.vue`

**迁移策略（推荐分阶段）**：

**P0: 先让录制产物可运行（最小改动）** ✅

- [x] 在 `flow-store.ts:saveFlow` 保存时，把 `steps` 转换为 DAG（新增 `packages/shared/src/rr-graph.ts:stepsToDAG`）
- [x] 确保保存的 flow 同时有 `steps` 和 `nodes/edges`（向后兼容）
- [x] 添加 `normalizeFlowForSave` 归一化函数，只在 nodes 缺失时补齐
- [x] 添加 `filterValidEdges` 校验旧 edges 有效性，避免 topoOrder 崩溃
- 涉及文件：`packages/shared/src/rr-graph.ts`、`flow-store.ts`

**P1: 存储层统一（单一真源）** ✅

- [x] `flow-store.ts` 读写逻辑适配新 Flow（P0 已完成）
- [x] `importFlowFromJson` 支持 4 种格式自动识别（数组、{flows:[]}、单 flow with steps、单 flow with nodes）
- [x] `ensureMigratedFromLocal()` 调用已添加到所有存储入口点（listFlows, getFlow, saveFlow 等）
- [x] `normalizeFlowForSave` 增加 edges 有效性校验（过滤指向不存在节点的边）
- 涉及文件：`flow-store.ts`、`trigger-store.ts`

**P2: 录制链路迁移 - 增量式 DAG 同步** ✅

采用"双写"方案：recorder.js 继续发送 Steps，background 在 `appendSteps` 时同步生成 nodes/edges。

- [x] `session-manager.ts:appendSteps` 增量生成 DAG
  - 新 step → 创建 node + edge（从前一个 node）
  - upsert step → 更新 node.config 和 node.type
  - 维护 session 级缓存：stepIndexMap、nodeIndexMap、edgeSeq
- [x] 不变式检查：nodes.length === steps.length 且 edges.length === max(0, steps.length-1) 且 last edge → last step
- [x] 违反不变式时 fallback 全量 `stepsToDAG` 重建
- [x] 类型安全：unknown step type 降级到 'script' 并输出警告日志
- [x] 契约测试：15 个测试覆盖 DAG 同步场景（`session-dag-sync.contract.test.ts`）
- 涉及文件：`recording/session-manager.ts`

##### P2 详细实现说明

**核心改动位置**: `app/chrome-extension/entrypoints/background/record-replay/recording/session-manager.ts`

**新增私有字段**:

```typescript
// Session-level caches for incremental DAG sync (cleared on session start/stop)
private stepIndexMap: Map<string, number> = new Map();  // stepId → 数组索引
private nodeIndexMap: Map<string, number> = new Map();  // nodeId → 数组索引
private edgeSeq: number = 0;  // 单调递增的 edge id 序号
```

**Session 生命周期管理**:

- `startSession()`: 清理所有缓存，调用 `rebuildCaches()` 初始化
- `stopSession()`: 清理所有缓存

**增量 DAG 同步逻辑** (`appendSteps` 方法):

```typescript
// 1. 初始化数组（如果缺失）
if (!Array.isArray(f.steps)) f.steps = [];
if (!Array.isArray(f.nodes)) f.nodes = [];
if (!Array.isArray(f.edges)) f.edges = [];

// 2. 检查不变式，违反则 fallback 全量重建
if (!this.checkDagInvariant(f.steps, nodes, edges)) {
  this.rebuildDag();
}

// 3. 处理每个 step
for (const step of steps) {
  if (this.stepIndexMap.has(step.id)) {
    // Upsert: 更新 node.config 和 node.type
    nodes[nodeIdx] = {
      ...nodes[nodeIdx],
      type: this.toNodeType(step.type),
      config: mapStepToNodeConfig(step),
    };
  } else {
    // Append: 创建 node + edge
    nodes.push({
      id: step.id,
      type: this.toNodeType(step.type),
      config: mapStepToNodeConfig(step),
    });
    if (prevStepId) {
      edges.push({
        id: `e_${this.edgeSeq++}_${prevStepId}_${step.id}`,
        from: prevStepId,
        to: step.id,
        label: EDGE_LABELS.DEFAULT,
      });
    }
  }
}

// 4. 最终不变式检查
if (needsRebuild || !this.checkDagInvariant(f.steps, nodes, edges)) {
  this.rebuildDag();
}
```

**不变式检查** (`checkDagInvariant` 方法):

```typescript
private checkDagInvariant(steps: Step[], nodes: NodeBase[], edges: Edge[]): boolean {
  const stepCount = steps.length;
  const expectedEdgeCount = Math.max(0, stepCount - 1);

  // 1. nodes 数量必须等于 steps 数量
  if (nodes.length !== stepCount) return false;

  // 2. edges 数量必须等于 steps.length - 1（线性链）
  if (edges.length !== expectedEdgeCount) return false;

  // 3. 最后一条 edge 必须指向最后一个 step
  if (edges.length > 0 && steps.length > 0) {
    const lastEdge = edges[edges.length - 1];
    const lastStepId = steps[steps.length - 1]?.id;
    if (lastEdge.to !== lastStepId) return false;
  }

  return true;
}
```

**类型安全** (`toNodeType` 方法):

```typescript
private toNodeType(stepType: string): NodeBase['type'] {
  if (VALID_NODE_TYPES.has(stepType)) {
    return stepType as NodeBase['type'];
  }
  console.warn(`[RecordingSession] Unknown step type "${stepType}", falling back to "script"`);
  return NODE_TYPES.SCRIPT;
}
```

**测试覆盖** (`tests/record-replay/session-dag-sync.contract.test.ts`):

- 首个 step 创建 node（无 edge）
- 后续 step 创建 node + edge
- 批量 step 正确链接
- upsert 更新 node config
- upsert 保留 edges
- 不变式处理（nodes 缺失、edges 缺失、edges 指向错误）
- session 生命周期（start/stop 清理缓存）
- 类型转换（有效类型、未知类型降级）
- edge id 唯一性和单调序列

**P3: 回放引擎适配** ✅

- [x] 实现核心 Action Handlers（navigate, click, dblclick, fill, wait）
  - `actions/handlers/common.ts` - 共享工具（selector转换、消息发送、元素验证）
  - `actions/handlers/navigate.ts` - 导航处理器
  - `actions/handlers/click.ts` - 点击/双击处理器
  - `actions/handlers/fill.ts` - 表单填充处理器
  - `actions/handlers/wait.ts` - 等待条件处理器
  - `actions/handlers/index.ts` - 注册入口（createReplayActionRegistry）
- [x] 类型安全改进
  - 使用泛型 `ActionHandler<T>` 确保类型一致
  - 添加 `sendMessageToTab` 封装避免 undefined frameId 错误
  - 使用 `SelectorCandidateSource`/`SelectorStability` 正确类型
- [x] Tool 调用统一传递 `tabId`，避免默认 active tab 歧义
- [x] 错误信息保留：解析 tool 返回的 error content
- [x] 扩展 Handlers：key, scroll, delay, screenshot
  - `actions/handlers/key.ts` - 键盘输入（支持目标聚焦）
  - `actions/handlers/scroll.ts` - 滚动（offset/element/container 三种模式）
  - `actions/handlers/delay.ts` - 延迟等待
  - `actions/handlers/screenshot.ts` - 截图（全页/元素/区域）
- [x] 完整 Handlers 实现（22个处理器）
  - `actions/handlers/assert.ts` - 断言（exists/visible/textPresent/attribute，支持轮询）
  - `actions/handlers/extract.ts` - 数据提取（selector/js 模式）
  - `actions/handlers/script.ts` - 自定义脚本（MAIN/ISOLATED world）
  - `actions/handlers/http.ts` - HTTP 请求（GET/POST/PUT/DELETE/PATCH）
  - `actions/handlers/tabs.ts` - 标签页（openTab/switchTab/closeTab/handleDownload）
  - `actions/handlers/control-flow.ts` - 控制流（if/foreach/while/switchFrame）
  - `actions/handlers/drag.ts` - 拖拽（start/end 目标，支持 path 坐标）
- [x] Scheduler 集成架构（详见下方）
- 涉及文件：`scheduler.ts`、`rr-utils.ts`、`step-runner.ts`、`actions/handlers/*`、`actions/adapter.ts`、`engine/execution-mode.ts`、`engine/runners/step-executor.ts`

##### Scheduler 集成 ActionRegistry 详细设计

**1. 适配层 (`actions/adapter.ts`)**

核心功能：Step ↔ Action 双向转换

```typescript
// 主要导出
export function stepToAction(step: Step): ExecutableAction | null;
export function execCtxToActionCtx(
  ctx: ExecCtx,
  tabId: number,
  options?: { stepId?: string; runId?: string; pushLog?: (entry: unknown) => void },
): ActionExecutionContext;
export function actionResultToExecResult(result: ActionExecutionResult): ExecResult;
export function createStepExecutor(
  registry: ActionRegistry,
): (ctx, step, tabId, options) => Promise<StepExecutionAttempt>;
export function isActionSupported(stepType: string): boolean;
export type StepExecutionAttempt =
  | { supported: true; result: ExecResult }
  | { supported: false; reason: string };
```

关键实现：

- **日志归因修复**：`execCtxToActionCtx` 接受 `stepId` 参数，确保日志正确归因到具体步骤
- **Selector Candidate 转换**：Legacy `{ type, value }` → Action `{ type, selector/xpath/text }`
  - css/attr → `{ type, selector }`
  - xpath → `{ type, xpath }`
  - text → `{ type, text }`
  - aria → 解析 `"role[name=...]"` 格式为 `{ type, role?, name }`
- **TargetLocator 转换**：保留 `ref`、`selector`（fast-path）、`tag`（hint）字段
- **二次转换保护**：`isLegacyTargetLocator` 精确检测，通过检查 candidate 是否有 `value` 字段来判断

**2. 执行模式 (`engine/execution-mode.ts`)**

```typescript
export type ExecutionMode = 'legacy' | 'actions' | 'hybrid';

export interface ExecutionModeConfig {
  mode: ExecutionMode;
  legacyOnlyTypes?: Set<string>; // 强制使用 legacy 的类型
  actionsAllowlist?: Set<string>; // 允许使用 actions 的类型
  logFallbacks?: boolean; // 是否记录回退日志
  skipActionsRetry?: boolean; // 跳过 ActionRegistry 重试
  skipActionsNavWait?: boolean; // 跳过 ActionRegistry 导航等待
}

// 已验证安全的类型（保守列表）
export const MIGRATED_ACTION_TYPES = new Set([
  'navigate',
  'click',
  'dblclick',
  'fill',
  'key',
  'scroll',
  'drag',
  'wait',
  'delay',
  'screenshot',
  'assert',
]);

// 需要更多验证的类型
export const NEEDS_VALIDATION_TYPES = new Set([
  'extract',
  'http',
  'script',
  'openTab',
  'switchTab',
  'closeTab',
  'handleDownload',
  'if',
  'foreach',
  'while',
  'switchFrame',
]);

// 必须使用 legacy 的类型
export const LEGACY_ONLY_TYPES = new Set([
  'triggerEvent',
  'setAttribute',
  'loopElements',
  'executeFlow',
]);
```

**3. 执行器抽象 (`engine/runners/step-executor.ts`)**

```typescript
export interface StepExecutorInterface {
  execute(ctx: ExecCtx, step: Step, options: StepExecutionOptions): Promise<StepExecutionResult>;
  supports(stepType: string): boolean;
}

export class LegacyStepExecutor implements StepExecutorInterface {
  /* 使用 nodes/executeStep */
}
export class ActionsStepExecutor implements StepExecutorInterface {
  /* 使用 ActionRegistry，strict 模式 */
}
export class HybridStepExecutor implements StepExecutorInterface {
  /* 先尝试 actions，失败回退 legacy */
}

export function createExecutor(
  config: ExecutionModeConfig,
  registry?: ActionRegistry,
): StepExecutorInterface;
```

**4. 导出更新 (`actions/index.ts`)**

```typescript
// 适配器导出
export {
  execCtxToActionCtx,
  stepToAction,
  actionResultToExecResult,
  createStepExecutor,
  isActionSupported,
  getActionType,
  type StepExecutionAttempt,
} from './adapter';

// Handler 工厂导出
export {
  createReplayActionRegistry,
  registerReplayHandlers,
  getSupportedActionTypes,
  isActionTypeSupported,
} from './handlers';
```

##### 后续接入步骤

**M1: 低风险接线（已完成 ✅）**

1. ✅ **修改 StepRunner 依赖注入 StepExecutorInterface**
   - `StepRunner` 现在通过注入的 `StepExecutorInterface.execute()` 调用
   - `Scheduler` 创建 `createExecutor(config)` 并注入到 `StepRunner`
   - 默认使用 `legacy` 模式，保持原有行为不变

2. ✅ **tabId 管理**
   - `ExecCtx` 已添加 `tabId?: number` 字段
   - `Scheduler` 从 `ensureTab()` 捕获 tabId 并传入 `ExecCtx`
   - `StepRunner` 优先使用 `ctx.tabId`，fallback 到 active tab 查询

3. ✅ **双重策略问题（设计决策 + 实现）**
   - retry/nav-wait 策略：`StepRunner` 作为权威
   - `ExecutionModeConfig.skipActionsRetry/skipActionsNavWait` 默认为 true
   - 实现机制：
     - `adapter.ts`: `skipRetry=true` 时移除 `action.policy.retry`
     - `adapter.ts`: `skipNavWait=true` 时设置 `ctx.execution.skipNavWait`
     - `click.ts/navigate.ts`: 检查 `ctx.execution?.skipNavWait` 跳过内部 nav-wait
   - 注意：ActionRegistry timeout 保留（提供 per-action 超时保护）

##### M1 详细实现说明

**修改文件清单**:
| 文件 | 改动内容 |
|------|----------|
| `nodes/types.ts` | `ExecCtx` 添加 `tabId?: number` 字段 |
| `engine/runners/step-executor.ts` | 实现 `StepExecutorInterface`、`LegacyStepExecutor`、`ActionsStepExecutor`、`HybridStepExecutor`、`createExecutor()` 工厂 |
| `engine/runners/step-runner.ts` | 构造函数接受 `StepExecutorInterface`，`executeNode()` 改为调用注入的执行器 |
| `engine/scheduler.ts` | `runFlow()` 创建执行器并注入到 `StepRunner` |

**StepExecutorInterface 定义**:

```typescript
export interface StepExecutionOptions {
  tabId: number;
  runId?: string;
  pushLog?: (entry: unknown) => void;
}

export interface StepExecutionResult {
  executor: 'legacy' | 'actions';
  result: ExecResult;
}

export interface StepExecutorInterface {
  execute(ctx: ExecCtx, step: Step, options: StepExecutionOptions): Promise<StepExecutionResult>;
  supports(stepType: string): boolean;
}
```

**执行器创建流程**:

```typescript
// scheduler.ts
const modeConfig = buildExecutionModeConfig(options);
const registry = modeConfig.mode !== 'legacy' ? createReplayActionRegistry() : undefined;
const stepExecutor = createExecutor(modeConfig, registry);
const runner = new StepRunner(stepExecutor /* ... */);
```

**M2: 可控启用 hybrid（已完成 ✅）**

1. ✅ **execution-mode.ts 新增最小 allowlist**
   - `MINIMAL_HYBRID_ACTION_TYPES`: fill/key/scroll/drag/wait/delay/screenshot/assert
   - 排除高风险类型（navigate/click/tab 管理）避免策略冲突
   - `createHybridConfig()` 默认使用最小 allowlist

2. ✅ **scheduler.ts 支持执行模式切换**
   - `RunOptions` 新增 `executionMode/actionsAllowlist/legacyOnlyTypes` 字段
   - `buildExecutionModeConfig()` 根据选项构建配置
   - 只在 hybrid/actions 模式下创建 `ActionRegistry`
   - 健壮性改进：只接受数组输入，防止误配置

3. ⏳ **openTab/switchTab 后同步更新 `ctx.tabId`**（M3 验证时完善）

**使用方式**:

```typescript
// 默认 legacy（不传 executionMode）
runFlow(flow, {});

// 启用 hybrid（最小 allowlist）
runFlow(flow, { executionMode: 'hybrid' });

// 自定义 allowlist
runFlow(flow, { executionMode: 'hybrid', actionsAllowlist: ['fill', 'key'] });

// 使用 MIGRATED_ACTION_TYPES（传空数组）
runFlow(flow, { executionMode: 'hybrid', actionsAllowlist: [] });
```

##### M2 详细实现说明

**修改文件清单**:
| 文件 | 改动内容 |
|------|----------|
| `engine/execution-mode.ts` | 新增 `MINIMAL_HYBRID_ACTION_TYPES`、`createHybridConfig()`、`createActionsOnlyConfig()` |
| `engine/scheduler.ts` | `RunOptions` 扩展、`buildExecutionModeConfig()` 实现 |

**MINIMAL_HYBRID_ACTION_TYPES 定义**:

```typescript
export const MINIMAL_HYBRID_ACTION_TYPES = new Set<string>([
  'fill', // 低风险：表单填充
  'key', // 低风险：键盘输入
  'scroll', // 低风险：滚动
  'drag', // 低风险：拖拽
  'wait', // 低风险：等待条件
  'delay', // 低风险：延迟
  'screenshot', // 低风险：截图
  'assert', // 低风险：断言
]);
// 排除高风险：navigate（导航）、click（点击）、tab 管理
```

**RunOptions 扩展**:

```typescript
export interface RunOptions {
  // ... existing fields
  executionMode?: ExecutionMode; // 'legacy' | 'hybrid' | 'actions'
  actionsAllowlist?: string[]; // 允许使用 actions 的类型（hybrid 模式）
  legacyOnlyTypes?: string[]; // 强制使用 legacy 的类型
}
```

**buildExecutionModeConfig 实现**:

```typescript
function buildExecutionModeConfig(options: RunOptions): ExecutionModeConfig {
  const mode = isExecutionMode(options.executionMode) ? options.executionMode : 'legacy';

  if (mode === 'hybrid') {
    const overrides: Partial<ExecutionModeConfig> = {};
    if (Array.isArray(options.actionsAllowlist)) {
      overrides.actionsAllowlist = toStringSet(options.actionsAllowlist);
    }
    if (Array.isArray(options.legacyOnlyTypes)) {
      overrides.legacyOnlyTypes = toStringSet(options.legacyOnlyTypes);
    }
    return createHybridConfig(overrides);
  }

  if (mode === 'actions') {
    return createActionsOnlyConfig();
  }

  return { ...DEFAULT_EXECUTION_MODE_CONFIG };
}
```

**M2.1: 双重策略问题修复（已完成 ✅）**

**问题描述**: StepRunner 和 ActionRegistry 都有 retry/nav-wait 逻辑，会导致双重等待。

**解决方案**: StepRunner 作为策略权威，ActionRegistry 的内部策略可被跳过。

**修改文件清单**:
| 文件 | 改动内容 |
|------|----------|
| `actions/types.ts` | 新增 `ExecutionFlags` 接口、`ActionExecutionContext.execution` 字段 |
| `actions/adapter.ts` | `StepExecutorOptions` 新增 `skipRetry/skipNavWait`，实现策略跳过逻辑 |
| `actions/handlers/click.ts` | 检查 `ctx.execution?.skipNavWait` 跳过导航等待 |
| `actions/handlers/navigate.ts` | 检查 `ctx.execution?.skipNavWait` 跳过导航等待 |

**ExecutionFlags 接口**:

```typescript
export interface ExecutionFlags {
  skipNavWait?: boolean; // 跳过 handler 内部的导航等待
}

export interface ActionExecutionContext {
  // ... existing fields
  execution?: ExecutionFlags;
}
```

**adapter.ts 策略跳过逻辑**:

```typescript
export interface StepExecutorOptions {
  runId?: string;
  pushLog?: (entry: unknown) => void;
  strict?: boolean;
  skipRetry?: boolean; // 移除 action.policy.retry
  skipNavWait?: boolean; // 设置 ctx.execution.skipNavWait
}

// 在 createStepExecutor 中
if (options?.skipRetry === true && action.policy?.retry) {
  action = { ...action, policy: { ...action.policy, retry: undefined } };
}
const execution: ExecutionFlags | undefined =
  options?.skipNavWait === true ? { skipNavWait: true } : undefined;
```

**click.ts/navigate.ts 检查**:

```typescript
const skipNavWait = ctx.execution?.skipNavWait === true;
if (skipNavWait) {
  return { status: 'success' }; // 跳过导航等待
}
// ... 正常导航等待逻辑
```

**P1.0: 存储层统一 - 迁移与导入（已完成 ✅）**

1. ✅ **启用 ensureMigratedFromLocal()**
   - `flow-store.ts`: 所有读写入口添加迁移 gate
   - `trigger-store.ts`: 所有读写入口添加迁移 gate
   - 迁移逻辑：从 chrome.storage.local 读取旧数据 → 写入 IndexedDB

2. ✅ **完善 importFlowFromJson()**
   - 支持 4 种格式：数组、{ flows }、单个 steps、单个 nodes-only
   - 更严格的字段验证（必须有 id）
   - 自动补齐 name/version/steps/meta 默认值

3. ✅ **edges 一致性校验**
   - `normalizeFlowForSave()` 在有 nodes 时也校验 edges
   - 移除引用不存在 node 的 edges，防止 scheduler 运行时错误

##### P1.0 详细实现说明

**修改文件清单**:
| 文件 | 改动内容 |
|------|----------|
| `flow-store.ts` | 所有函数添加 `await ensureMigratedFromLocal()`；重写 `importFlowFromJson()` |
| `trigger-store.ts` | 所有函数添加 `await ensureMigratedFromLocal()` |

**ensureMigratedFromLocal() 调用位置** (`flow-store.ts`):

```typescript
export async function listFlows(): Promise<Flow[]> {
  await ensureMigratedFromLocal(); // ← 添加
  const flows = await IndexedDbStorage.flows.list();
  // ...
}

export async function getFlow(flowId: string): Promise<Flow | undefined> {
  await ensureMigratedFromLocal(); // ← 添加
  // ...
}

export async function saveFlow(flow: Flow): Promise<void> {
  await ensureMigratedFromLocal(); // ← 添加
  // ...
}

// 同样: deleteFlow, listRuns, appendRun, listPublished, publishFlow, unpublishFlow,
//       exportFlow, exportAllFlows, importFlowFromJson, listSchedules, saveSchedule, removeSchedule
```

**importFlowFromJson 重写**:

```typescript
export async function importFlowFromJson(json: string): Promise<Flow[]> {
  await ensureMigratedFromLocal();
  const parsed = JSON.parse(json);

  // 支持 4 种格式
  const candidates: unknown[] = Array.isArray(parsed)
    ? parsed // 格式1: 数组
    : Array.isArray(parsed?.flows)
      ? parsed.flows // 格式2: { flows: [...] }
      : parsed?.id && (Array.isArray(parsed?.steps) || Array.isArray(parsed?.nodes))
        ? [parsed] // 格式3/4: 单个 flow (steps 或 nodes)
        : [];

  if (!candidates.length) {
    throw new Error('invalid flow json: no flows found');
  }

  // 验证和规范化每个 flow
  for (const raw of candidates) {
    const id = String(f.id || '').trim();
    if (!id) throw new Error('invalid flow json: missing id');

    // 自动补齐字段
    const name = typeof f.name === 'string' && f.name.trim() ? f.name : id;
    const version = Number.isFinite(Number(f.version)) ? Number(f.version) : 1;
    const steps = Array.isArray(f.steps) ? f.steps : [];
    // ...
  }

  // 保存（normalize on save）
  for (const f of flowsToImport) {
    await saveFlow(f);
  }

  return flowsToImport;
}
```

**normalizeFlowForSave edges 校验** (`flow-store.ts:50`):

```typescript
function normalizeFlowForSave(flow: Flow): Flow {
  const hasNodes = Array.isArray(flow.nodes) && flow.nodes.length > 0;
  if (hasNodes) {
    // 即使有 nodes，也校验 edges（处理导入/手动编辑的脏数据）
    const nodeIds = new Set(flow.nodes!.map((n) => n.id));
    if (Array.isArray(flow.edges) && flow.edges.length > 0) {
      const validEdges = filterValidEdges(flow.edges, nodeIds);
      if (validEdges.length !== flow.edges.length) {
        return { ...flow, edges: validEdges }; // 返回清理后的 flow
      }
    }
    return flow;
  }
  // ... 原有逻辑：从 steps 生成 nodes/edges
}

function filterValidEdges(edges: Edge[], nodeIds: Set<string>): Edge[] {
  return edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
}
```

**M3-core: 契约测试（已完成 ✅）**

1. ✅ **测试基础设施**
   - `tests/record-replay/_test-helpers.ts`: 工厂函数和 mock helpers
   - 使用 vitest + mock，不依赖真实浏览器

2. ✅ **adapter-policy.contract.test.ts** (7 tests)
   - `skipRetry` 移除 `action.policy.retry` 验证
   - `skipNavWait` 设置 `ctx.execution.skipNavWait` 验证
   - 组合 flags 验证

3. ✅ **step-executor.contract.test.ts** (20 tests)
   - `DEFAULT_EXECUTION_MODE_CONFIG` 契约
   - `createHybridConfig` / `createActionsOnlyConfig` 契约
   - `LegacyStepExecutor` 行为验证
   - `HybridStepExecutor` 路由验证
   - `createExecutor` 工厂验证
   - `MINIMAL_HYBRID_ACTION_TYPES` 内容验证

4. ✅ **session-dag-sync.contract.test.ts** (15 tests)
   - 首个 step 创建 node（无 edge）
   - 后续 step 创建 node + edge
   - 批量 step 正确链接
   - upsert 更新 node config / 保留 edges
   - 不变式处理（nodes 缺失、edges 缺失、edges 指向错误）
   - session 生命周期（start/stop 清理缓存）
   - 类型转换（有效类型、未知类型降级）
   - edge id 唯一性和单调序列

##### M3-core 详细实现说明

**测试文件清单**:
| 文件 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `tests/record-replay/_test-helpers.ts` | - | 工厂函数：`createMockExecCtx`、`createMockActionCtx`、`createMockStep`、`createMockFlow`、`createMockRegistry` |
| `tests/record-replay/adapter-policy.contract.test.ts` | 7 | adapter.ts 的 skipRetry/skipNavWait 策略跳过逻辑 |
| `tests/record-replay/step-executor.contract.test.ts` | 20 | execution-mode.ts 配置契约、step-executor.ts 执行器路由 |
| `tests/record-replay/session-dag-sync.contract.test.ts` | 15 | session-manager.ts 的增量 DAG 同步逻辑 |

**测试运行方式**:

```bash
pnpm test                                    # 运行所有测试
pnpm test tests/record-replay/               # 运行 record-replay 相关测试
```

**当前测试状态**: 197 个测试全部通过

**vitest mock 注意事项** (重要):

```typescript
// ❌ 错误：mock 函数定义在 vi.mock 外部会导致 hoisting 错误
const mockFn = vi.fn();
vi.mock('./module', () => ({ fn: mockFn }));

// ✅ 正确：mock 函数定义在 vi.mock 内部
vi.mock('./module', () => ({
  fn: vi.fn(async () => ({ status: 'success' })),
}));

// 获取 mock 引用
import { fn } from './module';
const mockFn = fn as ReturnType<typeof vi.fn>;
```

**\_test-helpers.ts 工厂函数**:

```typescript
// 创建最小 ExecCtx
export function createMockExecCtx(overrides: Partial<ExecCtx> = {}): ExecCtx {
  return { vars: {}, logger: vi.fn(), ...overrides };
}

// 创建最小 Step
export function createMockStep(type: string, overrides: Record<string, unknown> = {}): any {
  return {
    id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    ...overrides,
  };
}

// 创建 mock ActionRegistry
export function createMockRegistry(handlers: Map<string, any> = new Map()) {
  const executeFn = vi.fn(async () => ({ status: 'success' as const }));
  return {
    get: vi.fn((type: string) => handlers.get(type) || { type }),
    execute: executeFn,
    register: vi.fn(),
    has: vi.fn((type: string) => handlers.has(type)),
    _executeFn: executeFn, // 暴露给测试断言
  };
}
```

**M3-full: 完整集成测试（待实施）**

1. [ ] 在 hybrid 模式下验证各类型行为一致性
2. [ ] 特别关注：aria selector、script when:'after' defer、control-flow 条件求值
3. [ ] openTab/switchTab 后更新 ctx.tabId

**P4: 清理旧类型**

- [ ] 删除 `types.ts` 中的 `Step` 联合类型
- [ ] 删除 `Flow.steps` 字段
- [ ] 将旧类型移至 `legacy-types.ts`（如 UI 仍需要）

**风险点**：

- 类型同名冲突：两个 `Flow` 类型容易 import 错
- 变量结构不同：旧 `v.key/v.default` vs 新 `v.name/...`
- 子流程执行：`execute-flow.ts` 有 `flow.steps` fallback
- UI Builder 保存格式需同步适配

#### P0 Bug 修复详情 ✅

**fill 值不完整 (debounce/flush 时序冲突)**

问题：`INPUT_DEBOUNCE_MS=800` vs `BATCH_SEND_MS=100`，导致用户正在输入时 flush 发送不完整的值。

修复方案（`recorder.js`）：

- 添加 flush gate 机制：基于 `_lastInputActivityTs` 判断是否在输入中
- 添加 force flush timer：最多延迟 1500ms 强制 flush
- 添加 commit points：focusout、Enter 键、pagehide/visibilitychange 时立即 flush
- 修复 `_finalizePendingInput()`：使用 DOM 引用 `lastFill.el` 读取最新值
- 添加 `_getElementValue()` 严格模式：保护变量占位符不被覆盖
- iframe upsert 一致性：通过 postMessage 到 top frame 统一处理

**stop barrier 丢步骤 (iframe 最后步骤丢失)**

问题：stop 时 subframe ACK 可能在 top 处理完 postMessage 之前返回，导致 iframe 最后步骤丢失。

修复方案：

- `recorder-manager.ts`：
  - 先停 subframes（并发，1.5s 超时），再停 main frame（5s 超时）
  - 记录 barrier 元数据到 `flow.meta.stopBarrier`
- `recorder.js`：
  - 添加 `_finalizePendingClick()` 方法，在 flush 之前处理 pending click
  - 添加 `_syncStopBarrierToTop()` 方法：iframe 等待 top 处理完 postMessage 后再 ACK
  - `_detach()` 在 paused 状态保持 top 的 message listener
  - `_onWindowMessage` 处理 `iframeStopBarrier` 消息并回复 ACK
  - stop 时清除 isPaused 状态确保 barrier 一致性

#### Phase 2: locator 指纹验证 ✅

- [x] 更新 `shared/selector/locator.ts` - 添加指纹验证逻辑
  - 新增 `VERIFY_FINGERPRINT` 消息类型（`message-types.ts`）
  - 新增 `verifyElementFingerprint` 方法通过消息协议验证
  - 在 `locate()` 的 fast path 和 candidate 循环中添加指纹验证
  - 读取 `options.verifyFingerprint` 配置和 `target.fingerprint` 字段
- [x] 更新 `accessibility-tree-helper.js` - 添加 `verifyFingerprint` action 处理
- [ ] 抽取共用工具到 `shared/selector-core/` 供 web-editor-v2 复用（可选优化）

#### Phase 2-7: 后续阶段

- Phase 2: 录制系统重写
- Phase 3: 回放引擎重写
- Phase 4: Builder 重构
- Phase 5-7: 高级功能、iframe、测试

---

## 一、现状分析

### 1.1 架构现状

```
录制: recorder.js -> content-message-handler -> session-manager -> flow-store (steps格式)
回放: scheduler -> step-runner -> nodes/* (需要 nodes/edges 格式)
```

### 1.2 高严重度 Bug

| Bug                    | 位置                                                | 描述                                   | 状态      |
| ---------------------- | --------------------------------------------------- | -------------------------------------- | --------- |
| 数据格式不兼容         | `flow-builder.ts` / `scheduler.ts`                  | 录制产生 steps，回放需要 nodes/edges   | ✅ 已修复 |
| 变量丢失               | `recorder.js:609` / `content-message-handler.ts:18` | 变量只存本地，不传给 background        | ✅ 已修复 |
| 步骤丢失               | `recorder.js:584-594`                               | pause/stop/导航时未 flush 缓冲区       | ✅ 已修复 |
| fill 值不完整          | `recorder.js`                                       | debounce 800ms vs flush 100ms 时序冲突 | ✅ 已修复 |
| stop barrier 丢步骤    | `recorder-manager.ts` / `recorder.js`               | stop 时 iframe 最后步骤可能丢失        | ✅ 已修复 |
| trigger 无 handler     | `nodes/index.ts:58`                                 | UI 可用但运行时无执行器                | ✅ 已修复 |
| 选择器桥死锁           | `accessibility-tree-helper.js:1051`                 | iframe 通信无超时                      | ✅ 已修复 |
| Builder 保存丢失子流程 | `useBuilderStore.ts:392`                            | 编辑子流程时保存不会 flush             | ✅ 已修复 |

### 1.3 中严重度 Bug

| Bug                       | 位置                                     | 描述                          | 状态      |
| ------------------------- | ---------------------------------------- | ----------------------------- | --------- |
| pause/resume 状态不同步   | `recorder.js:476` / `session-manager.ts` | content 暂停，background 继续 | ✅ 已修复 |
| 双击产生多余点击          | `recorder.js:650`                        | click + dblclick 序列问题     |
| contenteditable 不录制    | `recorder.js:663-684`                    | focusin 支持但 input 不支持   |
| 跨 frame 消息无验证       | `recorder.js:577,1026`                   | postMessage('\*') 可被伪造    |
| saveFlow 异步无 await     | `recorder-manager.ts:45`                 | 异常不会被捕获                |
| waitForNetworkIdle 失效   | `step-runner.ts:88`                      | 始终调用 waitForNavigation    |
| wait helper 不支持 iframe | `wait.ts:23,36,57`                       | 只注入顶层 frame              |
| 模板替换不一致            | `wait.ts:12`, `assert.ts:19` 等          | 传 {} 而非 ctx.vars           |
| key 不聚焦目标            | `key.ts:10`                              | 忽略 target 字段              |
| script 忽略 frameId       | `script.ts:15`                           | 总在顶层执行                  |
| 运行统计错误              | `scheduler.ts:327,485`                   | 只统计默认边，不含分支        |
| 子流程忽略分支边          | `subflow-runner.ts:40`                   | defaultEdgesOnly              |

### 1.4 代码质量问题

- 大量 `any` 类型和类型断言
- 错误处理不完善（catch {} 吞掉错误）
- 状态分散在 content/background，无单一事实来源
- 选择器生成逻辑重复（recorder.js, accessibility-tree-helper.js, wait-helper.js）
- useBuilderStore 职责过多（状态、历史、布局、IO、子流程、变量分析）

### 1.5 架构问题

- 消息通信使用魔法字符串
- 无单元测试覆盖
- 强耦合 chrome.\* API，难以测试
- 内存泄漏风险：`__claudeElementMap` 只增不减

---

## 二、新架构设计

### 2.1 核心架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Flow Management Layer                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ FlowStore   │  │ FlowRunner  │  │ FlowEditor  │              │
│  │ (IndexedDB) │  │ (Scheduler) │  │ (Builder)   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    Core Engine Layer                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Recorder    │  │ Executor    │  │ Selector    │              │
│  │ Coordinator │  │ Engine      │  │ Engine      │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    Action Layer                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Action Registry (命令模式 - 所有可执行操作)               │    │
│  │ click | fill | navigate | scroll | wait | assert | ...  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    Content Scripts Layer                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Event       │  │ Action      │  │ Page        │              │
│  │ Capture     │  │ Executor    │  │ Inspector   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心数据结构

```typescript
// 统一的 Action 定义
interface Action {
  id: string;
  type: ActionType;
  config: Record<string, unknown>;
  target?: TargetLocator;
  // 执行选项
  timeout?: number;
  retry?: RetryConfig;
  onError?: ErrorHandling;
}

// Flow 始终使用 DAG 格式
interface Flow {
  id: string;
  name: string;
  version: number;
  // 主体结构
  nodes: FlowNode[];
  edges: FlowEdge[];
  // 变量系统
  variables: Variable[];
  // 子流程
  subflows?: Record<string, Subflow>;
  // 元数据
  meta: FlowMeta;
}

// 选择器候选列表
interface TargetLocator {
  candidates: SelectorCandidate[];
  frameSelector?: string; // iframe 选择器
  recordedAttributes?: Record<string, string>; // 录制时的元素属性快照
}

interface SelectorCandidate {
  type: 'testid' | 'aria' | 'css' | 'xpath' | 'text';
  value: string;
  confidence: number; // 0-100 稳定性评分
}
```

### 2.3 模块职责

| 模块                | 职责                               | 关键文件                          |
| ------------------- | ---------------------------------- | --------------------------------- |
| RecorderCoordinator | 录制生命周期管理、状态机、DAG 构建 | `recording/coordinator.ts`        |
| EventCapture        | 页面事件捕获、事件合并             | `inject-scripts/event-capture.ts` |
| ActionComposer      | 事件到 Action 转换、fill 合并      | `recording/action-composer.ts`    |
| ExecutorEngine      | 回放调度、DAG 遍历、错误处理       | `engine/executor.ts`              |
| ActionRegistry      | Action 执行器注册表                | `actions/registry.ts`             |
| SelectorEngine      | 统一选择器生成和定位               | `selector/engine.ts`              |
| FlowStore           | 持久化、版本管理                   | `storage/flow-store.ts`           |

---

## 三、重构任务拆解

### Phase 1: 基础架构 (P0)

#### 1.1 Action 系统重构

```
目录: app/chrome-extension/entrypoints/background/record-replay/actions/
```

- [ ] 创建 `types.ts` - Action 类型定义和接口
- [ ] 创建 `registry.ts` - Action 执行器注册表（命令模式）
- [ ] 迁移现有 nodes/_ 到 actions/_，统一接口
- [ ] 添加缺失的 Action: `trigger`, `delay`, `group`, `comment`
- [ ] 每个 Action 实现 `validate()`, `execute()`, `describe()` 方法

#### 1.2 选择器引擎统一

```
目录: app/chrome-extension/shared/selector/
```

- [ ] 创建 `strategies/` - 各种选择器策略
  - `testid.ts` - data-testid, data-cy 等
  - `aria.ts` - aria-label, role
  - `css-unique.ts` - 唯一 class 组合
  - `css-path.ts` - nth-of-type 路径
  - `text.ts` - 文本内容匹配
- [ ] 创建 `generator.ts` - 统一选择器生成
- [ ] 创建 `locator.ts` - 统一元素定位
- [ ] 删除重复代码: recorder.js, accessibility-tree-helper.js, wait-helper.js

#### 1.3 数据模型统一

```
文件: app/chrome-extension/entrypoints/background/record-replay/types.ts
```

- [ ] 定义 `Action`, `Flow`, `FlowNode`, `FlowEdge` 类型
- [ ] 定义 `Variable`, `TargetLocator`, `SelectorCandidate` 类型
- [ ] 移除过时的 `Step` 类型引用
- [ ] 更新 `packages/shared/src/step-types.ts` 同步

### Phase 2: 录制系统重写 (P0)

#### 2.1 RecorderCoordinator

```
文件: app/chrome-extension/entrypoints/background/record-replay/recording/coordinator.ts
```

- [ ] 实现状态机: `idle` -> `recording` -> `paused` -> `stopping` -> `idle`
- [ ] 实现 DAGFlowBuilder - 录制时直接构建 DAG
- [ ] 实现变量收集器 - 敏感值自动变量化
- [ ] 实现 Tab 管理 - 跨标签页录制支持

#### 2.2 EventCapture 重写

```
文件: app/chrome-extension/inject-scripts/event-capture.ts
```

- [ ] 重写事件监听（使用 TypeScript）
- [ ] 实现事件缓冲区，可靠的 flush 机制
- [ ] 修复 debounce/flush 时序问题（统一为 600ms）
- [ ] 实现 contenteditable 支持
- [ ] 实现安全的跨 frame 通信（验证 origin）

#### 2.3 ActionComposer

```
文件: app/chrome-extension/entrypoints/background/record-replay/recording/action-composer.ts
```

- [ ] 实现 fill 合并逻辑（同元素连续输入合并）
- [ ] 实现 scroll 合并逻辑（同方向滚动合并）
- [ ] 实现 click/dblclick 区分逻辑
- [ ] 添加 Action 描述生成（用于 UI 显示）

#### 2.4 录制 UI 改进

```
文件: app/chrome-extension/inject-scripts/recorder-ui.ts
```

- [ ] 重写录制浮层（TypeScript）
- [ ] 添加实时步骤预览
- [ ] 添加快捷键支持（暂停/继续/停止）
- [ ] 添加元素高亮改进（显示选择器信息）

### Phase 3: 回放引擎重写 (P0)

#### 3.1 ExecutorEngine

```
文件: app/chrome-extension/entrypoints/background/record-replay/engine/executor.ts
```

- [ ] 重写 DAG 遍历逻辑，支持分支和循环
- [ ] 实现执行上下文管理（变量、帧、Tab）
- [ ] 实现执行暂停/继续/单步调试
- [ ] 实现执行状态广播（实时进度）

#### 3.2 错误处理增强

```
文件: app/chrome-extension/entrypoints/background/record-replay/engine/error-handler.ts
```

- [ ] 实现失败截图捕获
- [ ] 实现控制台日志收集
- [ ] 实现智能重试（元素不可见则等待、超时则延长）
- [ ] 实现错误恢复策略配置

#### 3.3 等待策略完善

```
文件: app/chrome-extension/entrypoints/background/record-replay/engine/wait-policy.ts
```

- [ ] 实现 `waitForSelector` 支持 iframe
- [ ] 实现 `waitForNetworkIdle` 真正的网络空闲检测
- [ ] 实现 `waitForNavigation` 可靠的导航等待
- [ ] 添加超时配置和错误信息

### Phase 4: Builder 重构 (P1)

#### 4.1 Store 拆分

```
目录: app/chrome-extension/entrypoints/popup/components/builder/store/
```

- [ ] 拆分 `useBuilderStore.ts`:
  - `useFlowStore.ts` - Flow 数据管理
  - `useEditorStore.ts` - 编辑器状态
  - `useHistoryStore.ts` - 撤销/重做
  - `useLayoutStore.ts` - 画布布局
- [ ] 修复子流程保存问题（保存前 flush 当前子流程）

#### 4.2 选择器编辑器增强

```
文件: app/chrome-extension/entrypoints/popup/components/builder/widgets/SelectorEditor.vue
```

- [ ] 显示所有候选选择器，不仅是 CSS
- [ ] 添加选择器稳定性评分显示
- [ ] 添加实时元素验证
- [ ] 支持 iframe 选择器编辑

#### 4.3 属性面板优化

```
目录: app/chrome-extension/entrypoints/popup/components/builder/components/properties/
```

- [ ] 统一属性面板组件接口
- [ ] 添加配置验证和错误提示
- [ ] 添加高级选项折叠

### Phase 5: 高级功能 (P2)

#### 5.1 变量系统

- [ ] 实现变量定义 UI
- [ ] 实现运行时变量输入
- [ ] 实现敏感变量加密存储
- [ ] 实现变量从页面提取

#### 5.2 断言系统

- [ ] 增强断言类型（存在、可见、文本、属性、样式）
- [ ] 实现断言失败详情
- [ ] 实现软断言（失败继续执行）

#### 5.3 数据提取

- [ ] 实现 CSS 选择器提取
- [ ] 实现表格数据提取
- [ ] 实现列表数据提取
- [ ] 实现数据导出（JSON/CSV）

#### 5.4 触发器系统

- [ ] 完善 URL 触发器
- [ ] 完善定时触发器
- [ ] 完善右键菜单触发器
- [ ] 添加快捷键触发器

### Phase 6: iframe 支持 (P2)

#### 6.1 iframe 录制

- [ ] 检测 iframe 并注入录制脚本
- [ ] 实现跨 frame 事件上报
- [ ] 实现复合选择器生成（frame|>element）

#### 6.2 iframe 回放

- [ ] 实现 frame 定位和切换
- [ ] 修复 wait-helper frame 支持
- [ ] 实现复合选择器解析和执行

### Phase 7: 测试和文档 (P2)

#### 7.1 单元测试

```
目录: app/chrome-extension/tests/record-replay/
```

- [ ] 创建测试设置和 Chrome API mock
- [ ] 测试 ActionComposer（fill 合并、事件转换）
- [ ] 测试 SelectorEngine（选择器生成、定位）
- [ ] 测试 ExecutorEngine（DAG 遍历、错误处理）
- [ ] 测试 RecorderCoordinator（状态机、变量收集）

#### 7.2 集成测试

- [ ] 端到端录制回放测试
- [ ] 多标签页测试
- [ ] iframe 场景测试

---

## 四、关键文件清单

### 需要删除/重写的文件

- `inject-scripts/recorder.js` → 重写为 TypeScript
- `recording/session-manager.ts` → 合并到 coordinator.ts
- `recording/flow-builder.ts` → 重写，支持 DAG
- `engine/scheduler.ts` → 重写为 executor.ts

### 需要创建的文件

```
app/chrome-extension/
├── shared/
│   └── selector/
│       ├── strategies/
│       │   ├── testid.ts
│       │   ├── aria.ts
│       │   ├── css-unique.ts
│       │   ├── css-path.ts
│       │   └── text.ts
│       ├── generator.ts
│       └── locator.ts
├── inject-scripts/
│   ├── event-capture.ts
│   └── recorder-ui.ts
└── entrypoints/background/record-replay/
    ├── actions/
    │   ├── types.ts
    │   ├── registry.ts
    │   ├── click.ts
    │   ├── fill.ts
    │   ├── navigate.ts
    │   ├── trigger.ts
    │   ├── delay.ts
    │   └── ...
    ├── recording/
    │   ├── coordinator.ts
    │   └── action-composer.ts
    ├── engine/
    │   ├── executor.ts
    │   ├── error-handler.ts
    │   └── wait-policy.ts
    └── types.ts (统一类型定义)
```

### 需要修改的文件

- `entrypoints/popup/components/builder/store/useBuilderStore.ts` - 拆分
- `entrypoints/popup/components/builder/widgets/SelectorEditor.vue` - 增强
- `common/message-types.ts` - 添加新消息类型
- `entrypoints/background/record-replay/nodes/index.ts` - 迁移到 actions/

---

## 五、验收标准

### 功能验收

- [ ] 录制后立即可回放，无需手动转换
- [ ] 敏感输入自动变量化
- [ ] 回放失败时显示截图和详细错误
- [ ] 支持暂停/继续/单步调试
- [ ] 所有 Action 类型都有执行器

### 质量验收

- [ ] 无 any 类型（除第三方库接口）
- [ ] 所有错误有明确处理和用户反馈
- [ ] 核心模块单测覆盖率 > 80%
- [ ] 通过 TypeScript 严格模式检查

### 体验验收

- [ ] 录制启动 < 500ms
- [ ] 回放单步 < 100ms（不含等待）
- [ ] 选择器定位成功率 > 95%

---

## 六、参考资源

### Automa 值得借鉴的设计

- **命令模式**: 每个 Block 独立封装，易于测试和扩展
- **策略模式**: 动态加载 handler
- **状态机模式**: WorkflowState 管理执行状态
- **错误处理**: Block 级 + 工作流级 + 重试机制
- **Block 类型定义**: 50+ 种类型，分类清晰

### 关键 Automa 文件参考

- `other/automa/src/workflowEngine/WorkflowEngine.js` - 工作流引擎
- `other/automa/src/workflowEngine/WorkflowWorker.js` - Block 执行器
- `other/automa/src/content/services/recordWorkflow/recordEvents.js` - 录制事件
- `other/automa/src/utils/shared.js` - Block 类型定义

---

## 七、Phase 1.3 P3 新增/修改文件清单

> 本次实现的 22 个 Action Handlers + Scheduler 集成架构

### 新增文件

#### Action Handlers (`actions/handlers/`)

| 文件              | 功能                                                          | 行数 |
| ----------------- | ------------------------------------------------------------- | ---- |
| `common.ts`       | 共享工具（selector转换、消息发送、元素验证、SelectorLocator） | ~250 |
| `navigate.ts`     | 页面导航                                                      | ~80  |
| `click.ts`        | 点击/双击（click, dblclick）                                  | ~180 |
| `fill.ts`         | 表单填充                                                      | ~120 |
| `wait.ts`         | 等待条件（selector/text/navigation/networkIdle/sleep）        | ~180 |
| `key.ts`          | 键盘输入（支持目标聚焦）                                      | ~100 |
| `scroll.ts`       | 滚动（offset/element/container 三种模式）                     | ~150 |
| `delay.ts`        | 延迟等待                                                      | ~40  |
| `screenshot.ts`   | 截图（全页/元素/区域）                                        | ~100 |
| `assert.ts`       | 断言（exists/visible/textPresent/attribute，支持轮询）        | ~200 |
| `extract.ts`      | 数据提取（selector/js 模式）                                  | ~180 |
| `script.ts`       | 自定义脚本（MAIN/ISOLATED world）                             | ~240 |
| `http.ts`         | HTTP 请求（GET/POST/PUT/DELETE/PATCH）                        | ~220 |
| `tabs.ts`         | 标签页（openTab/switchTab/closeTab/handleDownload）           | ~300 |
| `control-flow.ts` | 控制流（if/foreach/while/switchFrame）                        | ~380 |
| `drag.ts`         | 拖拽（start/end 目标，支持 path 坐标）                        | ~260 |
| `index.ts`        | Handler 注册入口（createReplayActionRegistry）                | ~160 |

#### Scheduler 集成

| 文件                              | 功能                                           | 行数 |
| --------------------------------- | ---------------------------------------------- | ---- |
| `actions/adapter.ts`              | Step ↔ Action 适配层（类型转换、Selector转换） | ~350 |
| `engine/execution-mode.ts`        | 执行模式配置（legacy/actions/hybrid）          | ~160 |
| `engine/runners/step-executor.ts` | 执行器抽象（Legacy/Actions/Hybrid）            | ~200 |

### 修改文件

| 文件                  | 修改内容                         |
| --------------------- | -------------------------------- |
| `actions/registry.ts` | 添加 `tryResolveValue` 别名      |
| `actions/index.ts`    | 导出 adapter 和 handler 工厂函数 |

### 文件依赖关系

```
Scheduler (scheduler.ts)
    ↓
StepRunner (step-runner.ts)
    ↓ 当前直接调用 executeStep，后续改为注入 StepExecutorInterface
StepExecutorInterface (step-executor.ts)
    ├── LegacyStepExecutor → nodes/executeStep
    ├── ActionsStepExecutor → ActionRegistry.execute()
    └── HybridStepExecutor → 先 Actions，失败回退 Legacy
                ↓
        adapter.ts (stepToAction, execCtxToActionCtx)
                ↓
        ActionRegistry (registry.ts)
                ↓
        ActionHandlers (handlers/*.ts)
```

### 类型关系

```
Legacy Step (types.ts:145)
    ↓ stepToAction() + extractParams() + convertTargetLocator()
ExecutableAction (actions/types.ts:706)
    ↓ ActionRegistry.execute()
ActionExecutionResult (actions/types.ts)
    ↓ actionResultToExecResult()
ExecResult (nodes/types.ts)
```

### Selector 转换

```
Legacy SelectorCandidate { type, value, weight? }
    ↓ convertSelectorCandidate()
Action SelectorCandidate { type, selector/xpath/text/role+name, weight? }
    ↓ toSelectorTarget() (common.ts)
SharedSelectorTarget (shared/selector/types.ts)
    ↓ selectorLocator.locate()
Located Element { ref, frameId, resolvedBy }
```
