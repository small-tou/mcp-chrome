# CLI MCP Configuration Guide

This guide explains how to configure Codex CLI and Claude Code to connect to the Chrome MCP Server.

## Overview

The Chrome MCP Server exposes its MCP interface at `http://127.0.0.1:12306/mcp` (default port).
Both Codex CLI and Claude Code can connect to this endpoint to use Chrome browser control tools.

## Codex CLI Configuration

### Option 1: HTTP MCP Server (Recommended)

Add the following to your `~/.codex/config.json`:

```json
{
  "mcpServers": {
    "chrome-mcp": {
      "url": "http://127.0.0.1:12306/mcp?instanceId=YOUR_INSTANCE_ID"
    }
  }
}
```

**重要**: 将 `YOUR_INSTANCE_ID` 替换为你的 Chrome 扩展实例 ID。你可以在 Chrome 扩展的弹出窗口中查看实例 ID。

### Option 2: Via Environment Variable

Set the MCP URL via environment variable before running codex:

```bash
export MCP_HTTP_PORT=12306
```

## Claude Code Configuration

### Option 1: HTTP MCP Server

Add the following to your `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "chrome-mcp": {
      "url": "http://127.0.0.1:12306/mcp?instanceId=YOUR_INSTANCE_ID"
    }
  }
}
```

**重要**: 将 `YOUR_INSTANCE_ID` 替换为你的 Chrome 扩展实例 ID。你可以在 Chrome 扩展的弹出窗口中查看实例 ID。

### 通过 HTTP Header 传递 INSTANCE_ID（如果客户端支持）

某些 MCP 客户端可能支持通过 HTTP headers 传递参数。如果支持，可以这样配置：

```json
{
  "mcpServers": {
    "chrome-mcp": {
      "url": "http://127.0.0.1:12306/mcp",
      "headers": {
        "X-Instance-Id": "YOUR_INSTANCE_ID"
      }
    }
  }
}
```

### Option 2: Stdio Server (Alternative)

If you prefer stdio-based MCP communication:

```json
{
  "mcpServers": {
    "chrome-mcp": {
      "command": "node",
      "args": ["/path/to/mcp-chrome/dist/mcp/mcp-server-stdio.js"]
    }
  }
}
```

## Verifying Connection

After configuration, the CLI tools should be able to see and use Chrome MCP tools such as:

- `chrome_get_windows_and_tabs` - Get browser window and tab information
- `chrome_navigate` - Navigate to a URL
- `chrome_click_element` - Click on page elements
- `chrome_get_page_content` - Get page content
- And more...

## Troubleshooting

### Connection Refused

If you get "connection refused" errors:

1. Ensure the Chrome extension is installed and the native server is running
2. Check that the port matches (default: 12306)
3. Verify no firewall is blocking localhost connections
4. Run `mcp-chrome-bridge doctor` to diagnose issues

### Tools Not Appearing

If MCP tools don't appear in the CLI:

1. Restart the CLI tool after configuration changes
2. Check the configuration file syntax (valid JSON)
3. Ensure the MCP server URL is accessible

### Port Conflicts

If port 12306 is already in use:

1. Set a custom port in the extension settings
2. Update the CLI configuration to match the new port
3. Run `mcp-chrome-bridge update-port <new-port>` to update the stdio config

## Authentication: INSTANCE_ID

Chrome MCP Server 需要 `INSTANCE_ID` 鉴权参数来标识要控制的 Chrome 扩展实例。你可以通过以下方式提供：

1. **URL Query 参数**（推荐）: `http://127.0.0.1:12306/mcp?instanceId=YOUR_INSTANCE_ID`
2. **HTTP Header**: `X-Instance-Id: YOUR_INSTANCE_ID`
3. **初始化请求 params**（如果客户端支持）: 在 `initialize` 请求的 `params` 中包含 `INSTANCE_ID` 字段

### 如何获取 INSTANCE_ID

1. 打开 Chrome 扩展的弹出窗口
2. 点击"连接"按钮
3. 在连接成功后，扩展会显示实例 ID
4. 复制该实例 ID 并用于 MCP 配置

## Environment Variables

| Variable                     | Description                            | Default |
| ---------------------------- | -------------------------------------- | ------- |
| `MCP_HTTP_PORT`              | HTTP port for MCP server               | 12306   |
| `MCP_ALLOWED_WORKSPACE_BASE` | Additional allowed workspace directory | (none)  |
| `CHROME_MCP_NODE_PATH`       | Override Node.js executable path       | (auto)  |
