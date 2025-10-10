# 模块 C — 编排画布（Builder）PRD v1.0

版本：v1.0（参考 Automa，兼容现有 Record & Replay）  
状态：Ready for Design  
负责人：产品/前端架构

## 0. 现状与定位（与录制回放的关系）

- 现状：已具备“录制 → 线性步骤（steps[]）→ 回放/发布”的闭环；回放统一复用 MCP 工具（chrome\_\*），并支持变量、失败截图、网络片段等。
- 定位：本编排画布是“录制回放模块的可视化编辑层”。
  - 录制完成的工作流可“导入画布”进行二次编排与参数化；
  - 也支持在画布里“从零拖拽节点”新建工作流；
  - 保存后仍与已有回放/发布/定时/导入导出机制完全打通（同一存储与执行通道）。
- 目标用户路径（高频）：录制草稿 → 打开画布调整/补空 → 保存 → 回放验证 → 发布为 MCP 动态工具/配置定时 → 运营。

## 1. 背景与目标

- 背景：现有线性 steps[] 能覆盖大多数串行场景，但难以表达条件、循环、并发、多标签切换等复杂流程；编辑体验也不利于可视化理解与协作。
- 目标：提供“节点 + 连线”的可视化编排画布（DAG），在保持与线性模式完全兼容的前提下，一步到位地支撑复杂业务流程的创建、调试与运行。
- 价值：
  - 降低复杂自动化的心智负担（所见即所得）。
  - 增强流程表达力（条件/循环/分支/子流程/并发）。
  - 与 MCP 工具层打通，形成可沉淀、可分享、可重放的企业级资产。

## 2. 范围与非范围

- 范围（MVP/M1）：
  - 画布编辑：节点拖拽、连线、选择、移动、缩放、对齐、撤销/重做、自动保存。
  - 节点类型（基础动作）：click/fill/key/wait/assert/navigate/script/openTab/switchTab/closeTab/delay/extract/http。
  - 属性面板：每个节点的配置编辑（选择器候选、变量/占位符、等待/断言、超时/重试、保存为变量等）。
  - 变量系统：全局 variables 与节点产出保存（saveAs/assign），字符串字段支持占位符 `{var}`。
  - 执行：无条件边时按拓扑串行执行；步骤失败截图与日志；OnError 可选（stop/continue/retry）。
  - 兼容：线性 steps[] 自动映射为链式 DAG；DAG 缺省时沿用线性模式。
  - 导入/导出/发布为 MCP 动态工具（沿用现有机制，Schema 由变量推导）。
  - 来源与入口：
    - 来源：① 录制得到的 steps 一键转化为 DAG（链式）；② 画布新建（拖拽节点）；③ JSON 导入；
    - 入口：Popup 的“录制与回放”列表进入“编辑”；录制完成弹出“前往画布编辑”。
- 非范围（M1 之外）：
  - 高级控制流：If/Else、While/Until、ForEach（并发度控制）、OnError 分支（M2）。
  - 数据集（Dataset）/可视化 JSON 映射器/凭据库/表达式引擎（M2/M3）。
  - 团队协作、多用户并发编辑与权限（后续版本）。

## 3. 用户与关键场景

- 用户：运营/测试/开发/数据标注人员。
- 关键场景：
  1. 登录并进入后台 → 根据条件决定分支 → 下载报告（click/fill/wait/assert/navigate/http）。
  2. 批量表单填充 → 提交失败重试 → 记录成功项（foreach/delay/assert/saveAs）。
  3. 爬取分页数据 → 提取字段到变量/数据集 → 导出 JSON/CSV（extract/http/脚本处理）。

## 4. 端到端流程（闭环）

- 从录制到编排：

  1. 开始录制（Popup）→ 页面内浮层反馈与事件捕获 → 停止录制；
  2. 生成 Flow 草稿（steps[]）→ 提示“前往画布编辑”；
  3. 画布自动将 steps 链式映射为 nodes/edges → 在属性面板完善：选择器候选优先级、等待/断言、变量占位、saveAs/assign；
  4. 保存 Flow（同一存储键），可导出 JSON。

- 从零拖拽到回放：

  1. 画布中新建 → 从节点库拖入基础节点，连线构建链路；
  2. 在属性面板配置选择器/变量/等待/断言/脚本等 → 保存；
  3. 回放验证（可选择 “当前/新标签”、“起始 URL”）→ 查看日志与失败截图 → 调整后再次保存。

- 发布与定时：
  1. Flow 发布为 MCP 动态工具（flow.<slug>），输入 Schema 由 variables + 运行选项生成；
  2. 可配置定时执行（interval/daily/once），执行结果写入运行记录；
  3. 运行失败时截图与错误节点高亮，支持导出/导入迁移。

## 5. 功能需求（FR）

