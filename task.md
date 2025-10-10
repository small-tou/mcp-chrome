## 录制回放 · 编排画布（Builder）落地进度

更新时间：2025-10-10

### 已完成（本次）

- 数据模型：在 `record-replay/types.ts` 扩展 `Flow`，新增可选 `nodes`/`edges`（Flow V2 结构），兼容线性 `steps[]`。
- 画布编辑器（M1 骨架）：新增 `popup/components/BuilderEditor.vue`，使用 VueFlow 渲染 DAG。
  - 节点库：click/fill/key/wait/assert/navigate/script/delay。
  - 画布：缩放/平移（VueFlow 内置）、网格吸附、拖拽、连线（默认单一出边）。
  - 属性面板：按节点类型编辑（选择器候选、fill 值、wait/assert/navigate/script）。
  - 互转：支持 steps→nodes（链式）与 nodes→steps（按 default 边拓扑），保存时同步覆盖 `steps[]` 以保证可立即回放。
- 集成入口：在 Popup 的“录制与回放”列表加入“画布编辑”按钮；保存沿用 `RR_SAVE_FLOW`。
- Runner 增强：`flow-runner.ts` 在检测到 `nodes/edges` 时，运行期进行 DAG→steps 线性化（按 default 边拓扑），复用现有线性执行与日志/截图机制。
- Builder 小增强：
  - 节点类型补充 key/delay 的默认配置、属性面板与摘要展示。
  - 快捷键：Delete/Backspace 删除选中；Cmd/Ctrl+D 复制；Cmd/Ctrl+S 保存。
  - 自动保存：节点/连线/名称变化 800ms 去抖自动保存，状态提示（保存中/已保存）。
  - 搜索定位：顶栏输入命中节点名或首个选择器，回车自动聚焦到节点并选中。
  - 新增节点类型与执行：
    - http（method/url/headers/body/saveAs），Runner 调用 NETWORK_REQUEST 并可保存 JSON 响应到变量。
    - extract（selector/attr/js/saveAs），Runner 在页面执行提取并保存变量。
    - openTab/switchTab/closeTab，Runner 分别创建新标签/切换标签/关闭标签（支持按 url/title 匹配）。
    - script 支持 saveAs/assign：执行返回值支持保存到变量；assign 支持点路径（a.b[0].c）映射多个变量。
  - 校验与提示：
    - 节点级校验（http/extract/switchTab/script 等必填/组合约束）与 UI 提示（字段红框+错误列表）。
    - 顶栏显示错误计数，便于定位问题。
  - 映射编辑器：KeyValueEditor 组件，用于 script/http 的 assign 键值映射编辑。
  - 从选中节点回放：Builder 顶栏支持从当前选中节点启动回放（传入 startNodeId）。
  - 错误列表面板：可展开全局错误列表，点击条目定位并聚焦到对应节点。
  - 快捷键补充：⌘/Ctrl+Z 撤销；⌘/Ctrl+Shift+Z 重做。
  - 自动排版与视图：一键自动排版（简单拓扑布局），自适应视图（fit view）。
  - 导出：Builder 顶栏直接导出 Flow JSON（保持与后台导出一致）。
  - 历史栈优化：限制最多 50 个快照，避免内存无限增长。
  - 字段级高亮：点击错误项可高亮并滚动到对应属性字段（PropertyPanel）。

### 目录结构与模块拆分

- 遵循组件聚合原则，将编辑器完整聚合在一个目录下：`popup/components/builder/`
  - `model/transforms.ts`：DAG/steps 互转、ID 生成、默认配置、拓扑排序、摘要。
  - `store/useBuilderStore.ts`：编辑器状态与操作（选择/新增/删除/连线/布局/导入导出）。
  - `components/{Canvas,Sidebar,PropertyPanel}.vue`：画布/节点库/属性面板子组件。

### 待安装依赖

- 画布基于 VueFlow：需要安装
  - `@vue-flow/core`
  - `@vue-flow/controls`
  - `@vue-flow/minimap`

### 下一步规划（短期）

1.  DAG 执行路径进行更细粒度控制（后续支持 true/false/onError 边），并补齐 http/extract/openTab/switchTab/closeTab 映射。
2.  画布体验升级：撤销/重做历史上限与压缩策略、MiniMap/Controls 配置、节点模板与样式。
3.  属性面板补齐更多节点（http/extract/openTab/switchTab/closeTab），并完善字段校验/提示。
4.  自动保存（去抖 ≥500ms）与版本快照；画布搜索与定位。

### 里程碑对齐（builder.prd.md）

- M1：画布基础 + 串行 DAG（当前已具备可用骨架，待 Runner DAG）
- M2：控制流（If/Else/While/ForEach）、OnError 分支、多标签完善（后续迭代）
- M3：并发与限流（后续迭代）

### 影响范围与兼容性

- 不破坏原有线性流程与回放；保存时同步 `steps[]`，可立即回放。
- 类型扩展仅新增可选字段，旧数据不受影响；导入导出将兼容两种结构。
