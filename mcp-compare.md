# MCP Tools 对比分析报告

## 概览

本文档对比分析 `mcp-tools.js`（Claude 官方实现）与当前项目的 MCP tools 实现。

### 工具数量统计

| 来源                | 工具数量 | 说明                          |
| ------------------- | -------- | ----------------------------- |
| mcp-tools.js        | 20       | Claude 官方浏览器扩展实现     |
| 项目 ListTools 暴露 | 27       | TOOL_SCHEMAS 中定义的工具     |
| 项目已实现未暴露    | 8        | 实现存在但未在 ListTools 返回 |
| **项目总计**        | **35**   | 实际可调用的工具              |

---

## 一、工具对照映射表

| mcp-tools.js                       | 项目工具                                                 | 功能匹配度     |
| ---------------------------------- | -------------------------------------------------------- | -------------- |
| `navigate`                         | `chrome_navigate` + `chrome_go_back_or_forward`          | 完全覆盖       |
| `computer`                         | `chrome_computer`                                        | 项目更强       |
| `read_page`                        | `chrome_read_page`                                       | 各有优势       |
| `form_input`                       | `chrome_fill_or_select`(未暴露) / `chrome_computer.fill` | 项目更强       |
| `get_page_text`                    | `chrome_get_web_content`                                 | 项目更强       |
| `read_console_messages`            | `chrome_console`                                         | 各有优势       |
| `read_network_requests`            | `chrome_network_capture_*` + `chrome_network_debugger_*` | 项目更强       |
| `computer.screenshot`              | `chrome_screenshot` + `chrome_computer.screenshot`       | 项目更强       |
| `javascript_tool`                  | `chrome_inject_script`                                   | mcp-tools 更强 |
| `resize_window`                    | `chrome_computer.resize_page`                            | 项目更强       |
| `tabs_context/tabs_create`         | `get_windows_and_tabs` + `chrome_switch_tab`             | 各有优势       |
| `find`                             | **无**                                                   | 项目缺失       |
| `upload_image`                     | `chrome_upload_file`(部分)                               | mcp-tools 更强 |
| `gif_creator`                      | `chrome_gif_recorder`                                    | 完全覆盖       |
| `shortcuts_list/execute`           | **无**                                                   | 项目缺失       |
| `tabs_context_mcp/tabs_create_mcp` | **无**                                                   | 项目缺失       |
| `update_plan`                      | **无**                                                   | Claude 专用    |
| `turn_answer_start`                | **无**                                                   | Claude 专用    |

---

## 二、相同功能工具详细对比

### 1. Navigate（导航）

**工具对照**

- mcp-tools: `navigate` (`mcp-tools.js:1723`)
- 项目: `chrome_navigate` (`common.ts:23`) + `chrome_go_back_or_forward` (`common.ts:520`)

| 维度     | mcp-tools.js                                                        | 项目                            | 优胜                                                                           |
| -------- | ------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------ | -------- |
| 功能覆盖 | 支持 `url="back                                                     | forward"`                       | 支持 `refresh/newWindow/width/height/background/tabId/windowId`，复用同URL tab | **项目** |
| 代码质量 | 单文件实现，可维护性差                                              | TS + 模块化，参数结构清晰       | **项目**                                                                       |
| 安全性   | `permissionManager` + `verifyUrlSecurity` + `DomainCategoryService` | 无权限校验                      | **mcp-tools**                                                                  |
| 易用性   | back/forward 写进 url 字符串                                        | back/forward 独立工具，布尔参数 | **项目**                                                                       |
| 性能     | 直接操作，开销小                                                    | `chrome.tabs.query` 可能较重    | mcp-tools                                                                      |

**结论**: 功能和易用性项目更好，但**安全性是 mcp-tools 的核心优势**。

---

### 2. Computer（鼠标键盘操作）

**工具对照**

- mcp-tools: `computer` (`mcp-tools.js:2854`)
- 项目: `chrome_computer` (`computer.ts:198`)

| 维度     | mcp-tools.js                                                   | 项目                                                         | 优胜          |
| -------- | -------------------------------------------------------------- | ------------------------------------------------------------ | ------------- |
| 功能覆盖 | `zoom`(区域截图)、`scroll_to`、click `modifiers`、key `repeat` | `fill_form` 批量填表、`wait` 等待文本、`selector/xpath` 支持 | **项目**      |
| 代码质量 | 单 switch 大块逻辑                                             | 复用 `clickTool/fillTool/keyboardTool`，CDPHelper 封装       | **项目**      |
| 安全性   | 按 action 映射权限 + 域名变更校验                              | 坐标防漂移检查（域名变化拒绝旧坐标）                         | **mcp-tools** |
| 易用性   | 坐标为数组，参数靠字符串约定                                   | `coordinates: {x,y}` + `ref` + `selector/xpath`              | **项目**      |
| 性能     | CDP-first，一致性强                                            | DOM/content-script 优先，失败 fallback CDP                   | **项目**      |

**mcp-tools 独有能力值得集成**:

- `zoom`: 区域截图（放大某区域）
- `scroll_to`: 按 ref 滚动到元素
- `modifiers`: 点击时支持修饰键
- key `repeat`: 按键重复

