# MCP 工具调用测试 - curl 命令

## 快速开始

### 1. 初始化 MCP 会话

```bash
curl -X POST http://127.0.0.1:12306/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "curl-test-client",
        "version": "1.0.0"
      }
    }
  }'
```

**保存返回的 `sessionId`**，后续请求需要在 Header 中携带：

```
mcp-session-id: <sessionId>
```

### 2. 列出可用工具

```bash
curl -X POST http://127.0.0.1:12306/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <你的sessionId>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

### 3. 调用工具

#### 示例 1: 获取窗口和标签页列表

```bash
curl -X POST http://127.0.0.1:12306/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <你的sessionId>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "get_windows_and_tabs",
      "arguments": {
        "instanceId": "6b1c9d69-6691-4aca-af70-ef2880936848"
      }
    }
  }'
```

#### 示例 2: 导航到 URL

```bash
curl -X POST http://127.0.0.1:12306/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <你的sessionId>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "chrome_navigate",
      "arguments": {
        "instanceId": "6b1c9d69-6691-4aca-af70-ef2880936848",
        "url": "https://baidu.com"
      }
    }
  }'
```

#### 示例 3: 读取页面内容

```bash
curl -X POST http://127.0.0.1:12306/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <你的sessionId>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "chrome_read_page",
      "arguments": {
        "instanceId": "6b1c9d69-6691-4aca-af70-ef2880936848",
        "filter": "interactive"
      }
    }
  }'
```

#### 示例 4: 截图

```bash
curl -X POST http://127.0.0.1:12306/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <你的sessionId>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "tools/call",
    "params": {
      "name": "chrome_screenshot",
      "arguments": {
        "instanceId": "6b1c9d69-6691-4aca-af70-ef2880936848",
        "fullPage": true,
        "storeBase64": true
      }
    }
  }'
```

## 一键测试脚本

使用提供的 `test-mcp-tool.sh` 脚本：

```bash
# 基本用法（使用默认参数）
./test-mcp-tool.sh

# 指定 instanceId
./test-mcp-tool.sh "6b1c9d69-6691-4aca-af70-ef2880936848"

# 指定 instanceId 和工具名
./test-mcp-tool.sh "6b1c9d69-6691-4aca-af70-ef2880936848" "chrome_navigate"

# 指定所有参数
./test-mcp-tool.sh "6b1c9d69-6691-4aca-af70-ef2880936848" "chrome_navigate" '{"url": "https://baidu.com"}'
```

## 重要提示

1. **instanceId 是必填参数**：所有工具调用都需要提供 `instanceId`，这是 Chrome 扩展的实例标识符
2. **Session ID**：初始化后会返回 `sessionId`，后续请求需要在 Header 中携带
3. **超时时间**：工具调用默认超时时间为 120 秒
4. **WebSocket 连接**：确保 Chrome 扩展已通过 WebSocket 连接到服务器

## 获取 instanceId

instanceId 可以通过以下方式获取：

1. 查看 Chrome 扩展的控制台日志
2. 查看服务器启动日志
3. 通过 WebSocket 连接时自动注册

## 调试技巧

1. **查看服务器日志**：工具调用会在服务器端打印详细日志
2. **检查 WebSocket 连接**：确保扩展的 WebSocket 连接正常
3. **验证参数格式**：确保 JSON 格式正确，特别是嵌套的参数
