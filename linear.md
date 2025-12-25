# 渐变色编辑器优化重构任务拆解

## 背景

当前 `gradient-control.ts` 的渐变编辑功能存在以下限制：

- 仅支持 2 个固定的颜色停止点（hardcoded）
- 无可视化渐变条预览
- 无可拖拽的滑块 UI 来调整停止点位置
- 无法动态添加/删除停止点

目标是重构为类似专业设计工具（如 Figma、Sketch）的渐变编辑器体验。

---

## 实现进度总览

| Phase      | 状态      | 说明                                                                      |
| ---------- | --------- | ------------------------------------------------------------------------- |
| Phase 1-4E | ✅ 已完成 | 核心 UI 重构（数据结构、解析、预览条、Thumbs、Stops列表、ColorField绑定） |
| Phase 5    | ✅ 已完成 | Thumb 拖拽实现                                                            |
| Phase 6    | ✅ 已完成 | Add/Delete Stop 功能                                                      |
| Phase 7    | ✅ 已完成 | Position 输入编辑                                                         |
| Phase 8    | ✅ 已完成 | 清理旧代码路径（移除 stop1Row/stop2Row 等遗留代码）                       |
| Phase 9    | ✅ 已完成 | 边界情况与可访问性                                                        |

---

## 已完成的实现详情

### Phase 1-4E: 核心 UI 重构 ✅

#### 1. 数据结构重构

**新增类型定义** (`gradient-control.ts` 顶部):

```typescript
/** Unique identifier for a gradient stop (stable across reorder/edit) */
type StopId = string;

/** Model for a gradient stop with stable identity */
interface StopModel {
  id: StopId;
  color: string;
  position: number;
  /** Resolved/computed color for display when color contains var() */
  placeholderColor?: string;
}

/** Drag session state for thumb dragging */
interface ThumbDragSession {
  stopId: StopId;
  pointerId: number;
  initialPositions: Map<StopId, number>;
  thumbElement: HTMLElement;
}
```

**关键辅助函数**:

- `createStopId()` - 生成唯一 ID（优先使用 `crypto.randomUUID()`，fallback 到计数器）
- `toStopModels(stops)` - 将 `GradientStop[]` 转为 `StopModel[]`
- `reconcileStopModels(prevModels, newStops)` - 同步时保持 ID 稳定性（长度相同时复用旧 ID）
- `getStopPreviewColor(stop)` - 获取停止点的预览颜色（处理 `var()` 占位符）

#### 2. 解析逻辑更新

**N 停止点解析** (`parseLinearGradient`, `parseRadialGradient`):

- 修改为解析所有颜色停止点，而非仅前两个
- `normalizeStops()` 支持任意数量停止点，保证单调非递减的 position

**CSS 生成** (`buildGradientValue`, `formatStopList`):

- 支持输出任意数量停止点的渐变字符串

#### 3. DOM 结构

**新增 DOM 元素**:

```typescript
// 渐变预览条
const gradientBarRow = document.createElement('div');
gradientBarRow.className = 'we-gradient-bar-row';

const gradientBar = document.createElement('div');
gradientBar.className = 'we-gradient-bar';

const gradientThumbs = document.createElement('div');
gradientThumbs.className = 'we-gradient-bar-thumbs';

// Stops 列表
const stopsHeaderRow = document.createElement('div');
stopsHeaderRow.className = 'we-gradient-stops-header';

const stopsAddBtn = document.createElement('button');  // "+" 按钮

const stopsList = document.createElement('div');
stopsList.className = 'we-gradient-stops-list';

// 选中停止点的 ColorField
const selectedStopColorHost = document.createElement('div');
const selectedStopColorField = createColorField({ ... });
```

#### 4. 状态管理

```typescript
let currentStops: StopModel[] = createDefaultStopModels();
let selectedStopId: StopId | null = currentStops[0]?.id ?? null;
let thumbDrag: ThumbDragSession | null = null;
```

#### 5. CSS 样式 (`shadow-host.ts`)

新增的 CSS 类：