**结论**: 项目整体更好，但 mcp-tools 的 `zoom`、`scroll_to`、`modifiers` 功能值得集成。

---

### 3. Read Page（页面读取）

**工具对照**

- mcp-tools: `read_page` (`mcp-tools.js:3675`)
- 项目: `chrome_read_page` (`read-page.ts:14`)

| 维度     | mcp-tools.js                            | 项目                                                | 优胜          |
| -------- | --------------------------------------- | --------------------------------------------------- | ------------- |
| 功能覆盖 | 支持 `depth` 和 `ref_id` 聚焦           | 返回结构化 JSON + `markedElements`，稀疏时 fallback | **各有优势**  |
| 代码质量 | 输出为大文本块                          | 输出结构化 + tips + marker 融合                     | **项目**      |
| 安全性   | READ_PAGE_CONTENT 权限 + tab group 限定 | 注入 allFrames，无权限控制                          | **mcp-tools** |
| 易用性   | depth/ref_id 控制输出规模               | JSON + tips + markedElements 适合自动决策           | **项目**      |

**商业级水准审查结果**：

当前实现**未达到商业级水准**，主要问题：

1. **输出结构不一致**：
   - 正常路径返回 `{pageContent, ...}`
   - fallback 返回 `{elements: [...], ...}`
   - 商业级应保持输出 shape 稳定

2. **缺少可控性**：
   - 不支持 `depth` 控制树深度
   - 不支持 `ref_id` 聚焦到特定节点

3. **可观测性不足**：
   - `stats`（durationMs/processed/included）已生成但未透出

4. **代码质量问题**：
   - `accessibility-tree-helper.js` 是多职责脚本（~1600行），维护成本高
   - 存在潜在 O(n²) 行为（遍历 `__claudeElementMap` 找匹配 ref）

**mcp-tools 独有能力值得集成**:

- `depth`: 控制树的深度
- `ref_id`: 聚焦到特定节点子树

**结论**: 项目结构化输出更好，需要提升到商业级（支持 depth/ref_id、stats 透出、输出结构统一）。

---

### 4. Form Input（表单填写）

**工具对照**

- mcp-tools: `form_input` (`mcp-tools.js:3803`)
- 项目: `chrome_fill_or_select` (未暴露) + `chrome_computer.fill/fill_form`

| 维度     | mcp-tools.js                     | 项目                                               | 优胜          |
| -------- | -------------------------------- | -------------------------------------------------- | ------------- |
| 功能覆盖 | checkbox/radio/range/select/text | 相同 + `selectorType='xpath'` + `fill_form` 批处理 | **项目**      |
| 代码质量 | 单文件完整                       | 工具类 + helper 脚本分离                           | **项目**      |
| 安全性   | 权限检查(TYPE) + 域名变更校验    | 无权限控制                                         | **mcp-tools** |
| 易用性   | ref/value                        | selector/xpath + 批处理                            | **项目**      |

**注意**: `chrome_fill_or_select` 未暴露在 TOOL_SCHEMAS，建议考虑暴露。

---

### 5. Get Page Text（内容提取）

**工具对照**

- mcp-tools: `get_page_text` (`mcp-tools.js:4052`)
- 项目: `chrome_get_web_content` (`web-fetcher.ts:16`)

| 维度     | mcp-tools.js                  | 项目                                             | 优胜          |
| -------- | ----------------------------- | ------------------------------------------------ | ------------- |
| 功能覆盖 | 基于选择器 + textContent 清洗 | `textContent/htmlContent/selector` + Readability | **项目**      |
| 代码质量 | 简单实现                      | 含 Readability 级别抽取                          | **项目**      |
| 安全性   | READ_PAGE_CONTENT 权限检查    | 无权限控制                                       | **mcp-tools** |
| 易用性   | 返回拼接字符串                | 结构化 JSON                                      | **项目**      |

**结论**: 项目明显更好。

---

### 6. Console（控制台日志）

**工具对照**

- mcp-tools: `read_console_messages` (`mcp-tools.js:4839`)
- 项目: `chrome_console` (`console.ts:58`)

| 维度     | mcp-tools.js                                | 项目                   | 优胜          |
| -------- | ------------------------------------------- | ---------------------- | ------------- |
| 功能覆盖 | 持续缓冲 + `pattern/onlyErrors/clear/limit` | 一次性快照（~2s 窗口） | **mcp-tools** |
| 安全性   | READ_CONSOLE_MESSAGES 权限检查              | 无权限控制             | **mcp-tools** |
| 易用性   | 格式化文本 + pattern 过滤                   | 结构化 JSON            | **项目**      |
| 性能     | 缓存最多 1e4 条/Tab，内存占用高             | 快照式，更轻量         | **项目**      |

**mcp-tools 独有能力值得集成**:

- 持续缓冲模式（可选）
- `pattern` 正则过滤
- `clear` 清空缓冲

**结论**: 两者定位不同，建议项目增加可选的持续缓冲模式。

---

### 7. Network（网络请求）

**工具对照**

- mcp-tools: `read_network_requests` (`mcp-tools.js:4986`)
- 项目: `chrome_network_capture_start/stop` + `chrome_network_debugger_start/stop`

