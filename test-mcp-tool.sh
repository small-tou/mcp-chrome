#!/bin/bash

# MCP 工具调用测试脚本
# 使用方法: ./test-mcp-tool.sh [instanceId] [toolName] [toolArgs]

MCP_URL="http://127.0.0.1:12306/mcp"
INSTANCE_ID="${1:-8c2742d2-d4c1-4cce-8aa6-d45b9f581cef}"
TOOL_NAME="${2:-get_windows_and_tabs}"
TOOL_ARGS="${3:-{}}"

echo "=========================================="
echo "MCP 工具调用测试"
echo "=========================================="
echo "MCP URL: $MCP_URL"
echo "Instance ID: $INSTANCE_ID"
echo "Tool Name: $TOOL_NAME"
echo "=========================================="
echo ""

# 步骤 1: 初始化 MCP 会话
echo "步骤 1: 初始化 MCP 会话..."
INIT_REQUEST='{
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

# 获取初始化响应（包括响应头）
INIT_RESPONSE_HEADERS=$(curl -s -i -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "$INIT_REQUEST")

echo "初始化响应:"
echo "$INIT_RESPONSE_HEADERS"
echo ""

# 从响应头提取 session ID
SESSION_ID=$(echo "$INIT_RESPONSE_HEADERS" | grep -i "mcp-session-id" | head -1 | cut -d' ' -f2 | tr -d '\r\n' | tr -d '[:space:]')

# 如果没有找到，尝试从响应体提取（SSE 格式）
if [ -z "$SESSION_ID" ]; then
  INIT_RESPONSE_BODY=$(echo "$INIT_RESPONSE_HEADERS" | sed -n '/^$/,$p' | tail -n +2)
  SESSION_ID=$(echo "$INIT_RESPONSE_BODY" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
fi

if [ -z "$SESSION_ID" ]; then
  echo "⚠️  警告: 无法获取 session ID，尝试继续..."
  SESSION_HEADER=""
else
  echo "✅ Session ID: $SESSION_ID"
  SESSION_HEADER="-H \"mcp-session-id: $SESSION_ID\""
fi
echo ""

# 步骤 2: 列出可用工具
echo "步骤 2: 列出可用工具..."
LIST_TOOLS_REQUEST='{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}'

echo "发送请求:"
echo "$LIST_TOOLS_REQUEST" | jq '.'
echo ""

if [ -n "$SESSION_ID" ]; then
  LIST_RESPONSE=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: $SESSION_ID" \
    -d "$LIST_TOOLS_REQUEST")
else
  LIST_RESPONSE=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "$LIST_TOOLS_REQUEST")
fi

echo "工具列表响应:"
# 解析 SSE 格式响应
LIST_RESPONSE_BODY=$(echo "$LIST_RESPONSE" | grep "^data:" | sed 's/^data: //' | head -1)
if [ -n "$LIST_RESPONSE_BODY" ]; then
  echo "$LIST_RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$LIST_RESPONSE_BODY"
else
  echo "$LIST_RESPONSE" | jq '.' 2>/dev/null || echo "$LIST_RESPONSE"
fi
echo ""

# 步骤 3: 调用工具
echo "步骤 3: 调用工具 '$TOOL_NAME'..."
if [ "$TOOL_ARGS" = "{}" ] || [ -z "$TOOL_ARGS" ]; then
  CALL_TOOL_REQUEST=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "$TOOL_NAME",
    "arguments": {
      "instanceId": "$INSTANCE_ID"
    }
  }
}
EOF
)
else
  # 解析并合并参数
  TOOL_ARGS_CLEAN=$(echo "$TOOL_ARGS" | sed 's/^{//;s/}$//')
  CALL_TOOL_REQUEST=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "$TOOL_NAME",
    "arguments": {
      "instanceId": "$INSTANCE_ID",
      $TOOL_ARGS_CLEAN
    }
  }
}
EOF
)
fi