- `.we-gradient-bar-row` - 预览条容器行
- `.we-gradient-bar` - 渐变预览条（60px高，14px圆角，内阴影）
- `.we-gradient-bar-thumbs` - Thumbs 容器
- `.we-gradient-thumb` - 单个 Thumb（32px 圆角方块，白色描边）
- `.we-gradient-thumb--active` - 选中态（蓝色光环）
- `.we-gradient-bar--dragging` - 拖拽中的 cursor 样式
- `.we-gradient-stops-header` - Stops 标题行
- `.we-gradient-stops-list` - 停止点列表容器
- `.we-gradient-stop-row` - 单行停止点
- `.we-gradient-stop-row--active` - 选中行（蓝色边框）
- `.we-gradient-stop-position` - 位置列
- `.we-gradient-stop-color` - 颜色列
- `.we-gradient-stop-color-static` / `.we-gradient-stop-color-editor` - 静态显示/编辑态

---

### Phase 5: Thumb 拖拽实现 ✅

#### 实现要点

1. **Pointer Events API** - 跨设备支持（鼠标、触摸、笔）
2. **Pointer Capture** - 可靠追踪超出元素边界的移动
3. **`preserveThumbs` 选项** - 拖拽期间只更新 thumb 位置而不重建 DOM，保持 pointer capture
4. **Escape 取消** - 按 Escape 回滚到初始位置

#### 关键函数

```typescript
// 辅助函数
function setStopPositionById(stopId, position); // 更新停止点位置
function restoreStopPositions(snapshot); // 从快照恢复位置（Escape 回滚用）
function endThumbDrag(commit); // 结束拖拽（提交或回滚）
function calculatePositionFromPointer(clientX); // 计算指针对应的百分比位置

// 事件处理器
function handleThumbPointerDown(event); // 开始拖拽
function handleThumbPointerMove(event); // 拖拽中更新
function handleThumbPointerUp(event); // 结束并提交
function handleThumbPointerCancel(event); // 取消（如触摸中断）
function handleDragKeyDown(event); // Escape 键处理
```

#### 事件监听器配置

```typescript
// Window 级别 capture phase 监听器（避免 Shadow DOM 事件隔离）
const DRAG_LISTENER_OPTIONS = { capture: true, passive: false };
disposer.listen(window, 'pointermove', handleThumbPointerMove, DRAG_LISTENER_OPTIONS);
disposer.listen(window, 'pointerup', handleThumbPointerUp, DRAG_LISTENER_OPTIONS);
disposer.listen(window, 'pointercancel', handleThumbPointerCancel, DRAG_LISTENER_OPTIONS);
disposer.listen(window, 'keydown', handleDragKeyDown, DRAG_LISTENER_OPTIONS);
```

#### 重要细节

- **`pointerId` 过滤** - 多点触控时只响应初始触发的指针
- **`isPrimary` 检查** - 只响应主指针
- **重入保护** - `if (thumbDrag) return;` 防止重复启动拖拽
- **`previewGradient()` 更新** - 拖拽期间设置 `preserveThumbs: true`

---

### Phase 6: Add/Delete Stop 功能 ✅

#### 颜色插值系统

**新增类型和函数** (`gradient-control.ts` 约190-360行):

```typescript
interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

// 颜色解析
function parseHexColorToRgba(raw); // 解析 #RGB, #RGBA, #RRGGBB, #RRGGBBAA
function parseRgbColorToRgba(raw); // 解析 rgb()/rgba()（支持 legacy 和 modern 语法）
function parseRgbChannel(token); // 解析单个 RGB 通道（数字或百分比）
function parseAlphaChannel(token); // 解析 alpha 通道

// 颜色输出
function rgbaToCss(color); // RGBA → CSS 字符串（hex 或 rgba()）
function clampByte(value); // 限制到 [0, 255]
function toHexByte(value); // 转为 2 位 hex

// 插值
function lerpNumber(a, b, t); // 线性插值
function interpolateRgba(a, b, t); // RGBA 颜色插值
```

#### Add/Delete 核心函数

