import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  TOOL_SCHEMAS,
  WebSocketMessageType,
  WebSocketMessage,
  CallToolRequest,
} from 'chrome-mcp-shared';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { WebSocket } from 'ws';
import { getInstanceIdFromContext } from './mcp-server';

async function listDynamicFlowTools(): Promise<Tool[]> {
  try {
    // 尝试通过WebSocket获取流程列表
    if (!globalInstanceManager) {
      console.warn('[MCP] InstanceManager不可用，无法获取动态流程工具');
      return [];
    }

    // 获取第一个可用的实例连接
    const allInstanceIds = globalInstanceManager.getAllInstanceIds();
    if (allInstanceIds.length === 0) {
      console.warn('[MCP] 没有可用的实例连接，无法获取动态流程工具');
      return [];
    }

    // 使用第一个实例
    const instanceId = allInstanceIds[0];
    const connection = globalInstanceManager.getConnection(instanceId);
    if (!connection || connection.readyState !== WebSocket.OPEN) {
      console.warn('[MCP] 实例连接不可用，无法获取动态流程工具');
      return [];
    }

    const response = await sendRequestViaWebSocket(
      connection,
      WebSocketMessageType.LIST_PUBLISHED_FLOWS,
      {},
      instanceId,
      20_000,
    );

    if (response && response.status === 'success' && Array.isArray(response.items)) {
      const tools: Tool[] = [];
      for (const item of response.items) {
        const name = `flow.${item.slug}`;
        const description =
          (item.meta && item.meta.tool && item.meta.tool.description) ||
          item.description ||
          'Recorded flow';
        const properties: Record<string, any> = {};
        const required: string[] = [];
        for (const v of item.variables || []) {
          const desc = v.label || v.key;
          const typ = (v.type || 'string').toLowerCase();
          const prop: any = { description: desc };
          if (typ === 'boolean') prop.type = 'boolean';
          else if (typ === 'number') prop.type = 'number';
          else if (typ === 'enum') {
            prop.type = 'string';
            if (v.rules && Array.isArray(v.rules.enum)) prop.enum = v.rules.enum;
          } else if (typ === 'array') {
            // default array of strings; can extend with itemType later
            prop.type = 'array';
            prop.items = { type: 'string' };
          } else {
            prop.type = 'string';
          }
          if (v.default !== undefined) prop.default = v.default;
          if (v.rules && v.rules.required) required.push(v.key);
          properties[v.key] = prop;
        }
        // Run options
        properties['tabTarget'] = { type: 'string', enum: ['current', 'new'], default: 'current' };
        properties['refresh'] = { type: 'boolean', default: false };
        properties['captureNetwork'] = { type: 'boolean', default: false };
        properties['returnLogs'] = { type: 'boolean', default: false };
        properties['timeoutMs'] = { type: 'number', minimum: 0 };
        // 不再添加 instanceId 参数，改为从环境变量 INSTANCE_ID 中获取
        const tool: Tool = {
          name,
          description,
          inputSchema: { type: 'object', properties, required },
        };
        tools.push(tool);
      }
      return tools;
    }
    return [];
  } catch (e) {
    return [];
  }
}

// 全局引用，用于在工具调用时访问 InstanceManager
let globalInstanceManager: any = null;
let globalWebSocketServer: any = null;

/**
 * 通过WebSocket发送请求并等待响应
 */
async function sendRequestViaWebSocket(
  connection: WebSocket,
  messageType: WebSocketMessageType,
  payload: any,
  instanceId: string,
  timeoutMs: number = 20_000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timeout = setTimeout(() => {
      reject(new Error(`请求超时 (${messageType})`));
    }, timeoutMs);

    // 设置一次性消息监听器
    const messageHandler = (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());

        // 检查是否是我们的响应
        const responseTypeMap: Record<WebSocketMessageType, WebSocketMessageType> = {
          [WebSocketMessageType.LIST_PUBLISHED_FLOWS]:
            WebSocketMessageType.LIST_PUBLISHED_FLOWS_RESPONSE,
          [WebSocketMessageType.CALL_TOOL]: WebSocketMessageType.CALL_TOOL_RESPONSE,
          [WebSocketMessageType.PROCESS_DATA]: WebSocketMessageType.PROCESS_DATA_RESPONSE,
          [WebSocketMessageType.FILE_OPERATION]: WebSocketMessageType.FILE_OPERATION_RESPONSE,
        } as any;

        const expectedResponseType = responseTypeMap[messageType];
        if (
          message.type === expectedResponseType &&
          message.responseToRequestId === requestId &&
          message.instanceId === instanceId
        ) {
          clearTimeout(timeout);
          connection.removeListener('message', messageHandler);

          const response = message.payload as any;
          if (response.status === 'success') {
            resolve(response);
          } else {
            reject(new Error(response.error || 'Unknown error'));
          }
        }
      } catch (error) {
        // 忽略解析错误，继续等待正确的响应
      }
    };

    connection.on('message', messageHandler);

    // 发送请求
    try {
      const request: WebSocketMessage = {
        type: messageType,
        requestId,
        instanceId,
        payload,
      };

      connection.send(JSON.stringify(request));
    } catch (error) {
      clearTimeout(timeout);
      connection.removeListener('message', messageHandler);
      reject(error);
    }
  });
}