| 维度     | mcp-tools.js                   | 项目                                              | 优胜          |
| -------- | ------------------------------ | ------------------------------------------------- | ------------- |
| 功能覆盖 | 只记录 url/method/status       | start/stop 模式、过滤静态/广告、responseBody 支持 | **项目**      |
| 安全性   | READ_NETWORK_REQUESTS 权限检查 | 降噪过滤为主                                      | **mcp-tools** |
| 易用性   | 直接 read                      | 需要 start/stop 工作流                            | **mcp-tools** |

**当前项目两个版本对比**：

| 版本       | API                 | 优势                              | 劣势                      |
| ---------- | ------------------- | --------------------------------- | ------------------------- |
| webRequest | `chrome.webRequest` | 不占 debugger，不与 DevTools 冲突 | **无法获取 responseBody** |
| Debugger   | CDP `Network.*`     | 能获取 responseBody（1MB 上限）   | DevTools 冲突时失败       |

**代码质量问题**：

- 广告域名列表不一致（webRequest 用共享常量，Debugger 硬编码）
- 返回数据结构差异大
- 大量重复代码（stop 逻辑、common headers 提取）

**结论**: 建议整合为统一接口，通过参数控制是否需要 responseBody。

---

### 8. Screenshot（截图）

**工具对照**

- mcp-tools: `computer.screenshot/zoom` (`mcp-tools.js:3637`, `mcp-tools.js:3274`)
- 项目: `chrome_screenshot` + `chrome_computer.screenshot`

| 维度       | mcp-tools.js                                | 项目                                             | 优胜          |
| ---------- | ------------------------------------------- | ------------------------------------------------ | ------------- |
| 功能覆盖   | viewport 截图 + `zoom` 区域截图 + `imageId` | fullPage stitch、元素截图、base64 压缩、下载保存 | **项目**      |
| 安全性     | 特殊页面限制 + 域名校验                     | 禁止 `chrome://` 页截图                          | 相当          |
| 配套工作流 | `imageId` → `upload_image`/`gif_creator`    | 无 imageId 桥接                                  | **mcp-tools** |

**mcp-tools 独有能力值得集成**:

- `zoom`: 区域放大截图

**关于 imageId**：mcp-tools 的 imageId 是从会话消息历史中引用图片 base64，**决策不采用此机制**（增加复杂度但收益有限）。

---

### 9. JavaScript 执行

**工具对照**

- mcp-tools: `javascript_tool` (`mcp-tools.js:5624`)
- 项目: `chrome_inject_script` (`inject-script.ts:23`)

| 维度     | mcp-tools.js              | 项目                                               | 优胜          |
| -------- | ------------------------- | -------------------------------------------------- | ------------- |
| 功能覆盖 | 执行并返回结果 + 输出脱敏 | 注入脚本但只返回 `{injected:true}`，需配合事件通信 | **mcp-tools** |
| 安全性   | 权限检查 + 输出脱敏       | `new Function(code)()` 风险更高                    | **mcp-tools** |
| 易用性   | 直接执行取值              | 需要注入后再触发事件                               | **mcp-tools** |

**当前事件通信机制的问题**：

- 注入脚本只返回 `{injected: true}`，不返回执行结果
- 需要额外调用 `send_command` 触发事件
- ISOLATED → MAIN world 的 postMessage 桥接增加复杂度

**改造方案**：使用 CDP `Runtime.evaluate` 直接执行并返回值，更可靠。

**结论**: 需要改造为 `javascript_tool`，实现执行并返回值 + 输出脱敏。

---

### 10. Tabs（标签页管理）

**工具对照**

- mcp-tools: `tabs_context/tabs_create/tabs_context_mcp/tabs_create_mcp`
- 项目: `get_windows_and_tabs` + `chrome_switch_tab` + `chrome_close_tabs`

| 维度     | mcp-tools.js                          | 项目                  | 优胜          |
| -------- | ------------------------------------- | --------------------- | ------------- |
| 功能覆盖 | MCP 会话隔离 tab group + 创建空白 tab | 全局枚举所有窗口/标签 | **各有优势**  |
| 安全性   | tab group 隔离减少误操作              | 全局能力，风险面大    | **mcp-tools** |
| 易用性   | 需遵循"先 context 再操作"流程         | 一次拿全量信息        | **项目**      |

**mcp-tools 独有能力值得集成**:

- `tabs_create`: 创建空白 tab
- MCP tab group 隔离概念（降低误操作风险）

---

## 三、mcp-tools.js 独有工具分析

以下工具在项目中完全没有对应实现：

### 1. `find` - 自然语言找元素 ⭐⭐⭐

**实现位置**: `mcp-tools.js:4210`

**工作原理**:

1. 注入执行 `window.__generateAccessibilityTree("all")` 获取可访问性树
2. 通过 `context.createAnthropicMessage` 调用 LLM (`modelClass:"small_fast"`, `maxTokens:800`)
3. 将 `searchQuery + pageContent` 拼进 prompt
4. 解析返回格式（FOUND/SHOWING/ref|...），最多返回 20 条

**价值**:

- 大幅降低"写 selector/ref"的门槛
- 把"从 a11y tree 里挑元素"做成专用子任务
- 减少主模型上下文负担