```typescript
// 隐藏探测元素（用于浏览器颜色解析）
const stopColorProbe = document.createElement('div');

// 辅助函数
function resolveCssColorToRgba(raw); // 解析任意 CSS 颜色（含 named colors）
function interpolateNewStopColor(position); // 计算插值颜色
function sortCurrentStopsByPosition(); // 保持数组按 position 排序
function syncLegacyStopFieldsFromModels(); // 同步遗留 stop1/stop2 字段
function getSuggestedAddStopPosition(); // 计算建议的新增位置（选中点与邻居的中点）
function pickClosestStopId(position); // 删除后选择最近的邻居

// 主要操作
function addStopAtPosition(position, opts); // 添加新停止点
function removeStopById(stopId); // 删除停止点（保证 ≥2 个）
function isTextInputLike(target); // 检查是否为文本输入
```

#### 交互方式

1. **点击 "+" 按钮** - 在选中停止点与邻居之间添加
2. **双击渐变条** - 在点击位置添加（忽略 thumb 上的双击）
3. **点击行内 "–" 按钮** - 删除该停止点
4. **Delete/Backspace 键** - 删除选中停止点（不在文本输入时）

#### 事件监听器

```typescript
// "+" 按钮
disposer.listen(stopsAddBtn, 'click', (event) => {
  addStopAtPosition(getSuggestedAddStopPosition(), { focusColor: true });
});

// 双击渐变条
disposer.listen(gradientBar, 'dblclick', (event) => {
  // 检查不是点在 thumb 上
  const path = event.composedPath();
  if (path.some((el) => el.classList?.contains('we-gradient-thumb'))) return;
  addStopAtPosition(calculatePositionFromPointer(event.clientX), { focusColor: true });
});

// Delete/Backspace
disposer.listen(root, 'keydown', (event) => {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return;
  if (isTextInputLike(event.target)) return;
  // 只在 stops UI 内生效
  const path = event.composedPath();
  if (!path.includes(stopsList) && !path.includes(gradientBar)) return;
  removeStopById(selectedStopId);
});
```

#### 重要细节

- **`sortCurrentStopsByPosition()`** - 每次 add/delete 后调用，保证 CSS 输出正确（CSS 渐变不会自动重排位置）
- **最少 2 个停止点约束** - `removeStopById` 检查 `currentStops.length <= 2` 时返回
- **选中状态管理** - 添加后选中新停止点；删除后选中最近的邻居
- **`focusColor` 选项** - 添加后自动聚焦颜色输入框

---

## 已完成任务

### Phase 7: Position 输入编辑 ✅

实现了 stops list 中的 position 可编辑功能：

- [x] 点击 position 区域可编辑（单例 `selectedStopPosInput` + host 复挂载模式）
- [x] 输入新值后更新模型和 UI（`setStopPositionById` + `previewGradient`）
- [x] 输入验证（0-100 范围，通过 `clampPercent` + `wireNumberStepping`）
- [x] Enter 提交，Escape 取消（`commitSelectedStopPosition` / `cancelSelectedStopPosition`）
- [x] commit-time 排序（`sortCurrentStopsByPosition`）
- [x] 聚焦 gating 防止列表重建打断编辑

### Phase 8: 清理旧代码路径 ✅

移除了所有遗留的 2-stop 硬编码：

- [x] 移除 `stop1Row`, `stop2Row` DOM 元素及 `createStopRow()` 函数
- [x] 移除 `stop1ColorValue`, `stop2ColorValue` 变量
- [x] 移除 `stop1ColorField`, `stop2ColorField` 及其 dispose
- [x] 移除 `stop1PosInput`, `stop2PosInput` 及其 wireNumberStepping/wireTextInput
- [x] 清理 `collectCurrentStops()` - 直接从 `currentStops` 读取
- [x] 删除 `syncLegacyStopFieldsFromModels()` 函数
- [x] 清理各函数中的 legacy 同步代码

### Phase 9: 边界情况与可访问性 ✅

实现了可访问性和边界情况处理：

