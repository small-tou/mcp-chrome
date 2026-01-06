/**
 * WebSocket服务器实现
 * 处理来自Chrome扩展的WebSocket连接
 */
import { WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { InstanceManager } from './instance-manager';
import { MessageRouter } from './message-router';
import {
  WebSocketMessage,
  WebSocketMessageType,
  InstanceRegisterRequest,
  InstanceRegisterResponse,
} from 'chrome-mcp-shared';

const LOG_PREFIX = '[WebSocketServer]';

export class WebSocketServerManager {
  private wss: WebSocketServer | null = null;
  private instanceManager: InstanceManager;
  private messageRouter: MessageRouter;

  constructor(instanceManager: InstanceManager, messageRouter: MessageRouter) {
    this.instanceManager = instanceManager;
    this.messageRouter = messageRouter;
  }

  /**
   * 启动WebSocket服务器
   */
  public start(httpServer: HTTPServer, path: string = '/ws'): void {
    if (this.wss) {
      console.warn(`${LOG_PREFIX} WebSocket服务器已在运行`);
      return;
    }

    this.wss = new WebSocketServer({
      server: httpServer,
      path,
    });

    this.wss.on('connection', (ws: WebSocket, request) => {
      this.handleConnection(ws, request);
    });

    console.log(`${LOG_PREFIX} WebSocket服务器已启动，路径: ${path}`);
  }

  /**
   * 处理新连接
   */
  private handleConnection(ws: WebSocket, request: any): void {
    const clientIp = request.socket.remoteAddress;
    console.log(`${LOG_PREFIX} 新客户端连接: ${clientIp}`);

    // 设置消息处理
    ws.on('message', (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch (error) {
        console.error(`${LOG_PREFIX} 解析消息失败`, error);
        this.sendError(ws, 'Invalid message format');
      }
    });

    // 处理连接关闭
    ws.on('close', (code, reason) => {
      console.log(`${LOG_PREFIX} 客户端断开连接: ${clientIp}`, { code, reason: reason.toString() });
      // 从实例管理器中移除
      this.instanceManager.unregisterByConnection(ws);
    });

    // 处理错误
    ws.on('error', (error) => {
      console.error(`${LOG_PREFIX} WebSocket错误: ${clientIp}`, error);
      this.instanceManager.unregisterByConnection(ws);
    });

    // 发送连接确认
    this.sendMessage(ws, {
      type: WebSocketMessageType.PONG,
    });
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(ws: WebSocket, message: WebSocketMessage): void {
    // 处理心跳
    if (message.type === WebSocketMessageType.PING) {
      this.sendMessage(ws, {
        type: WebSocketMessageType.PONG,
      });
      return;
    }

    // 处理实例注册
    if (message.type === WebSocketMessageType.INSTANCE_REGISTER) {
      this.handleInstanceRegister(ws, message);
      return;
    }

    // 处理实例注销
    if (message.type === WebSocketMessageType.INSTANCE_UNREGISTER) {
      this.handleInstanceUnregister(ws, message);
      return;
    }

    // 其他消息通过消息路由器处理
    this.messageRouter.route(ws, message);
  }

  /**
   * 处理实例注册
   */
  private handleInstanceRegister(ws: WebSocket, message: WebSocketMessage): void {
    const request = message.payload as InstanceRegisterRequest;
    const providedInstanceId = message.instanceId;

    try {
      const instanceId = this.instanceManager.register(ws, providedInstanceId);
      const response: InstanceRegisterResponse = {
        instanceId,
        serverInfo: {
          version: process.env.npm_package_version || '1.0.0',
          timestamp: Date.now(),
        },
      };

      this.sendMessage(ws, {
        type: WebSocketMessageType.INSTANCE_REGISTERED,
        responseToRequestId: message.requestId,
        instanceId,
        payload: response,
      });

      console.log(`${LOG_PREFIX} 实例注册成功: ${instanceId}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} 实例注册失败`, error);
      this.sendError(ws, `Instance registration failed: ${error instanceof Error ? error.message : String(error)}`, message.requestId);
    }
  }

  /**
   * 处理实例注销
   */
  private handleInstanceUnregister(ws: WebSocket, message: WebSocketMessage): void {
    const instanceId = message.instanceId;
    if (instanceId) {
      this.instanceManager.unregister(instanceId);
      this.sendMessage(ws, {
        type: WebSocketMessageType.INSTANCE_UNREGISTERED,
        responseToRequestId: message.requestId,
        instanceId,
      });
      console.log(`${LOG_PREFIX} 实例注销成功: ${instanceId}`);
    }
  }

  /**
   * 发送消息到WebSocket连接
   */
  public sendMessage(ws: WebSocket, message: WebSocketMessage): void {
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

  /**
   * 停止WebSocket服务器
   */
  public stop(): void {
    if (this.wss) {
      this.wss.close(() => {
        console.log(`${LOG_PREFIX} WebSocket服务器已停止`);
      });
      this.wss = null;
    }
  }

  /**
   * 获取实例管理器
   */
  public getInstanceManager(): InstanceManager {
    return this.instanceManager;
  }

  /**
   * 获取消息路由器
   */
  public getMessageRouter(): MessageRouter {
    return this.messageRouter;
  }
}