export const setupTools = (server: Server, instanceManager?: any, webSocketServer?: any) => {
  // 保存全局引用
  if (instanceManager) {
    globalInstanceManager = instanceManager;
  }
  if (webSocketServer) {
    globalWebSocketServer = webSocketServer;
  }

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const dynamicTools = await listDynamicFlowTools();
    const allTools = [...TOOL_SCHEMAS, ...dynamicTools];
    // 记录工具列表（用于调试）
    console.log(`[MCP List Tools] 返回 ${allTools.length} 个工具`);
    const sampleTool = allTools.find((t) => t.name === 'get_windows_and_tabs');
    if (sampleTool) {
      console.log(
        `[MCP List Tools] 示例工具 get_windows_and_tabs 的 schema:`,
        JSON.stringify(sampleTool.inputSchema, null, 2),
      );
    }
    return { tools: allTools };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // 从 AsyncLocalStorage 获取当前 sessionId（在 server/index.ts 中设置）
    return handleToolCall(request.params.name, request.params.arguments || {});
  });
};

/**
 * 通过WebSocket发送工具调用请求
 */
async function sendToolCallViaWebSocket(
  connection: WebSocket,
  name: string,
  args: any,
  instanceId: string,
): Promise<CallToolResult> {
  return new Promise((resolve, reject) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timeout = setTimeout(() => {
      reject(new Error(`工具调用超时 (${name})`));
    }, 120_000); // 120秒超时

    // 设置一次性消息监听器
    const messageHandler = (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());

        // 检查是否是我们的响应
        if (
          message.type === WebSocketMessageType.CALL_TOOL_RESPONSE &&
          message.responseToRequestId === requestId &&
          message.instanceId === instanceId
        ) {
          clearTimeout(timeout);
          connection.removeListener('message', messageHandler);

          const response = message.payload as any;
          if (response.status === 'success') {
            resolve(response.data);
          } else {
            resolve({
              content: [
                {
                  type: 'text',
                  text: `Error calling tool: ${response.error || 'Unknown error'}`,
                },
              ],
              isError: true,
            });
          }
        }
      } catch (error) {
        // 忽略解析错误，继续等待正确的响应
      }
    };

    connection.on('message', messageHandler);

    // 发送工具调用请求
    try {
      const request: WebSocketMessage = {
        type: WebSocketMessageType.CALL_TOOL,
        requestId,
        instanceId,
        payload: {
          name,
          args,
        } as CallToolRequest,
      };

      const messageStr = JSON.stringify(request);
      console.log(`[MCP Tool Call] 发送工具调用请求到扩展:`, {
        instanceId,
        toolName: name,
        requestId,
        connectionReadyState: connection.readyState,
        messageLength: messageStr.length,
      });

      if (connection.readyState !== WebSocket.OPEN) {
        clearTimeout(timeout);
        connection.removeListener('message', messageHandler);
        reject(new Error(`连接状态不是 OPEN (当前: ${connection.readyState})`));
        return;
      }

      connection.send(messageStr);
      console.log(`[MCP Tool Call] 消息已发送`);
    } catch (error) {
      console.error(`[MCP Tool Call] 发送消息失败:`, error);
      clearTimeout(timeout);
      connection.removeListener('message', messageHandler);
      reject(error);
    }
  });
}