- [x] Thumb 重叠时选中态置顶（z-index 层级：默认1, active 2, dragging 3）
- [x] Thumb slider ARIA 属性（role="slider", aria-valuemin/max/now/text, aria-orientation）
- [x] Thumb 方向键调整 position（ArrowLeft/Right/Up/Down 步进1，Shift 步进10）
- [x] Thumb keyboard session 管理（类似 drag session，支持 Escape 取消）
- [x] Stops list 方向键导航（ArrowUp/Down 切换选中行）
- [x] 防御式检查（handleThumbPointerDown 添加 disabled/none 状态检查）
- [x] Thumb focus/blur 事件处理（聚焦选中，blur 提交）

---

## 关键文件

| 文件                           | 说明               | 当前行数          |
| ------------------------------ | ------------------ | ----------------- |
| `controls/gradient-control.ts` | 主要重构文件       | ~2500 行          |
| `ui/shadow-host.ts`            | CSS 样式           | 新增约 200 行样式 |
| `controls/color-field.ts`      | 颜色选择器（复用） | 无修改            |

---

## 技术架构说明

### 状态管理流程

```
用户操作 → 更新 currentStops → previewGradient() →
  ├─ updateGradientBar() - 更新预览条和 thumbs
  ├─ updateStopsList() - 更新列表（可选跳过）
  └─ beginTransaction().set() - 实时预览到元素
```

### ID 稳定性

使用 `StopId` 而非数组索引来标识停止点，原因：

1. 拖拽/编辑时数组可能重排序
2. 选中状态需要跨操作保持
3. DOM 元素上的 `data-stop-id` 用于事件委托

### 事务管理

```typescript
beginTransaction(); // 开始编辑事务
previewGradient(); // 实时预览（调用 handle.set()）
commitTransaction(); // 提交到 undo stack
rollbackTransaction(); // 回滚（如 Escape 取消）
```

---

## Phase 10: 渐变色支持扩展 ✅

### 概述

将渐变色支持扩展到属性面板中所有使用颜色的地方，包括边框颜色和文字颜色。

### 实现详情

#### 10.1 gradient-control.ts 参数化

新增配置选项使 GradientControl 可复用：

```typescript
interface GradientControlOptions {
  // ... existing options
  property?: string; // CSS 属性，默认 'background-image'
  allowNone?: boolean; // 是否显示 None 选项，默认 true
}
```

- `property`: 用于 border-image-source 等非 background-image 场景
- `allowNone`: 用于 text gradient 场景（禁用 None 避免文字不可见）

#### 10.2 border-control.ts 渐变支持

**CSS 实现方案**: 使用 `border-image-source` + `border-image-slice: 1`

**UI 变更**:

- 新增 "Type" 选择器行（solid / gradient）
- gradient 模式下显示 GradientControl
- gradient 模式下锁定 Edge 为 "all"（border-image 不支持 per-edge）

**关键函数**:

- `inferBorderColorType()`: 从 border-image-source 推断颜色类型
- `setColorType()`: 使用 multiStyle 事务切换模式
- `updateEdgeSelectorState()`: gradient 模式下禁用 edge 选择

#### 10.3 typography-control.ts 渐变支持

**CSS 实现方案**: 使用 `background-image` + `-webkit-background-clip: text` + `-webkit-text-fill-color: transparent`

**UI 变更**:

- 新增 "Type" 选择器行（solid / gradient）
- gradient 模式下显示 GradientControl（allowNone: false）
- solid 模式下显示原有 ColorField

**关键函数**:

- `inferTextColorType()`: 检测 background-clip: text 模式
- `setTextColorType()`: 使用 multiStyle 事务切换模式
- `isGradientBackgroundValue()`: 检测渐变背景值
- `isTransparentTextFillColor()`: 检测透明文字填充色

**已知限制**:

- Text gradient 与 Background 控件共用 `background-image` 属性
- 同一元素不能同时使用 text gradient 和 element background
- 这是 CSS 本身的限制，在文档中已明确说明

### 技术要点

1. **multiStyle 事务**: 切换模式时原子设置多个相关属性
2. **refresh 重推断**: 处理外部变更（CSS 面板、Undo/Redo）
3. **dispose 管理**: 所有新增控件都正确注册 dispose

---

## 参考

- 参考图片: `linear.png`
- 现有代码: `gradient-control.ts`
- CSS 样式: `shadow-host.ts`
