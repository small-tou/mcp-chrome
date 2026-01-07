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
   * 注意：工具调用通常应该从服务器发起（MCP客户端 -> 服务器 -> 扩展）
   * 但如果扩展主动发送工具调用请求，这里会处理并转发回扩展
   * 实际上，扩展不应该发送CALL_TOOL消息到服务器，这个处理器主要是为了兼容性
   */
  private async handleCallTool(ws: WebSocket, message: WebSocketMessage): Promise<void> {
    const request = message.payload as CallToolRequest;
    const instanceId = message.instanceId || this.instanceManager.getInstanceId(ws);

    if (!instanceId) {
      this.sendError(ws, 'Instance ID not found', message.requestId);
      return;
    }

    // 工具调用应该从服务器发起，扩展不应该发送CALL_TOOL消息到服务器
    // 如果收到，直接返回错误
    console.warn(
      `${LOG_PREFIX} 收到来自扩展的工具调用请求，这不应该发生。工具调用应该从服务器发起。`,
    );
    const toolResponse: CallToolResponse = {
      status: 'error',
      error: '工具调用应该从服务器发起，而不是从扩展发起',
    };
    this.sendMessage(ws, {
      type: WebSocketMessageType.CALL_TOOL_RESPONSE,
      responseToRequestId: message.requestId,
      instanceId,
      payload: toolResponse,
    });
  }

  /**
   * 处理数据请求
   * 注意：数据请求应该从服务器发起，扩展不应该发送PROCESS_DATA消息到服务器
   * 如果收到，直接返回错误
   */
  private async handleProcessData(ws: WebSocket, message: WebSocketMessage): Promise<void> {
    const instanceId = message.instanceId || this.instanceManager.getInstanceId(ws);

    if (!instanceId) {
      this.sendError(ws, 'Instance ID not found', message.requestId);
      return;
    }

    // 数据请求应该从服务器发起，扩展不应该发送PROCESS_DATA消息到服务器
    console.warn(`${LOG_PREFIX} 收到来自扩展的数据请求，这不应该发生。数据请求应该从服务器发起。`);
    const dataResponse: ProcessDataResponse = {
      status: 'error',
      error: '数据请求应该从服务器发起，而不是从扩展发起',
    };
    this.sendMessage(ws, {
      type: WebSocketMessageType.PROCESS_DATA_RESPONSE,
      responseToRequestId: message.requestId,
      instanceId,
      payload: dataResponse,
    });
  }

  /**
   * 处理列出已发布流程的请求
   * 注意：列出流程请求应该从服务器发起（在listDynamicFlowTools中）
   * 但如果扩展主动发送请求，这里会处理
   * 实际上，扩展不应该发送LIST_PUBLISHED_FLOWS消息到服务器，这个处理器主要是为了兼容性
   */
  private async handleListPublishedFlows(ws: WebSocket, message: WebSocketMessage): Promise<void> {
    const instanceId = message.instanceId || this.instanceManager.getInstanceId(ws);

    if (!instanceId) {
      this.sendError(ws, 'Instance ID not found', message.requestId);
      return;
    }

    // 列出流程请求应该从服务器发起，扩展不应该发送LIST_PUBLISHED_FLOWS消息到服务器
    console.warn(
      `${LOG_PREFIX} 收到来自扩展的列出流程请求，这不应该发生。列出流程请求应该从服务器发起。`,
    );
    this.sendMessage(ws, {
      type: WebSocketMessageType.LIST_PUBLISHED_FLOWS_RESPONSE,
      responseToRequestId: message.requestId,
      instanceId,
      payload: {
        status: 'error',
        error: '列出流程请求应该从服务器发起，而不是从扩展发起',
        items: [],
      },
    });
  }

  /**
   * 处理文件操作
   * 注意：文件操作应该从服务器发起，扩展不应该发送FILE_OPERATION消息到服务器
   * 如果收到，直接返回错误
   */
  private async handleFileOperation(ws: WebSocket, message: WebSocketMessage): Promise<void> {
    const instanceId = message.instanceId || this.instanceManager.getInstanceId(ws);

    if (!instanceId) {
      this.sendError(ws, 'Instance ID not found', message.requestId);
      return;
    }

    // 文件操作应该从服务器发起，扩展不应该发送FILE_OPERATION消息到服务器
    console.warn(
      `${LOG_PREFIX} 收到来自扩展的文件操作请求，这不应该发生。文件操作应该从服务器发起。`,
    );
    this.sendMessage(ws, {
      type: WebSocketMessageType.FILE_OPERATION_RESPONSE,
      responseToRequestId: message.requestId,
      instanceId,
      payload: {
        success: false,
        error: '文件操作应该从服务器发起，而不是从扩展发起',
      },
    });
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