- 画布交互（FR-BLD-001~010）

  - FR-BLD-001 画布基础：缩放/平移、对齐网格、吸附对齐、迷你地图。
  - FR-BLD-002 节点库：从侧边栏拖入节点、复制/粘贴、批量选择、删除。
  - FR-BLD-003 连线：连接/断开、自动修复、避免自环；边标签（默认/true/false/onError 预留）。
  - FR-BLD-004 属性面板：点选节点后右侧编辑配置；校验并提示错误。
  - FR-BLD-005 撤销/重做/自动保存；版本与恢复点（简版）。
  - FR-BLD-006 搜索与定位：按节点名/类型/变量引用查找并高亮。
  - FR-BLD-007 从节点开始调试（M2）；单步/断点（M3）。
  - FR-BLD-008 兼容线性：steps↔DAG 双向转换（线性自动生成链式图）。
  - FR-BLD-009 运行入口：整流回放/从选中开始回放；日志与失败截图联动高亮。
  - FR-BLD-010 导入导出：JSON（带 nodes/edges/variables/meta）。

- 节点与属性（FR-BLD-011~030）

  - FR-BLD-011 click/fill/key/wait/assert/navigate/script/delay：与线性动作参数一致。
  - FR-BLD-012 openTab/switchTab/closeTab：多标签编排基础动作。
  - FR-BLD-013 http（GET/POST/...）：可保存响应字段到变量（M1 可选若已有工具）。
  - FR-BLD-014 extract：按 selector/属性/文本/正则/JS 抽取，saveAs 到变量。
  - FR-BLD-015 重试策略：count/intervalMs/backoff。
  - FR-BLD-016 超时/失败策略：stop/continue/retry；失败截图开关。
  - FR-BLD-017 选择器候选与优先级：ref/css/attr/aria/text/xpath；回退记录与提示。
  - FR-BLD-018 变量系统：全局 variables；字符串字段支持 `{var}`。脚本/HTTP 支持 assign。
  - FR-BLD-019 运行选项：tabTarget/startUrl/refresh/captureNetwork/returnLogs/timeoutMs。
  - FR-BLD-020 节点命名/备注/标签；节点分组与折叠（M2）。

- 执行与日志（FR-BLD-031~040）
  - FR-BLD-031 DAG 执行：无条件边时顺序拓扑执行；失败按策略处理。
  - FR-BLD-032 日志：节点级耗时/状态/错误信息；失败截图；网络片段（可选）。
  - FR-BLD-033 上下文：vars/outputs；saveAs/assign 写入；回放后返回 summary/outputs/logs。
  - FR-BLD-034 绑定校验：不匹配时拒绝或需 startUrl；与当前绑定规则一致。

## 6. 数据模型（导出/存储）

- 兼容 Flow V1：`steps[]` 不变。
- 新增 Flow V2：
  - `nodes: NodeBase[]`、`edges: Edge[]`、`subflows?: Record<string,{nodes;edges}>`。
  - NodeBase：`{ id,type,name?,disabled?,config?,ui? }`；Edge：`{ id,from,to,label? }`（label 预留 default/true/false/onError）。
  - 变量：与现有 `variables[]` 统一；字符串字段支持 `{var}`；脚本/HTTP 支持 assign 映射到 vars。

## 7. 验收标准

- 线性流程自动转 DAG，回放结果与线性一致（10 次成功率 ≥ 95%）。
- 画布可稳定编辑 200+ 节点；撤销/重做可靠；保存/导出/导入无损。
- 失败报告包含失败截图与错误节点高亮；用户 1 分钟内定位问题。
- 节点回退/选择器提示清晰，编辑器可直接调整优先级并保存。

## 8. 性能与非功能需求（NFR）

- 画布交互：常见 200 节点保持流畅（60fps 优先级次之，确保不卡顿）。
- 执行性能：单节点默认等待 ≤ 10s；并发/循环在 M2 引入；全局并发上限与限流可配置。
- 稳定性：10 步基准用例回放成功率 ≥ 95%。
- 安全与隐私：敏感变量不落盘；导出不含敏感值；CSP 兼容；权限最小化。

## 9. 里程碑

- M1（画布基础 + 串行 DAG）
  - 画布/节点库/连线/属性面板/撤销重做/自动保存；基础节点（click/fill/key/wait/assert/navigate/script/delay/extract/http\*）；
  - DAG 执行（无条件边，串行拓扑）；线性兼容；日志/截图/变量；导入导出/发布。
- M2（控制流与多标签）
  - If/Else/While/ForEach；OnError 分支；openTab/switchTab/closeTab 完善；从节点开始调试；节点分组/折叠；数据集/凭据（可选）。
- M3（并发与限流）
  - foreach 并发、全局并发上限/域级限流；表达式/JSONPath 映射器；高级调试与监控。

---

注：节点与工具的映射严格复用现有 MCP 工具（chrome\_\*），减少新增复杂度并保证稳定性。

## 10. 成功指标（KPI）

- 20 分钟内：从录制到画布编排再到首次成功回放（≥ 80% 用户）。
- 稳定性：基准 10 步流程回放成功率 ≥ 95%，并在页面小改动（文案/结构微调）下仍 ≥ 90%。
- 工具化：发布为 MCP 工具后，十次调用成功率 ≥ 95%，参数缺失可被 Schema 友好提示。
- 编辑效率：200+ 节点画布交互不卡顿（≥ 30 fps）；撤销/重做成功率 100%。
