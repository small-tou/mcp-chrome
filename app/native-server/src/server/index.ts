/**
 * HTTP Server - Core server implementation.
 *
 * Responsibilities:
 * - Fastify instance management
 * - Plugin registration (CORS, etc.)
 * - Route delegation to specialized modules
 * - MCP transport handling
 * - Server lifecycle management
 */
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import {
  NATIVE_SERVER_PORT,
  TIMEOUTS,
  SERVER_CONFIG,
  HTTP_STATUS,
  ERROR_MESSAGES,
} from '../constant';
import { NativeMessagingHost } from '../native-messaging-host';
import { WebSocketServerManager } from '../websocket/websocket-server';
import { InstanceManager } from '../websocket/instance-manager';
import { MessageRouter } from '../websocket/message-router';
import { WEBSOCKET_SERVER_PORT, WEBSOCKET_SERVER_PATH } from '../constant';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { getMcpServer } from '../mcp/mcp-server';
import { AgentStreamManager } from '../agent/stream-manager';
import { AgentChatService } from '../agent/chat-service';
import { CodexEngine } from '../agent/engines/codex';
import { ClaudeEngine } from '../agent/engines/claude';
import { closeDb } from '../agent/db';
import { registerAgentRoutes } from './routes';

// ============================================================
// Types
// ============================================================

interface ExtensionRequestPayload {
  data?: unknown;
}

// ============================================================
// Server Class
// ============================================================

export class Server {
  private fastify: FastifyInstance;
  public isRunning = false;
  private nativeHost: NativeMessagingHost | null = null;
  private transportsMap: Map<string, StreamableHTTPServerTransport | SSEServerTransport> =
    new Map();
  private agentStreamManager: AgentStreamManager;
  private agentChatService: AgentChatService;
  private websocketServer: WebSocketServerManager | null = null;
  private instanceManager: InstanceManager | null = null;

  constructor() {
    this.fastify = Fastify({ logger: SERVER_CONFIG.LOGGER_ENABLED });
    this.agentStreamManager = new AgentStreamManager();
    this.agentChatService = new AgentChatService({
      engines: [new CodexEngine(), new ClaudeEngine()],
      streamManager: this.agentStreamManager,
    });
    this.setupPlugins();
    this.setupRoutes();
  }

  /**
   * Associate NativeMessagingHost instance.
   */
  public setNativeHost(nativeHost: NativeMessagingHost): void {
    this.nativeHost = nativeHost;
  }

  private async setupPlugins(): Promise<void> {
    await this.fastify.register(cors, {
      origin: (origin, cb) => {
        // Allow requests with no origin (e.g., curl, server-to-server)
        if (!origin) {
          return cb(null, true);
        }
        // Check if origin matches any pattern in whitelist
        const allowed = SERVER_CONFIG.CORS_ORIGIN.some((pattern) =>
          pattern instanceof RegExp ? pattern.test(origin) : origin.startsWith(pattern),
        );
        cb(null, allowed);
      },
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      credentials: true,
    });
  }

  private setupRoutes(): void {
    // Health check
    this.setupHealthRoutes();

    // Extension communication
    this.setupExtensionRoutes();

    // Agent routes (delegated to separate module)
    registerAgentRoutes(this.fastify, {
      streamManager: this.agentStreamManager,
      chatService: this.agentChatService,
    });

    // MCP routes
    this.setupMcpRoutes();
  }

  // ============================================================
  // Health Routes
  // ============================================================