**风险**:

- 额外一次模型调用成本
- prompt 注入风险来自页面内容
- 解析对格式敏感

**集成建议**: ⭐⭐⭐ **高优先级**，非常实用的能力

---

### 2. `gif_creator` - GIF 录制 ⭐⭐⭐

**实现位置**: `mcp-tools.js:5243`

**工作原理**:

1. `GifRecorder` 按 tab group 存 frames，最多 50 帧
2. 在 `computer/navigate` 执行成功后自动截图
3. 导出时通过 `chrome.offscreen.createDocument` 生成 GIF
4. 支持下载或拖拽上传到页面

**价值**:

- 可审计的自动化回放
- bug 复现素材
- 演示/可观测性

**GIF 编码库推荐**：

- `gif.js`：成熟、支持 worker（mcp-tools 大概率使用）
- `gifenc`：更轻量，适合简单场景

**项目已有基础**：

- offscreen 基建已存在（`offscreen-manager.ts`）
- 截图能力已完善

**集成建议**: ⭐⭐⭐ **高优先级**，完全集成

---

### 3. `shortcuts_list/shortcuts_execute` - 工作流体系 ⭐⭐

**实现位置**: `mcp-tools.js:5976`, `mcp-tools.js:6015`

**工作原理**:

1. 列表从 `PermissionManager.getAllPrompts()` 获取 prompt registry
2. 执行时构造 `[[shortcut:<id>:<taskName>]]`，通过 sidepanel popup 执行

**价值**:

- 把复杂任务封装成高层能力复用
- 适合产品化

**安全注意**:

- promptData 带 `skipPermissions`，必须纳入权限域

**集成建议**: ⭐⭐ **中优先级**，需要配套权限体系

---

### 4. `tabs_context_mcp/tabs_create_mcp` - MCP 会话隔离 ⭐⭐

**实现位置**: `mcp-tools.js:5874`, `mcp-tools.js:5922`

**价值**:

- MCP 会话级 tab group 隔离与管理
- 显著降低误操作用户真实标签页的风险

**集成建议**: ⭐⭐ **中优先级**，需要架构调整

---

### 5. `update_plan/turn_answer_start` - Claude 专用交互 ⭐

**实现位置**: `mcp-tools.js:4496`, `mcp-tools.js:5609`

**说明**: Claude 客户端专用的交互/权限流程工具，对通用 MCP server 不一定适配。

**集成建议**: ⭐ **低优先级**，除非需要类似的计划审批流程

---

## 四、mcp-tools.js 权限模型分析

> **决策**: 权限模型先不集成

### 核心组件（供参考）

#### 1. `verifyUrlSecurity` - 域漂移防护

**位置**: `mcp-tools.js:353`

**原理**:

- 对比 `originalUrl` 与当前 `chrome.tabs.get(tabId).url` 的 `hostname`
- 不同则返回错误

**覆盖的高风险动作**:

- click (CDP 点击前)
- type
- form_input
- javascript_tool
- upload_image
- gif_creator export

#### 2. `DomainCategoryService` - 域名风险分类

**位置**: `mcp-tools.js:371-421`

**注意**: 会把访问域名发给第三方服务，不适合开源项目直接使用

#### 3. `permissionManager` - 可交互授权层

**主要接口**（从调用点反推）:

- `checkPermission(url, toolUseId)` → `{ allowed, needsPrompt }`
- `checkDomainTransition(oldDomain, newDomain)`
- `setForcePrompt(boolean)`

---

## 五、项目未暴露工具分析

### 未暴露原因分析

| 工具                                    | 状态        | 原因分析                        |
| --------------------------------------- | ----------- | ------------------------------- |
| `record_replay_flow_run/list_published` | Schema 注释 | 产品功能/稳定性/权限边界未定    |
| `chrome_userscript`                     | Schema 注释 | 持久化+跨站，风险极高           |
| `search_tabs_content`                   | Schema 注释 | 性能/隐私/初始化成本尚未产品化  |
| `chrome_click_element`                  | 无 Schema   | 作为 `chrome_computer` 内部组件 |
| `chrome_fill_or_select`                 | 无 Schema   | 作为 `chrome_computer` 内部组件 |
| `chrome_keyboard`                       | 无 Schema   | 作为 `chrome_computer` 内部组件 |
| `chrome_get_interactive_elements`       | 无 Schema   | 实验/半退役状态                 |

### 暴露建议

| 工具                                           | 建议              | 理由                                    |
| ---------------------------------------------- | ----------------- | --------------------------------------- |
| `chrome_userscript`                            | 继续不暴露        | 必须先补齐权限体系                      |
| `record_replay_*`                              | 继续不暴露        | 需要权限模型配套                        |
| `search_tabs_content`                          | 可选/feature-flag | 高级用户显式开启                        |
| `chrome_click_element/fill_or_select/keyboard` | **考虑暴露**      | 减少 chrome_computer 巨型 schema 的误用 |

---

## 六、集成任务计划

> 根据用户决策调整后的任务列表
>
> **状态说明**: ✅ 已完成 | 🔄 部分完成 | ⏳ 未开始

### 高优先级 (P0)

#### 任务 1: 整合 `chrome_navigate` 和 `chrome_go_back_or_forward` ✅ 已完成