const handleToolCall = async (name: string, args: any): Promise<CallToolResult> => {
  try {
    // 记录收到的参数（用于调试）
    console.log(`[MCP Tool Call] 工具: ${name}, 收到的参数:`, JSON.stringify(args, null, 2));

    // 从 AsyncLocalStorage 获取当前 sessionId，然后获取对应的 instanceId
    const instanceId = getInstanceIdFromContext();
    console.log(`[MCP Tool Call] 从上下文获取的 instanceId:`, instanceId);

    if (!instanceId || typeof instanceId !== 'string' || instanceId.trim() === '') {
      return {
        content: [
          {
            type: 'text',
            text: '错误：缺少 INSTANCE_ID 鉴权参数。请在初始化 MCP 连接时在 params 中提供 INSTANCE_ID 参数。',
          },
        ],
        isError: true,
      };
    }

    // 不再从 args 中移除 instanceId，因为已经不在 args 中了
    const toolArgs = { ...args };

    // If calling a dynamic flow tool (name starts with flow.), proxy to common flow-run tool
    if (name && name.startsWith('flow.')) {
      // We need to resolve flow by slug to ID
      try {
        // 获取连接
        if (!globalInstanceManager) {
          return {
            content: [
              {
                type: 'text',
                text: `错误：InstanceManager不可用，无法调用动态流程工具`,
              },
            ],
            isError: true,
          };
        }

        // 调试信息：检查所有已注册的实例
        const allInstanceIds = globalInstanceManager.getAllInstanceIds();
        console.log(`[MCP Tool Call] 尝试获取实例连接: ${instanceId}`);
        console.log(`[MCP Tool Call] 当前已注册的实例ID列表:`, allInstanceIds);
        console.log(`[MCP Tool Call] 实例是否存在:`, globalInstanceManager.hasInstance(instanceId));

        const connection = globalInstanceManager.getConnection(instanceId);
        console.log(
          `[MCP Tool Call] 获取到的连接:`,
          connection ? `存在 (readyState: ${connection.readyState})` : 'null',
        );

        if (!connection || connection.readyState !== WebSocket.OPEN) {
          const reason = !connection
            ? '连接不存在（实例可能未注册或已注销）'
            : `连接状态为 ${connection.readyState}（需要为 ${WebSocket.OPEN}）`;
          return {
            content: [
              {
                type: 'text',
                text: `错误：实例 ${instanceId} 的WebSocket连接不可用。${reason}。已注册的实例: ${allInstanceIds.join(', ') || '无'}`,
              },
            ],
            isError: true,
          };
        }

        // 通过WebSocket获取流程列表
        const resp = await sendRequestViaWebSocket(
          connection,
          WebSocketMessageType.LIST_PUBLISHED_FLOWS,
          {},
          instanceId,
          20_000,
        );
        console.log('sendRequestViaWebSocket resp', resp);
        const items = (resp && resp.items) || [];
        const slug = name.slice('flow.'.length);
        const match = items.find((it: any) => it.slug === slug);
        if (!match) throw new Error(`Flow not found for tool ${name}`);

        // 通过WebSocket调用流程运行工具
        const flowArgs = { flowId: match.id, args: toolArgs };
        const proxyRes = await sendToolCallViaWebSocket(
          connection,
          'record_replay_flow_run',
          flowArgs,
          instanceId,
        );
        return proxyRes;
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error resolving dynamic flow tool: ${err?.message || String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }

    // 使用WebSocket路由（必须，不再支持Native Messaging）
    if (!globalInstanceManager) {
      return {
        content: [
          {
            type: 'text',
            text: '错误：InstanceManager不可用，无法调用工具',
          },
        ],
        isError: true,
      };
    }

    // 调试信息：检查所有已注册的实例
    const allInstanceIds = globalInstanceManager.getAllInstanceIds();
    console.log(`[MCP Tool Call] 尝试获取实例连接: ${instanceId}`);
    console.log(`[MCP Tool Call] 当前已注册的实例ID列表:`, allInstanceIds);
    console.log(`[MCP Tool Call] 实例是否存在:`, globalInstanceManager.hasInstance(instanceId));

    const connection = globalInstanceManager.getConnection(instanceId);
    console.log(
      `[MCP Tool Call] 获取到的连接:`,
      connection ? `存在 (readyState: ${connection.readyState})` : 'null',
    );

    if (!connection || connection.readyState !== WebSocket.OPEN) {
      const reason = !connection
        ? '连接不存在（实例可能未注册或已注销）'
        : `连接状态为 ${connection.readyState}（需要为 ${WebSocket.OPEN}）`;
      return {
        content: [
          {
            type: 'text',
            text: `错误：实例 ${instanceId} 的WebSocket连接不存在或未打开。${reason}。已注册的实例: ${allInstanceIds.join(', ') || '无'}`,
          },
        ],
        isError: true,
      };
    }

    // 通过WebSocket发送工具调用请求
    return await sendToolCallViaWebSocket(connection, name, toolArgs, instanceId);
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error calling tool: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
};
