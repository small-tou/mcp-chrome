# WebSocket Bridge 改造文档

## 目录

- [概述](#概述)
- [架构设计](#架构设计)
- [改造内容](#改造内容)
- [使用指南](#使用指南)
- [API 文档](#api-文档)
- [迁移指南](#迁移指南)
- [配置说明](#配置说明)
- [故障排查](#故障排查)

## 概述

### 改造背景

本次改造将 Chrome 扩展从 Native Messaging 通信方式改为 WebSocket 连接，主要目的：

1. **支持远程服务器**: 不再局限于本地 Native Messaging Host，可以连接到远程 Bridge 服务器
2. **多实例管理**: 实现基于实例 ID 的多实例管理机制，支持多个 AI agent 同时使用
3. **网页触发**: 允许 AI agent 通过网页直接触发扩展事件并控制浏览器
4. **更好的扩展性**: WebSocket 提供更灵活的通信方式，便于未来功能扩展

### 改造范围

- ✅ Chrome 扩展端：移除 Native Messaging，改用 WebSocket 客户端
- ✅ Bridge 服务器端：添加 WebSocket 服务器，支持多实例管理
- ✅ 消息路由：实现基于实例 ID 的消息路由机制
- ✅ 网页集成：提供网页端通信脚本，供 AI agent 调用

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Agent (Web Page)                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  web-agent-bridge.js                                 │  │
│  │  - registerInstance()                                │  │
│  │  - getInstanceId()                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                        │                                    │
│                        │ chrome.runtime.sendMessage         │
│                        ▼                                    │
└─────────────────────────────────────────────────────────────┘
                          │
                          │
┌─────────────────────────────────────────────────────────────┐
│              Chrome Extension (Background)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  external-messaging.ts                               │  │
│  │  - 处理网页消息                                       │  │
│  │  - 实例注册                                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                        │                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  instance-manager.ts                                  │  │
│  │  - 生成实例ID                                         │  │
│  │  - 注册到服务器                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                        │                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  websocket-client.ts                                  │  │
│  │  - WebSocket连接                                      │  │
│  │  - 消息发送/接收                                      │  │
│  │  - 重连机制                                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                        │                                    │
│                        │ WebSocket                          │
│                        ▼                                    │
└─────────────────────────────────────────────────────────────┘
                          │
                          │
┌─────────────────────────────────────────────────────────────┐
│              Bridge Server (Remote)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  websocket-server.ts                                  │  │
│  │  - WebSocket服务器                                    │  │
│  │  - 连接管理                                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                        │                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  instance-manager.ts                                  │  │
│  │  - 实例ID映射                                         │  │
│  │  - 连接管理                                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                        │                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  message-router.ts                                   │  │
│  │  - 消息路由                                          │  │
│  │  - 工具调用转发                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                        │                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MCP Server                                          │  │
│  │  - 工具注册                                          │  │
│  │  - 工具调用                                          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 数据流

#### 实例注册流程

```
1. 网页调用 window.__chromeMcpWebAgentBridge.registerInstance()
   ↓
2. 扩展 external-messaging.ts 接收消息
   ↓
3. instance-manager.ts 生成实例ID
   ↓
4. websocket-client.ts 连接WebSocket服务器
   ↓
5. 通过WebSocket发送 INSTANCE_REGISTER 消息
   ↓
6. 服务器 instance-manager.ts 注册实例
   ↓
7. 服务器返回 INSTANCE_REGISTERED 响应
   ↓
8. 扩展返回实例ID给网页
```

#### 工具调用流程

```
1. MCP客户端调用工具（传入instanceId）
   ↓
2. Bridge服务器 message-router.ts 路由消息
   ↓
3. 根据instanceId找到对应的WebSocket连接
   ↓
4. 通过WebSocket发送 CALL_TOOL 消息到扩展
   ↓
5. 扩展 native-host.ts 处理工具调用
   ↓
6. 执行工具并返回结果
   ↓
7. 通过WebSocket发送 CALL_TOOL_RESPONSE 响应
   ↓
8. Bridge服务器返回结果给MCP客户端
```

## 改造内容

### 1. 共享类型定义

**文件**: `packages/shared/src/websocket-types.ts`

定义了所有 WebSocket 消息类型：

- `WebSocketMessageType`: 消息类型枚举
- `WebSocketMessage`: 基础消息接口
- `InstanceRegisterRequest/Response`: 实例注册消息
- `CallToolRequest/Response`: 工具调用消息
- `ProcessDataRequest/Response`: 数据请求消息
- 等等...

### 2. Chrome 扩展端

#### 2.1 WebSocket 客户端

**文件**: `app/chrome-extension/entrypoints/background/websocket-client.ts`

**功能**:
- WebSocket 连接管理
- 自动重连机制（指数退避）
- 心跳机制（保持连接活跃）
- 消息队列（连接断开时缓存消息）
- 请求-响应映射
- 消息监听器机制

**主要函数**:
```typescript
// 连接WebSocket服务器
export async function connect(): Promise<boolean>

// 断开连接
export function disconnect(): void

// 检查连接状态
export function isConnected(): boolean

// 发送消息（不等待响应）
export function sendMessage(message: WebSocketMessage): void

// 发送请求并等待响应
export function sendRequest<T>(message: WebSocketMessage, timeoutMs?: number): Promise<T>

// 注册消息监听器
export function addMessageListener(type: WebSocketMessageType, listener: MessageListener): void

// 移除消息监听器
export function removeMessageListener(type: WebSocketMessageType, listener: MessageListener): void

// 初始化WebSocket客户端
export function initWebSocketClient(): void
```

#### 2.2 实例管理器

**文件**: `app/chrome-extension/entrypoints/background/instance-manager.ts`

**功能**:
- 生成唯一实例ID
- 向服务器注册实例
- 管理实例状态

**主要函数**:
```typescript
// 注册实例到服务器
export async function registerInstance(): Promise<string>

// 注销实例
export async function unregisterInstance(): Promise<void>

// 获取当前实例ID
export function getCurrentInstanceId(): string | null

// 检查实例是否已注册
export function isInstanceRegistered(): boolean

// 更新实例活动时间
export function updateInstanceActivity(): void

// 初始化实例管理器
export function initInstanceManager(): void
```

#### 2.3 外部消息监听

**文件**: `app/chrome-extension/entrypoints/background/external-messaging.ts`

**功能**:
- 监听来自网页的 `chrome.runtime.sendMessage`
- 处理实例注册请求
- 处理连接状态查询

**支持的消息类型**:
- `register_instance`: 注册实例
- `get_instance_id`: 获取实例ID
- `connect_websocket`: 连接WebSocket
- `check_connection`: 检查连接状态

#### 2.4 Bridge Host（原 Native Host）

**文件**: `app/chrome-extension/entrypoints/background/native-host.ts`

**改造内容**:
- ✅ 移除了所有 `chrome.runtime.connectNative` 代码
- ✅ 改为使用 WebSocket 客户端
- ✅ 保持了相同的 API 接口（向后兼容）
- ✅ 保留了服务器状态管理
- ✅ 保留了自动连接和重连逻辑

**主要函数**（保持不变）:
```typescript
// 连接Bridge服务器（现在使用WebSocket）
export function connectNativeHost(port?: number): boolean

// 初始化监听器
export const initNativeHostListener: () => void
```

### 3. Bridge 服务器端

#### 3.1 WebSocket 服务器

**文件**: `app/native-server/src/websocket/websocket-server.ts`

**功能**:
- 启动 WebSocket 服务器
- 处理客户端连接
- 管理连接生命周期
- 处理实例注册/注销

**主要类**:
```typescript
export class WebSocketServerManager {
  // 启动WebSocket服务器
  public start(httpServer: HTTPServer, path?: string): void

  // 停止WebSocket服务器
  public stop(): void

  // 发送消息到WebSocket连接
  public sendMessage(ws: WebSocket, message: WebSocketMessage): void
}
```

#### 3.2 实例管理器（服务器端）

**文件**: `app/native-server/src/websocket/instance-manager.ts`

**功能**:
- 维护实例ID到WebSocket连接的映射
- 实例注册和注销
- 实例超时清理
- 连接管理

**主要类**:
```typescript
export class InstanceManager {
  // 注册实例
  public register(connection: WebSocket, providedInstanceId?: string): string

  // 注销实例
  public unregister(instanceId: string): boolean

  // 获取实例的连接
  public getConnection(instanceId: string): WebSocket | null

  // 获取实例ID（通过连接）
  public getInstanceId(connection: WebSocket): string | null

  // 清理超时的实例
  public cleanupInactiveInstances(): void
}
```

#### 3.3 消息路由器

**文件**: `app/native-server/src/websocket/message-router.ts`

**功能**:
- 根据实例ID路由消息到对应的WebSocket连接
- 处理工具调用请求
- 处理数据请求
- 处理文件操作

**主要类**:
```typescript
export class MessageRouter {
  // 路由消息到对应的实例
  public route(ws: WebSocket, message: WebSocketMessage): void
}
```

### 4. 网页集成

#### 4.1 Web Agent Bridge 脚本

**文件**: `app/chrome-extension/inject-scripts/web-agent-bridge.js`

**功能**:
- 提供 API 供 AI agent 在网页中调用
- 通过 `chrome.runtime.sendMessage` 与扩展通信
- 处理实例注册和ID返回

**使用方法**:
```javascript
// 在网页中注入脚本
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject-scripts/web-agent-bridge.js');
document.head.appendChild(script);

// 等待脚本加载后使用
window.__chromeMcpWebAgentBridge.registerInstance()
  .then(instanceId => {
    console.log('实例ID:', instanceId);
  });
```

**API**:
```javascript
// 注册实例并获取实例ID
window.__chromeMcpWebAgentBridge.registerInstance(clientInfo?: Object): Promise<string>

// 获取当前实例ID（如果不存在则自动注册）
window.__chromeMcpWebAgentBridge.getInstanceId(): Promise<string>

// 连接WebSocket服务器
window.__chromeMcpWebAgentBridge.connectWebSocket(url?: string): Promise<boolean>

// 检查连接状态
window.__chromeMcpWebAgentBridge.checkConnection(): Promise<{connected: boolean, instanceId: string|null}>
```

## 使用指南

### 1. 配置 WebSocket 服务器

#### 服务器端配置

在 `app/native-server/src/constant/index.ts` 中：

```typescript
export const WEBSOCKET_SERVER_PORT = 12307;
export const WEBSOCKET_SERVER_PATH = '/ws';
```

#### 扩展端配置

在 Chrome 扩展的存储中设置 WebSocket URL：

```typescript
await chrome.storage.local.set({
  websocketUrl: 'ws://localhost:12307/ws'
});
```

或通过环境变量（开发环境）：
```bash
WEBSOCKET_URL=ws://localhost:12307/ws
```

### 2. 在网页中使用

#### 步骤 1: 注入脚本

```html
<script src="chrome-extension://YOUR_EXTENSION_ID/inject-scripts/web-agent-bridge.js"></script>
```

或通过内容脚本注入。

#### 步骤 2: 注册实例

```javascript
// 等待脚本加载
await new Promise(resolve => {
  if (window.__chromeMcpWebAgentBridge) {
    resolve();
  } else {
    window.addEventListener('load', resolve);
  }
});

// 注册实例
const instanceId = await window.__chromeMcpWebAgentBridge.registerInstance();
console.log('实例ID:', instanceId);
```

#### 步骤 3: 使用实例ID

将实例ID传递给 AI agent，用于工具调用：

```javascript
// 在MCP工具调用中传入instanceId
const result = await mcpClient.callTool('chrome_click_element', {
  instanceId: instanceId,
  selector: '#button',
  // ... 其他参数
});
```

### 3. 扩展端自动连接

扩展会在以下情况自动连接 WebSocket 服务器：

- Service Worker 启动时
- 浏览器启动时
- 扩展安装/更新时

可以通过以下方式手动控制：

```typescript
// 确保连接
chrome.runtime.sendMessage({ type: NativeMessageType.ENSURE_NATIVE });

// 显式连接
chrome.runtime.sendMessage({ type: NativeMessageType.CONNECT_NATIVE });

// 断开连接
chrome.runtime.sendMessage({ type: NativeMessageType.DISCONNECT_NATIVE });

// 检查连接状态
chrome.runtime.sendMessage({ type: NativeMessageType.PING_NATIVE });
```

## API 文档

### WebSocket 消息类型

#### 实例注册

**请求**:
```typescript
{
  type: WebSocketMessageType.INSTANCE_REGISTER,
  instanceId?: string,  // 可选，如果提供则使用，否则服务器生成
  requestId: string,
  payload: {
    clientInfo?: {
      userAgent?: string,
      timestamp?: number
    }
  }
}
```

**响应**:
```typescript
{
  type: WebSocketMessageType.INSTANCE_REGISTERED,
  responseToRequestId: string,
  instanceId: string,
  payload: {
    instanceId: string,
    serverInfo?: {
      version?: string,
      timestamp?: number
    }
  }
}
```

#### 工具调用

**请求**:
```typescript
{
  type: WebSocketMessageType.CALL_TOOL,
  instanceId: string,
  requestId: string,
  payload: {
    name: string,
    args: Record<string, any>
  }
}
```

**响应**:
```typescript
{
  type: WebSocketMessageType.CALL_TOOL_RESPONSE,
  responseToRequestId: string,
  instanceId: string,
  payload: {
    status: 'success' | 'error',
    data?: any,
    error?: string
  }
}
```

### 扩展端 API

#### WebSocket 客户端

```typescript
// 连接
await connect(): Promise<boolean>

// 断开
disconnect(): void

// 检查连接
isConnected(): boolean

// 发送消息
sendMessage(message: WebSocketMessage): void

// 发送请求
await sendRequest<T>(message: WebSocketMessage, timeoutMs?: number): Promise<T>

// 注册监听器
addMessageListener(type: WebSocketMessageType, listener: MessageListener): void
```

#### 实例管理器

```typescript
// 注册实例
await registerInstance(): Promise<string>

// 注销实例
await unregisterInstance(): Promise<void>

// 获取实例ID
getCurrentInstanceId(): string | null
```

### 服务器端 API

#### WebSocket 服务器管理器

```typescript
// 启动服务器
start(httpServer: HTTPServer, path?: string): void

// 停止服务器
stop(): void

// 发送消息
sendMessage(ws: WebSocket, message: WebSocketMessage): void
```

#### 实例管理器

```typescript
// 注册实例
register(connection: WebSocket, providedInstanceId?: string): string

// 注销实例
unregister(instanceId: string): boolean

// 获取连接
getConnection(instanceId: string): WebSocket | null
```

## 迁移指南

### 从 Native Messaging 迁移

#### 扩展端

**之前**:
```typescript
// 使用 chrome.runtime.connectNative
const port = chrome.runtime.connectNative('com.chromemcp.nativehost');
port.postMessage({ type: 'start', payload: { port: 12306 } });
```

**现在**:
```typescript
// 使用 WebSocket 客户端
import { connect, sendMessage } from './websocket-client';

await connect();
sendMessage({
  type: WebSocketMessageType.INSTANCE_REGISTER,
  payload: { /* ... */ }
});
```

#### 服务器端

**之前**:
```typescript
// 通过 Native Messaging Host 接收消息
nativeMessagingHostInstance.sendRequestToExtensionAndWait(...)
```

**现在**:
```typescript
// 通过 WebSocket 发送消息
const connection = instanceManager.getConnection(instanceId);
websocketServer.sendMessage(connection, {
  type: WebSocketMessageType.CALL_TOOL,
  instanceId,
  payload: { /* ... */ }
});
```

### 兼容性说明

为了保持向后兼容，以下 API 保持不变：

- `connectNativeHost()`: 函数名保持不变，但内部使用 WebSocket
- `initNativeHostListener()`: 初始化函数保持不变
- `NativeMessageType`: 消息类型枚举保持不变（用于内部消息）

## 配置说明

### 环境变量

#### 服务器端

```bash
# WebSocket服务器端口（默认: 12307）
WEBSOCKET_SERVER_PORT=12307

# WebSocket服务器路径（默认: /ws）
WEBSOCKET_SERVER_PATH=/ws

# 实例超时时间（毫秒，默认: 3600000 = 1小时）
INSTANCE_TIMEOUT=3600000
```

#### 扩展端

```bash
# WebSocket服务器URL（开发环境）
WEBSOCKET_URL=ws://localhost:12307/ws
```

### Chrome 扩展配置

#### manifest.json (wxt.config.ts)

```typescript
{
  permissions: [
    // 'nativeMessaging',  // 可选：如果不再需要可以移除
    'tabs',
    // ... 其他权限
  ],
  externally_connectable: {
    matches: ['<all_urls>']  // 或指定特定域名
  }
}
```

### 存储配置

扩展使用以下存储键：

```typescript
STORAGE_KEYS = {
  WEBSOCKET_URL: 'websocketUrl',
  WEBSOCKET_AUTO_CONNECT_ENABLED: 'websocketAutoConnectEnabled',
  SERVER_STATUS: 'serverStatus',
  // ...
}
```

## 故障排查

### 常见问题

#### 1. WebSocket 连接失败

**症状**: 扩展无法连接到服务器

**排查步骤**:
1. 检查服务器是否运行
2. 检查 WebSocket URL 配置是否正确
3. 检查防火墙设置
4. 查看浏览器控制台错误信息

**解决方案**:
```typescript
// 手动设置WebSocket URL
await chrome.storage.local.set({
  websocketUrl: 'ws://localhost:12307/ws'
});

// 手动触发连接
chrome.runtime.sendMessage({ type: NativeMessageType.CONNECT_NATIVE });
```

#### 2. 实例注册失败

**症状**: 无法获取实例ID

**排查步骤**:
1. 检查 WebSocket 连接是否建立
2. 检查服务器日志
3. 检查实例管理器状态

**解决方案**:
```javascript
// 检查连接状态
const status = await window.__chromeMcpWebAgentBridge.checkConnection();
console.log('连接状态:', status);

// 重新注册
const instanceId = await window.__chromeMcpWebAgentBridge.registerInstance();
```

#### 3. 消息路由失败

**症状**: 工具调用无法到达扩展

**排查步骤**:
1. 检查实例ID是否正确
2. 检查服务器端实例管理器
3. 检查消息路由器日志

**解决方案**:
```typescript
// 服务器端：检查实例是否存在
const instanceManager = server.getInstanceManager();
const connection = instanceManager?.getConnection(instanceId);
if (!connection) {
  console.error('实例不存在:', instanceId);
}
```

#### 4. 重连问题

**症状**: 连接断开后无法自动重连

**排查步骤**:
1. 检查自动连接设置
2. 检查重连逻辑
3. 查看网络连接状态

**解决方案**:
```typescript
// 检查自动连接设置
const result = await chrome.storage.local.get(['websocketAutoConnectEnabled']);
console.log('自动连接:', result.websocketAutoConnectEnabled);

// 手动触发重连
chrome.runtime.sendMessage({ type: NativeMessageType.ENSURE_NATIVE });
```

### 调试技巧

#### 启用详细日志

在扩展端：
```typescript
// websocket-client.ts
const LOG_PREFIX = '[WebSocketClient]';
console.debug(`${LOG_PREFIX} 连接状态:`, ws?.readyState);
```

在服务器端：
```typescript
// websocket-server.ts
const LOG_PREFIX = '[WebSocketServer]';
console.log(`${LOG_PREFIX} 收到消息:`, message);
```

#### 检查消息流

1. 在扩展端添加消息日志
2. 在服务器端添加消息日志
3. 使用浏览器开发者工具查看 WebSocket 消息

#### 监控连接状态

```typescript
// 定期检查连接状态
setInterval(() => {
  chrome.runtime.sendMessage({ type: NativeMessageType.PING_NATIVE }, (response) => {
    console.log('连接状态:', response);
  });
}, 5000);
```

## 总结

本次改造成功将 Chrome 扩展从 Native Messaging 迁移到 WebSocket，实现了：

- ✅ 支持远程服务器连接
- ✅ 多实例管理机制
- ✅ 网页端直接触发扩展事件
- ✅ 更好的扩展性和可维护性
- ✅ 保持向后兼容

所有核心功能已实现并测试通过，可以投入使用。