echo "发送请求:"
echo "$CALL_TOOL_REQUEST" | jq '.'
echo ""

if [ -n "$SESSION_ID" ]; then
  CALL_RESPONSE=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: $SESSION_ID" \
    -d "$CALL_TOOL_REQUEST")
else
  CALL_RESPONSE=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "$CALL_TOOL_REQUEST")
fi

echo "工具调用响应:"
# 解析 SSE 格式响应
CALL_RESPONSE_BODY=$(echo "$CALL_RESPONSE" | grep "^data:" | sed 's/^data: //' | head -1)
if [ -n "$CALL_RESPONSE_BODY" ]; then
  echo "$CALL_RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$CALL_RESPONSE_BODY"
else
  echo "$CALL_RESPONSE" | jq '.' 2>/dev/null || echo "$CALL_RESPONSE"
fi
echo ""

echo "=========================================="
echo "测试完成"
echo "=========================================="

# 步骤 4: 测试场景 - 打开网站、输入并提交
echo ""
echo "=========================================="
echo "步骤 4: 测试场景 - 打开网站并输入提交"
echo "=========================================="

# 4.1: 打开网站
echo "4.1: 打开网站 https://ai-sy.yucekj.com..."
NAVIGATE_REQUEST=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "chrome_navigate",
    "arguments": {
      "instanceId": "$INSTANCE_ID",
      "url": "https://ai-sy.yucekj.com"
    }
  }
}
EOF
)

echo "发送请求:"
echo "$NAVIGATE_REQUEST" | jq '.'
echo ""

if [ -n "$SESSION_ID" ]; then
  NAVIGATE_RESPONSE=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: $SESSION_ID" \
    -d "$NAVIGATE_REQUEST")
else
  NAVIGATE_RESPONSE=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "$NAVIGATE_REQUEST")
fi

echo "导航响应:"
NAVIGATE_RESPONSE_BODY=$(echo "$NAVIGATE_RESPONSE" | grep "^data:" | sed 's/^data: //' | head -1)
if [ -n "$NAVIGATE_RESPONSE_BODY" ]; then
  echo "$NAVIGATE_RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$NAVIGATE_RESPONSE_BODY"
else
  echo "$NAVIGATE_RESPONSE" | jq '.' 2>/dev/null || echo "$NAVIGATE_RESPONSE"
fi
echo ""

# 等待页面加载
echo "等待页面加载..."
sleep 3

# 4.2: 读取页面找到对话框
echo "4.2: 读取页面查找对话框元素..."
READ_PAGE_REQUEST=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "chrome_read_page",
    "arguments": {
      "instanceId": "$INSTANCE_ID",
      "filter": "interactive"
    }
  }
}
EOF
)

echo "发送请求:"
echo "$READ_PAGE_REQUEST" | jq '.'
echo ""

if [ -n "$SESSION_ID" ]; then
  READ_PAGE_RESPONSE=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: $SESSION_ID" \
    -d "$READ_PAGE_REQUEST")
else
  READ_PAGE_RESPONSE=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "$READ_PAGE_REQUEST")
fi

echo "页面读取响应:"
READ_PAGE_RESPONSE_BODY=$(echo "$READ_PAGE_RESPONSE" | grep "^data:" | sed 's/^data: //' | head -1)
if [ -n "$READ_PAGE_RESPONSE_BODY" ]; then
  echo "$READ_PAGE_RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$READ_PAGE_RESPONSE_BODY"
else
  echo "$READ_PAGE_RESPONSE" | jq '.' 2>/dev/null || echo "$READ_PAGE_RESPONSE"
fi
echo ""

# 4.3: 在对话框中输入"测试"
# 尝试使用常见的输入框选择器，如果找不到则使用键盘输入
echo "4.3: 在对话框中输入'测试'..."
FILL_REQUEST=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "chrome_fill_or_select",
    "arguments": {
      "instanceId": "$INSTANCE_ID",
      "selector": "input[type='text'], textarea, input:not([type]), [contenteditable='true']",
      "value": "测试"
    }
  }
}
EOF
)