  private setupHealthRoutes(): void {
    this.fastify.get('/ping', async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.status(HTTP_STATUS.OK).send({
        status: 'ok',
        message: 'pong',
      });
    });
  }

  // ============================================================
  // Extension Routes
  // ============================================================

  private setupExtensionRoutes(): void {
    // 已移除 /ask-extension 路由，所有通信现在通过 WebSocket 进行
    // 如果需要与扩展通信，请使用 WebSocket 连接
  }

  // ============================================================
  // MCP Routes
  // ============================================================

  private setupMcpRoutes(): void {
    // SSE endpoint
    this.fastify.get('/sse', async (_, reply) => {
      try {
        reply.raw.writeHead(HTTP_STATUS.OK, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        const transport = new SSEServerTransport('/messages', reply.raw);
        this.transportsMap.set(transport.sessionId, transport);

        reply.raw.on('close', () => {
          this.transportsMap.delete(transport.sessionId);
        });

        const server = getMcpServer();
        await server.connect(transport);

        reply.raw.write(':\n\n');
      } catch (error) {
        if (!reply.sent) {
          reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
        }
      }
    });

    // SSE messages endpoint
    this.fastify.post('/messages', async (req, reply) => {
      try {
        const { sessionId } = req.query as { sessionId?: string };
        const transport = this.transportsMap.get(sessionId || '') as SSEServerTransport;
        if (!sessionId || !transport) {
          reply.code(HTTP_STATUS.BAD_REQUEST).send('No transport found for sessionId');
          return;
        }

        await transport.handlePostMessage(req.raw, reply.raw, req.body);
      } catch (error) {
        if (!reply.sent) {
          reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
        }
      }
    });

    // MCP POST endpoint
    this.fastify.post('/mcp', async (request, reply) => {
      const sessionId = request.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport | undefined = this.transportsMap.get(
        sessionId || '',
      ) as StreamableHTTPServerTransport;

      if (transport) {
        // Transport found, proceed
      } else if (!sessionId && isInitializeRequest(request.body)) {
        const newSessionId = randomUUID();

        // 从多个来源提取 INSTANCE_ID 鉴权参数（优先级：初始化 params > HTTP header > URL query）
        const initializeParams = (request.body as any)?.params;
        const instanceId =
          initializeParams?.INSTANCE_ID ||
          (request.headers['x-instance-id'] as string | undefined) ||
          ((request.query as any)?.instanceId as string | undefined);

        if (instanceId) {
          // 将 INSTANCE_ID 存储到 session 映射中
          const { sessionInstanceIdMap } = await import('../mcp/mcp-server.js');
          sessionInstanceIdMap.set(newSessionId, instanceId);
          console.log(
            `[MCP] 初始化请求中提取到 INSTANCE_ID: ${instanceId}，sessionId: ${newSessionId}`,
          );
        } else {
          console.warn(`[MCP] 初始化请求中未找到 INSTANCE_ID 鉴权参数`);
        }

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          onsessioninitialized: (initializedSessionId) => {
            if (transport && initializedSessionId === newSessionId) {
              this.transportsMap.set(initializedSessionId, transport);
            }
          },
        });

        transport.onclose = async () => {
          if (transport?.sessionId) {
            // 清理 session 映射
            const { sessionInstanceIdMap } = await import('../mcp/mcp-server.js');
            sessionInstanceIdMap.delete(transport.sessionId);
            this.transportsMap.delete(transport.sessionId);
          }
        };
        await getMcpServer().connect(transport);
      } else {
        reply.code(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.INVALID_MCP_REQUEST });
        return;
      }

      // 此时 transport 一定存在（因为前面的逻辑已经确保创建或获取了 transport）
      // 但为了类型安全，我们需要显式检查
      if (!transport) {
        reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({ error: 'Transport not available' });
        return;
      }

      // 使用局部变量确保类型窄化
      const finalTransport: StreamableHTTPServerTransport = transport;
      const finalSessionId = finalTransport.sessionId || sessionId || '';

      try {
        // 使用 AsyncLocalStorage 在当前异步上下文中存储 sessionId
        const { sessionIdStorage } = await import('../mcp/mcp-server.js');
        await sessionIdStorage.run(finalSessionId, async () => {
          await finalTransport.handleRequest(request.raw, reply.raw, request.body);
        });
      } catch (error) {
        if (!reply.sent) {
          reply
            .code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
            .send({ error: ERROR_MESSAGES.MCP_REQUEST_PROCESSING_ERROR });
        }
      }
    });

    // MCP GET endpoint (SSE stream)
    this.fastify.get('/mcp', async (request, reply) => {
      const sessionId = request.headers['mcp-session-id'] as string | undefined;
      const transport = sessionId
        ? (this.transportsMap.get(sessionId) as StreamableHTTPServerTransport)
        : undefined;

      if (!transport) {
        reply.code(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.INVALID_SSE_SESSION });
        return;
      }

      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.flushHeaders();

      try {
        await transport.handleRequest(request.raw, reply.raw);
        if (!reply.sent) {
          reply.hijack();
        }
      } catch (error) {
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
      }

      request.socket.on('close', () => {
        request.log.info(`SSE client disconnected for session: ${sessionId}`);
      });
    });

    // MCP DELETE endpoint
    this.fastify.delete('/mcp', async (request, reply) => {
      const sessionId = request.headers['mcp-session-id'] as string | undefined;
      const transport = sessionId
        ? (this.transportsMap.get(sessionId) as StreamableHTTPServerTransport)
        : undefined;

      if (!transport) {
        reply.code(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.INVALID_SESSION_ID });
        return;
      }

      try {
        await transport.handleRequest(request.raw, reply.raw);
        if (!reply.sent) {
          reply.code(HTTP_STATUS.NO_CONTENT).send();
        }
      } catch (error) {
        if (!reply.sent) {
          reply
            .code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
            .send({ error: ERROR_MESSAGES.MCP_SESSION_DELETION_ERROR });
        }
      }
    });
  }

  // ============================================================
  // Server Lifecycle
  // ============================================================

  public async start(port = NATIVE_SERVER_PORT, nativeHost: NativeMessagingHost): Promise<void> {
    if (!this.nativeHost) {
      this.nativeHost = nativeHost;
    } else if (this.nativeHost !== nativeHost) {
      this.nativeHost = nativeHost;
    }

    if (this.isRunning) {
      return;
    }

    try {
      await this.fastify.listen({ port, host: SERVER_CONFIG.HOST });

      // Set port environment variables after successful listen for Chrome MCP URL resolution
      process.env.CHROME_MCP_PORT = String(port);
      process.env.MCP_HTTP_PORT = String(port);

      // 初始化WebSocket服务器
      await this.initWebSocketServer();

      this.isRunning = true;
    } catch (err) {
      this.isRunning = false;
      throw err;
    }
  }

  /**
   * 初始化WebSocket服务器
   */
  private async initWebSocketServer(): Promise<void> {
    if (this.websocketServer) {
      return; // 已经初始化
    }

    // 创建实例管理器和消息路由器
    this.instanceManager = new InstanceManager();
    const messageRouter = new MessageRouter(this.instanceManager);

    // 创建WebSocket服务器管理器
    this.websocketServer = new WebSocketServerManager(this.instanceManager, messageRouter);

    // 启动WebSocket服务器（使用Fastify的HTTP服务器）
    const httpServer = this.fastify.server;
    this.websocketServer.start(httpServer, WEBSOCKET_SERVER_PATH);

    // 启动定期清理任务
    this.instanceManager.startCleanupTask();

    console.log(`[Server] WebSocket服务器已启动，路径: ${WEBSOCKET_SERVER_PATH}`);

    // 更新MCP Server的工具调用处理器，传入InstanceManager引用
    const { setupTools } = await import('../mcp/register-tools.js');
    const mcpServer = getMcpServer();
    setupTools(mcpServer, this.instanceManager, this.websocketServer);
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // 停止WebSocket服务器
      if (this.websocketServer) {
        this.websocketServer.stop();
        this.websocketServer = null;
        this.instanceManager = null;
      }

      await this.fastify.close();
      closeDb();
      this.isRunning = false;
    } catch (err) {
      this.isRunning = false;
      closeDb();
      throw err;
    }
  }

  /**
   * 获取实例管理器（用于工具调用）
   */
  public getInstanceManager(): InstanceManager | null {
    return this.instanceManager;
  }

  /**
   * 获取WebSocket服务器管理器
   */
  public getWebSocketServer(): WebSocketServerManager | null {
    return this.websocketServer;
  }

  public getInstance(): FastifyInstance {
    return this.fastify;
  }
}

const serverInstance = new Server();
export default serverInstance;