**目标**: 简化工具数量，统一导航能力

**决策**: 采用 `url="back"|"forward"` 方案

**完成证据**:

- Schema 已声明 `url` 支持 `"back"|"forward"` (`packages/shared/src/tools.ts:392`)
- 实现已处理 back/forward 分支并调用 `chrome.tabs.goForward/goBack` (`common.ts:80-95`)

**涉及文件**:

- `app/chrome-extension/entrypoints/background/tools/browser/common.ts`
- `packages/shared/src/tools.ts`

**实现步骤**:

1. 在 `chrome_navigate` 中判断 `url` 参数是否为 `"back"` 或 `"forward"`
2. 如果是，调用 `chrome.tabs.goBack/goForward`
3. 复用现有的 `tabId/windowId/background` 参数逻辑
4. 更新 Schema 描述，说明 `url` 支持特殊值
5. 废弃 `chrome_go_back_or_forward` 工具

**预计改动**: ~50 行

---

#### 任务 2: `chrome_computer` 增强 - 集成 mcp-tools 独有能力 ✅ 已完成

**目标**: 增强交互能力

**完成情况**:

| 子任务       | 状态      | 说明                                                        |
| ------------ | --------- | ----------------------------------------------------------- |
| `scroll_to`  | ✅ 已完成 | Schema 已包含，实现走 `focusByRef` (`computer.ts:1060`)     |
| `modifiers`  | ✅ 已完成 | Schema 已暴露 (`tools.ts:246`)                              |
| key `repeat` | ✅ 已完成 | 已实现 (`computer.ts:950, 966`)                             |
| `zoom`       | ✅ 已完成 | 已实现，使用 `{x0,y0,x1,y1}` 格式（两角点表示矩形，更直观） |

**涉及文件**:

- `app/chrome-extension/entrypoints/background/tools/browser/computer.ts`
- `packages/shared/src/tools.ts`

**原计划实现步骤**:

**2.1 `scroll_to` (低复杂度)**

- 项目已有 `focusByRef` 实现（会 `scrollIntoView`）
- 只需新增 `action='scroll_to'` 并调用该消息

**2.2 `modifiers` (低复杂度)**

- 项目已有 `modifiers` 参数透传到 `click-helper.js`
- 只需暴露到 computer schema：`modifiers?: {altKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean}`

**2.3 key `repeat` (低复杂度)**

- 在现有 key 实现外加循环：`repeat?: number` (1-100)

**2.4 `zoom` (中复杂度)**

- 使用 CDP `Page.captureScreenshot` + `clip` 参数做区域截图
- 新增参数：`region?: {x: number, y: number, width: number, height: number}`

**预计改动**: ~150 行

---

#### 任务 3: `chrome_read_page` 提升到商业级 ✅ 已完成

**目标**: 支持 depth/ref_id、stats 透出、输出结构统一

**决策**: 先不支持 iframe

**完成证据**:

- Schema 已有 `depth/refId` 参数 (`tools.ts:167, 172`)
- 工具侧透传参数并抽取 stats、统一返回结构 (`read-page.ts:73, 85, 135`)
- Helper 支持 `maxDepth/refId` 并返回 `stats` (`accessibility-tree-helper.js:622, 669`)

**涉及文件**:

- `app/chrome-extension/entrypoints/background/tools/browser/read-page.ts`
- `app/chrome-extension/inject-scripts/accessibility-tree-helper.js`
- `packages/shared/src/tools.ts`

**原计划实现步骤**:

**3.1 新增参数**

```typescript
depth?: number;     // 控制树的最大深度
refId?: string;     // 聚焦到特定节点的子树
```

**3.2 透出 stats**

- helper 已生成 `stats: {processed, included, durationMs}`
- 在返回结果中包含 stats

**3.3 统一输出结构**

- 正常路径和 fallback 路径返回相同的 shape
- 建议统一为：

```typescript
{
  pageContent: string;      // 树文本
  elements?: Element[];     // fallback 时的元素列表
  stats: Stats;
  markedElements?: ...;
  tips?: string[];
}
```

**预计改动**: ~200 行

---

#### 任务 4: `chrome_console` 增强 ✅ 已完成

**目标**: 支持持续缓冲、正则过滤、清空

**完成证据**:

- 新增 `console-buffer.ts` 实现 ConsoleBuffer 单例，支持持续缓冲
- Schema 已添加 `mode/buffer/clear/pattern/onlyErrors/limit` 参数
- 支持 snapshot（默认）和 buffer 两种模式
- buffer 模式：即时读取内存，无需等待；支持正则过滤、清空、错误过滤、条数限制
- snapshot 模式：保持兼容，支持过滤功能
- 添加了 debugger 冲突的明确错误提示
- tab 关闭/域名变化时自动清理缓冲

**涉及文件**:

- `app/chrome-extension/entrypoints/background/tools/browser/console.ts`
- `packages/shared/src/tools.ts`

**实现步骤**:

1. 新增 `ConsoleBuffer` 单例按 tabId 缓存日志
2. 新增参数：
   ```typescript
   mode?: 'snapshot' | 'buffer';  // 默认 snapshot
   pattern?: string;               // 正则过滤
   clear?: boolean;                // 清空缓冲
   onlyErrors?: boolean;           // 只返回错误
   limit?: number;                 // 条数限制
   ```