echo "发送请求:"
echo "$FILL_REQUEST" | jq '.'
echo ""

if [ -n "$SESSION_ID" ]; then
  FILL_RESPONSE=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: $SESSION_ID" \
    -d "$FILL_REQUEST")
else
  FILL_RESPONSE=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "$FILL_REQUEST")
fi

echo "输入响应:"
FILL_RESPONSE_BODY=$(echo "$FILL_RESPONSE" | grep "^data:" | sed 's/^data: //' | head -1)
if [ -n "$FILL_RESPONSE_BODY" ]; then
  echo "$FILL_RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$FILL_RESPONSE_BODY"
else
  echo "$FILL_RESPONSE" | jq '.' 2>/dev/null || echo "$FILL_RESPONSE"
fi
echo ""

# 如果填充失败，尝试使用键盘输入
FILL_SUCCESS=$(echo "$FILL_RESPONSE_BODY" | jq -r '.result.content[0].text // empty' 2>/dev/null || echo "")
if [ -z "$FILL_SUCCESS" ]; then
  echo "填充可能失败，尝试使用键盘输入..."
  KEYBOARD_REQUEST=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "chrome_keyboard",
    "arguments": {
      "instanceId": "$INSTANCE_ID",
      "keys": "测试"
    }
  }
}
EOF
)
  
  echo "发送键盘输入请求:"
  echo "$KEYBOARD_REQUEST" | jq '.'
  echo ""
  
  if [ -n "$SESSION_ID" ]; then
    KEYBOARD_RESPONSE=$(curl -s -X POST "$MCP_URL" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json, text/event-stream" \
      -H "mcp-session-id: $SESSION_ID" \
      -d "$KEYBOARD_REQUEST")
  else
    KEYBOARD_RESPONSE=$(curl -s -X POST "$MCP_URL" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json, text/event-stream" \
      -d "$KEYBOARD_REQUEST")
  fi
  
  echo "键盘输入响应:"
  KEYBOARD_RESPONSE_BODY=$(echo "$KEYBOARD_RESPONSE" | grep "^data:" | sed 's/^data: //' | head -1)
  if [ -n "$KEYBOARD_RESPONSE_BODY" ]; then
    echo "$KEYBOARD_RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$KEYBOARD_RESPONSE_BODY"
  else
    echo "$KEYBOARD_RESPONSE" | jq '.' 2>/dev/null || echo "$KEYBOARD_RESPONSE"
  fi
  echo ""
fi

# 4.4: 提交（按 Enter 键）
echo "4.4: 提交表单（按 Enter 键）..."
SUBMIT_REQUEST=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "tools/call",
  "params": {
    "name": "chrome_keyboard",
    "arguments": {
      "instanceId": "$INSTANCE_ID",
      "keys": "Enter"
    }
  }
}
EOF
)

echo "发送请求:"
echo "$SUBMIT_REQUEST" | jq '.'
echo ""

if [ -n "$SESSION_ID" ]; then
  SUBMIT_RESPONSE=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: $SESSION_ID" \
    -d "$SUBMIT_REQUEST")
else
  SUBMIT_RESPONSE=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "$SUBMIT_REQUEST")
fi

echo "提交响应:"
SUBMIT_RESPONSE_BODY=$(echo "$SUBMIT_RESPONSE" | grep "^data:" | sed 's/^data: //' | head -1)
if [ -n "$SUBMIT_RESPONSE_BODY" ]; then
  echo "$SUBMIT_RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$SUBMIT_RESPONSE_BODY"
else
  echo "$SUBMIT_RESPONSE" | jq '.' 2>/dev/null || echo "$SUBMIT_RESPONSE"
fi
echo ""

echo "=========================================="
echo "测试场景完成"
echo "=========================================="
