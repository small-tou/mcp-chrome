/**
 * 消息路由器
 * 根据实例ID路由消息到对应的WebSocket连接
 */
import { WebSocket } from 'ws';
import {
  WebSocketMessage,
  WebSocketMessageType,
  CallToolRequest,
  CallToolResponse,
  ProcessDataRequest,
  ProcessDataResponse,
} from 'chrome-mcp-shared';
import { InstanceManager } from './instance-manager';
// 注意：暂时保留Native Messaging作为过渡方案，后续可以移除
import nativeMessagingHostInstance from '../native-messaging-host';

const LOG_PREFIX = '[MessageRouter]';

export class MessageRouter {
  private instanceManager: InstanceManager;

  constructor(instanceManager: InstanceManager) {
    this.instanceManager = instanceManager;
  }

  /**
   * 路由消息到对应的实例
   */
  public route(ws: WebSocket, message: WebSocketMessage): void {
    // 更新活动时间
    this.instanceManager.updateActivityByConnection(ws);

    // 根据消息类型路由
    switch (message.type) {
      case WebSocketMessageType.CALL_TOOL:
        this.handleCallTool(ws, message);
        break;
      case WebSocketMessageType.PROCESS_DATA:
        this.handleProcessData(ws, message);
        break;
      case WebSocketMessageType.LIST_PUBLISHED_FLOWS:
        this.handleListPublishedFlows(ws, message);
        break;
      case WebSocketMessageType.FILE_OPERATION:
        this.handleFileOperation(ws, message);
        break;
      default:
        console.warn(`${LOG_PREFIX} 未知消息类型: ${message.type}`);
        this.sendError(ws, `Unknown message type: ${message.type}`, message.requestId);
    }
  }

  /**
   * 处理工具调用
   */
  private async handleCallTool(ws: WebSocket, message: WebSocketMessage): Promise<void> {
    const request = message.payload as CallToolRequest;
    const instanceId = message.instanceId || this.instanceManager.getInstanceId(ws);

    if (!instanceId) {
      this.sendError(ws, 'Instance ID not found', message.requestId);
      return;
    }

    try {
      // 通过Native Messaging Host发送请求到扩展
      // 注意：这里暂时保留Native Messaging作为中间层，后续可以移除
      const response = await nativeMessagingHostInstance.sendRequestToExtensionAndWait(
        {
          name: request.name,
          args: request.args,
          instanceId, // 传递实例ID
        },
        'call_tool',
        120_000, // 120秒超时
      );

      const toolResponse: CallToolResponse = {
        status: response.status === 'success' ? 'success' : 'error',
        data: response.data,
        error: response.error,
      };

      this.sendMessage(ws, {
        type: WebSocketMessageType.CALL_TOOL_RESPONSE,
        responseToRequestId: message.requestId,
        instanceId,
        payload: toolResponse,
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} 工具调用失败`, error);
      const toolResponse: CallToolResponse = {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
      this.sendMessage(ws, {
        type: WebSocketMessageType.CALL_TOOL_RESPONSE,
        responseToRequestId: message.requestId,
        instanceId,
        payload: toolResponse,
      });
    }
  }

  /**
   * 处理数据请求
   */
  private async handleProcessData(ws: WebSocket, message: WebSocketMessage): Promise<void> {
    const request = message.payload as ProcessDataRequest;
    const instanceId = message.instanceId || this.instanceManager.getInstanceId(ws);

    if (!instanceId) {
      this.sendError(ws, 'Instance ID not found', message.requestId);
      return;
    }

    try {
      const response = await nativeMessagingHostInstance.sendRequestToExtensionAndWait(
        request.data,
        'process_data',
        20_000,
      );

      const dataResponse: ProcessDataResponse = {
        status: response.status === 'success' ? 'success' : 'error',
        data: response.data,
        error: response.error,
      };

      this.sendMessage(ws, {
        type: WebSocketMessageType.PROCESS_DATA_RESPONSE,
        responseToRequestId: message.requestId,
        instanceId,
        payload: dataResponse,
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} 数据处理失败`, error);
      const dataResponse: ProcessDataResponse = {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
      this.sendMessage(ws, {
        type: WebSocketMessageType.PROCESS_DATA_RESPONSE,
        responseToRequestId: message.requestId,
        instanceId,
        payload: dataResponse,
      });
    }
  }

  /**
   * 处理列出已发布流程的请求
   */
  private async handleListPublishedFlows(ws: WebSocket, message: WebSocketMessage): Promise<void> {
    const instanceId = message.instanceId || this.instanceManager.getInstanceId(ws);

    if (!instanceId) {
      this.sendError(ws, 'Instance ID not found', message.requestId);
      return;
    }

    try {
      const response = await nativeMessagingHostInstance.sendRequestToExtensionAndWait(
        {},
        'rr_list_published_flows',
        20_000,
      );

      this.sendMessage(ws, {
        type: WebSocketMessageType.LIST_PUBLISHED_FLOWS_RESPONSE,
        responseToRequestId: message.requestId,
        instanceId,
        payload: response,
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} 列出已发布流程失败`, error);
      this.sendError(ws, error instanceof Error ? error.message : String(error), message.requestId);
    }
  }

  /**
   * 处理文件操作
   */
  private async handleFileOperation(ws: WebSocket, message: WebSocketMessage): Promise<void> {
    const instanceId = message.instanceId || this.instanceManager.getInstanceId(ws);

    if (!instanceId) {
      this.sendError(ws, 'Instance ID not found', message.requestId);
      return;
    }

    try {
      // 文件操作通过Native Messaging Host处理
      const response = await nativeMessagingHostInstance.sendRequestToExtensionAndWait(
        message.payload,
        'file_operation',
        30_000,
      );

      this.sendMessage(ws, {
        type: WebSocketMessageType.FILE_OPERATION_RESPONSE,
        responseToRequestId: message.requestId,
        instanceId,
        payload: response,
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} 文件操作失败`, error);
      this.sendError(ws, error instanceof Error ? error.message : String(error), message.requestId);
    }
  }

  /**
   * 发送消息到WebSocket连接
   */
  private sendMessage(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`${LOG_PREFIX} 发送消息失败`, error);
      }
    }
  }

  /**
   * 发送错误消息
   */
  private sendError(ws: WebSocket, error: string, requestId?: string): void {
    this.sendMessage(ws, {
      type: WebSocketMessageType.ERROR,
      responseToRequestId: requestId,
      error,
    });
  }
}