3. buffer 模式下不再"等 2s"，直接读 Map
4. 处理 tab 关闭清理、域名变化清理

**注意**: debugger 冲突时返回明确错误提示

**预计改动**: ~200 行

---

#### 任务 5: 整合 Network Capture 工具 ✅ 已完成

**目标**: 统一接口，通过参数控制是否需要 responseBody

**完成情况**:

| 子任务            | 状态      | 说明                                                                         |
| ----------------- | --------- | ---------------------------------------------------------------------------- |
| webRequest 版抓包 | ✅ 已完成 | Schema 已增强，添加 maxCaptureTime/inactivityTimeout/includeStatic 参数      |
| Debugger 版抓包   | ✅ 已完成 | Schema 已增强，添加 maxCaptureTime/inactivityTimeout/includeStatic 参数      |
| 统一过滤配置      | ✅ 已完成 | 过滤配置已统一到 `constants.ts` 的 `NETWORK_FILTERS`                         |
| Schema 描述增强   | ✅ 已完成 | 明确说明两个工具的区别和使用场景                                             |
| **统一接口**      | ✅ 已完成 | 创建 `chrome_network_capture` 统一工具，通过 `needResponseBody` 参数选择后端 |

**最终实现**: 创建了统一的 `chrome_network_capture` 工具：

- **接口**: `action: 'start' | 'stop'` + `needResponseBody?: boolean`
- `needResponseBody=false`（默认）: 使用 webRequest API（轻量，不占用 debugger）
- `needResponseBody=true`: 使用 Debugger API（可以获取 response body）
- 原来的 4 个工具（`chrome_network_capture_start/stop`、`chrome_network_debugger_start/stop`）从 TOOL_SCHEMAS 移除，仅供内部使用

**涉及文件**:

- `app/chrome-extension/entrypoints/background/tools/browser/network-capture-web-request.ts`
- `app/chrome-extension/entrypoints/background/tools/browser/network-capture-debugger.ts`
- 新建 `app/chrome-extension/entrypoints/background/tools/browser/network-capture.ts`
- `packages/shared/src/tools.ts`

**实现步骤**:

1. 创建统一的 `chrome_network_capture_start/stop` 接口
2. 新增参数：`needResponseBody?: boolean` (默认 false)
3. `needResponseBody=false` 时使用 webRequest API
4. `needResponseBody=true` 时使用 Debugger API
5. 统一过滤配置到 `common/constants.ts`
6. 抽象公共逻辑（生命周期管理、common headers 提取）
7. 统一返回数据结构

**预计改动**: ~300 行（含重构）

---

#### 任务 6: 新增 `chrome_javascript` 工具 ✅ 已完成

**目标**: 实现执行并返回值 + 输出脱敏

**完成证据**:

- 新建 `javascript.ts` 实现 `chrome_javascript` 工具
- 新建 `output-sanitizer.ts` 实现输出脱敏和限长
- 使用 CDP `Runtime.evaluate` + `awaitPromise` + `returnByValue` 执行
- Debugger 冲突时自动 fallback 到 `chrome.scripting.executeScript`（ISOLATED world）
- 输出脱敏：cookie/token/password/JWT/Bearer token 等敏感信息
- 输出限长：默认 50KB，支持 `maxOutputBytes` 参数
- 超时处理：默认 15s，支持 `timeoutMs` 参数
- 详细的错误分类：syntax_error/runtime_error/timeout/debugger_conflict/cdp_error/scripting_error
- Schema 已添加到 TOOL_SCHEMAS

**涉及文件**:

- 新建 `app/chrome-extension/entrypoints/background/tools/browser/javascript.ts`
- 新建 `app/chrome-extension/utils/output-sanitizer.ts`
- `app/chrome-extension/entrypoints/background/tools/browser/index.ts`
- `packages/shared/src/tools.ts`

**注意**: 保留了原有的 `chrome_inject_script` 工具用于复杂脚本注入场景

---

### 中优先级 (P1)

#### 任务 7: 实现 `gif_creator` GIF 录制 ✅ 已完成

**目标**: 可审计的自动化回放

**完成证据**:

- 新建 `app/chrome-extension/entrypoints/background/tools/browser/gif-recorder.ts` 实现 `chrome_gif_recorder` 工具
- 新建 `app/chrome-extension/entrypoints/offscreen/gif-encoder.ts` 实现 offscreen GIF 编码
- 新建 `app/chrome-extension/types/gifenc.d.ts` 类型声明
- 更新 `message-types.ts` 添加 GIF_ADD_FRAME/GIF_FINISH/GIF_RESET 消息类型
- 使用 `gifenc` 库进行 GIF 编码（rgb444 颜色量化）
- 使用 CDP `Page.captureScreenshot` 进行帧捕获
- 支持 `action: 'start' | 'stop' | 'status'` 操作
- 可配置 fps（1-30）、durationMs（最长60s）、maxFrames（最多300帧）
- 可配置输出尺寸（width/height）和颜色数（maxColors）
- 自动保存 GIF 文件到下载目录
- URL 安全限制（禁止录制 chrome://、webstore 等特殊页面）
- 使用 setTimeout 递归调度避免帧捕获积压
- 复用 offscreenManager 和 createImageBitmapFromUrl 等现有工具
- CDP 会话管理：启动时 attach，停止时 detach

**涉及文件**:

- 新建 `app/chrome-extension/entrypoints/background/tools/browser/gif-recorder.ts`
- 新建 `app/chrome-extension/entrypoints/offscreen/gif-encoder.ts`
- 新建 `app/chrome-extension/types/gifenc.d.ts`
- `app/chrome-extension/common/message-types.ts`
- `app/chrome-extension/entrypoints/offscreen/main.ts`
- `app/chrome-extension/entrypoints/background/tools/browser/index.ts`
- `packages/shared/src/tools.ts`

---

#### 任务 8: 实现 `find` 自然语言找元素 ❌ 暂不实现

**目标**: 降低选择器门槛，提升易用性

**决策**: 暂不实现，因为需要额外的 LLM 调用架构支持，且当前 `chrome_read_page` 已提供足够的元素信息

**原因**:

- 需要确定 LLM 调用架构（native-server 侧 or 扩展侧）
- 额外的模型调用成本
- 当前工具集已能满足基本需求

---

### 低优先级 (P2)

#### 任务 9: 暴露细粒度交互工具 ✅ 已完成

**目标**: 减少 `chrome_computer` 的复杂度

**完成证据**:

| 子任务                   | 状态      | 说明                                                                |
| ------------------------ | --------- | ------------------------------------------------------------------- |
| click/fill/keyboard 实现 | ✅ 已存在 | `interaction.ts:33, 173`, `keyboard.ts:21`，已在 browser tools 导出 |
| Schema 暴露给 MCP 客户端 | ✅ 已完成 | 已在 `TOOL_SCHEMAS` 中添加完整的 Schema 定义                        |

**涉及文件**:

- `packages/shared/src/tools.ts`

**新增 Schema**:

- `chrome_click_element`: 支持 selector/xpath/ref/coordinates/modifiers/double click/button 等
- `chrome_fill_or_select`: 支持 selector/xpath/ref/value (string/number/boolean)
- `chrome_keyboard`: 支持 keys/selector/delay 等

**使用建议**: 对于简单的点击、填表、键盘操作，优先使用这些细粒度工具而非 `chrome_computer`

---

## 七、总结

### mcp-tools.js 的核心优势

1. **完善的权限模型**: 多层防护设计，适合不完全可信的场景
2. **`find` 自然语言找元素**: 大幅降低使用门槛
3. **`imageId` 截图上传闭环**: 无文件系统依赖的完整工作流
4. **`javascript_tool` 执行返回值**: 调试能力更强
5. **`gif_creator`**: 可审计的自动化回放

### 项目的核心优势

1. **更强的功能覆盖**: 网络抓包、性能分析、批量填表等
2. **更好的代码质量**: TS 模块化、清晰的参数结构
3. **更强的易用性**: 结构化输出、selector/xpath 支持
4. **更好的工程实践**: DOM 优先、fallback CDP

### 集成优先级总结

| 优先级 | 任务                                                   | 状态        | 预计收益 | 预计改动 |
| ------ | ------------------------------------------------------ | ----------- | -------- | -------- |
| P0     | 整合 navigate + go_back_or_forward                     | ✅ 已完成   | 简化工具 | ~50 行   |
| P0     | chrome_computer 增强 (scroll_to/modifiers/repeat/zoom) | ✅ 已完成   | 交互能力 | ~150 行  |
| P0     | chrome_read_page 商业级 (depth/ref_id/stats)           | ✅ 已完成   | 可控性   | ~200 行  |
| P0     | chrome_console 增强 (buffer/pattern/clear)             | ✅ 已完成   | 调试能力 | ~200 行  |
| P0     | 整合 network capture (needResponseBody)                | ✅ 已完成   | 统一接口 | ~300 行  |
| P0     | chrome_javascript 工具                                 | ✅ 已完成   | 调试能力 | ~250 行  |
| P1     | gif_creator                                            | ✅ 已完成   | 可观测性 | ~400 行  |
| P1     | find 自然语言找元素                                    | ❌ 暂不实现 | 易用性   | ~300 行  |
| P2     | 暴露细粒度工具                                         | ✅ 已完成   | 易用性   | ~50 行   |

**完成统计**:

- ✅ 已完成: 8/9 (89%)
- ❌ 暂不实现: 1/9 (11%) - find

**已决策不采用**：

- imageId 机制（增加复杂度但收益有限）
- 权限模型（先不集成）

---

## 八、与 mcp-tools.js 的差异点

> 以下为核验后发现的具体差异，供后续优化参考

### 1. `chrome_javascript` 差异

| 维度     | mcp-tools.js                  | 项目实现                         | 影响          |
| -------- | ----------------------------- | -------------------------------- | ------------- |
| CDP 执行 | `Runtime.evaluate`            | `Runtime.evaluate`               | ✅ 一致       |
| 输出脱敏 | cookie/token/JWT/Base64/Hex   | 同等覆盖                         | ✅ 一致       |
| 输出限长 | 50KB 固定                     | 50KB 默认，可配 `maxOutputBytes` | ✅ 项目更灵活 |
| 超时     | 10s 固定                      | 15s 默认，可配 `timeoutMs`       | ⚠️ 默认值不同 |
| 返回结构 | 含 `tabContext.availableTabs` | 无 tab 列表                      | 不需要        |
| 参数契约 | `action/text`                 | `code`                           | ⚠️ 接口不兼容 |

### 2. `chrome_gif_recorder` 差异

| 维度         | mcp-tools.js                                                                       | 项目实现                                                | 影响                          |
| ------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------- |
| actions      | `start_recording/stop_recording/export/clear`                                      | `start/stop/status/auto_start/capture/clear/export`     | ⚠️ 命名不同，项目功能更多     |
| 坐标参数     | `coordinate: [x, y]` 数组                                                          | `coordinates: {x, y}` 对象                              | ⚠️ 接口不兼容                 |
| 拖拽上传     | 支持                                                                               | 支持，额外支持 `ref/selector`                           | ✅ 项目更强                   |
| overlays     | `showClickIndicators/showDragPaths/showActionLabels/showProgressBar/showWatermark` | `enhancedRendering` 含 clickIndicators/dragPaths/labels | ⚠️ 缺少 progressBar/watermark |
| quality 参数 | 支持 (1-30)                                                                        | 不支持                                                  | ❌ 缺失                       |
| stop 补末帧  | 明确补最后一帧                                                                     | 不补                                                    | ❌ 行为差异                   |
| 作用域       | 按 tab group 隔离                                                                  | 单例缓存                                                | ⚠️ 架构差异                   |

### 3. `chrome_console` 差异

| 维度         | mcp-tools.js    | 项目实现                             | 影响        |
| ------------ | --------------- | ------------------------------------ | ----------- |
| 持续缓冲     | 支持            | 支持                                 | ✅ 一致     |
| pattern 过滤 | 支持            | 支持                                 | ✅ 一致     |
| clear        | 读后清空        | 读前 `clear` + 读后 `clearAfterRead` | ✅ 项目更细 |
| onlyErrors   | 支持            | 支持                                 | ✅ 一致     |
| limit        | 支持            | 支持                                 | ✅ 一致     |
| buffer 容量  | 10000 msgs/tab  | 2000 msgs + 500 exceptions/tab       | ⚠️ 容量较小 |
| 返回结构     | 含 `tabContext` | 无                                   | ❌ 缺失     |

### 4. `chrome_computer` 差异

| 子功能        | mcp-tools.js                          | 项目实现                                 | 影响                    |
| ------------- | ------------------------------------- | ---------------------------------------- | ----------------------- |
| **zoom**      | `region: [x0,y0,x1,y1]` 数组          | `region: {x0,y0,x1,y1}` 对象             | ⚠️ 接口不兼容           |
| zoom 返回     | `base64Image` + `imageFormat: "png"`  | `base64Data` + `mimeType: "image/png"`   | ⚠️ 字段命名不同         |
| zoom 坐标     | 直接用 viewport 坐标                  | 用 `pageX/pageY` 做滚动偏移修正          | ⚠️ 行为差异，项目更准确 |
| **scroll_to** | 通过 `getElementCoordinates` 返回坐标 | 直接 `focusByRef` 不返回坐标             | ⚠️ 返回值差异           |
| **modifiers** | `modifiers: "ctrl+shift"` 字符串      | `modifiers: {ctrlKey, shiftKey...}` 对象 | ⚠️ 接口不兼容           |
| **repeat**    | 仅 key action                         | 仅 key action                            | ✅ 一致                 |
| **hover**     | ref 会先 scrollIntoView               | ref 仅 getBoundingClientRect             | ⚠️ 行为差异             |

### 5. Network Capture 差异

| 维度     | mcp-tools.js | 项目实现                                               | 影响            |
| -------- | ------------ | ------------------------------------------------------ | --------------- |
| 统一开关 | 无           | 未实现 `needResponseBody` 统一开关                     | ⚠️ 保持两套工具 |
| 过滤配置 | 统一         | ~~Debugger 版未复用 `NETWORK_FILTERS` 常量~~ ✅ 已修复 | ✅ 代码一致     |

---

## 九、后续优化建议

### 已完成 ✅

1. **Network 过滤配置统一**：Debugger 版已复用 `NETWORK_FILTERS` 常量，修复了 `facebook.com/tr` 匹配 bug
2. **GIF stop 补末帧**：与 mcp-tools 行为一致，确保录制完整性
3. **Computer hover scrollIntoView**：ref/selector 路径现在会先滚动元素到视口中心再 hover
4. **Console 透出 dropped 计数**：buffer 模式返回 `droppedMessageCount/droppedExceptionCount`

### 中优先级（待定）

5. **Console buffer 容量扩大**：考虑从 2000 提升到 5000（需根据实际溢出情况决定）
6. **GIF 增加 quality 参数**：控制输出质量和文件大小

### 低优先级（接口兼容性）

7. **tabContext 返回**：javascript/console 等工具增加 availableTabs 返回
8. **zoom/modifiers 接口**：当前对象形式更 TS 友好，暂不调整
