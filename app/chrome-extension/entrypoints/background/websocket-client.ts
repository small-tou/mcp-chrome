/**
 * WebSocket客户端实现
 * 用于Chrome扩展与Bridge服务器之间的WebSocket通信
 */
import {
  WebSocketMessage,
  WebSocketMessageType,
  InstanceRegisterRequest,
  InstanceRegisterResponse,
  CallToolRequest,
  CallToolResponse,
} from 'chrome-mcp-shared';
import { STORAGE_KEYS, ERROR_MESSAGES, SUCCESS_MESSAGES } from '@/common/constants';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';

const LOG_PREFIX = '[WebSocketClient]';

// ==================== 配置常量 ====================

const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 60_000;
const RECONNECT_MAX_FAST_ATTEMPTS = 8;
const RECONNECT_COOLDOWN_DELAY_MS = 5 * 60_000;
const HEARTBEAT_INTERVAL_MS = 30_000; // 30秒心跳
const HEARTBEAT_TIMEOUT_MS = 10_000; // 10秒心跳超时

// ==================== 状态管理 ====================

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let manualDisconnect = false;
let autoConnectEnabled = true;
let pendingRequests = new Map<string, PendingRequest>();
let messageQueue: WebSocketMessage[] = [];

// ==================== 工具函数 ====================

/**
 * 添加抖动以避免同时重连
 */
function withJitter(ms: number): number {
  const ratio = 0.7 + Math.random() * 0.6;
  return Math.max(0, Math.round(ms * ratio));
}

/**
 * 计算重连延迟
 */
function getReconnectDelayMs(attempt: number): number {
  if (attempt >= RECONNECT_MAX_FAST_ATTEMPTS) {
    return withJitter(RECONNECT_COOLDOWN_DELAY_MS);
  }
  const delay = Math.min(
    RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt),
    RECONNECT_MAX_DELAY_MS,
  );
  return withJitter(delay);
}

/**
 * 生成唯一请求ID
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 获取WebSocket服务器URL
 */
async function getWebSocketUrl(): Promise<string> {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.WEBSOCKET_URL]);
    const url = result[STORAGE_KEYS.WEBSOCKET_URL] as string | undefined;
    if (url) return url;
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to read WebSocket URL from storage`, error);
  }
  
  // 默认URL
  // 注意：在浏览器环境中，process.env可能不可用，使用默认值
  const defaultUrl = typeof process !== 'undefined' && process.env?.WEBSOCKET_URL
    ? process.env.WEBSOCKET_URL
    : 'ws://localhost:12307/ws';
  return defaultUrl;
}

// ==================== 连接管理 ====================

/**
 * 清除重连定时器
 */
function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/**
 * 清除心跳定时器
 */
function clearHeartbeatTimers(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (heartbeatTimeoutTimer) {
    clearTimeout(heartbeatTimeoutTimer);
    heartbeatTimeoutTimer = null;
  }
}

/**
 * 重置重连状态
 */
function resetReconnectState(): void {
  reconnectAttempts = 0;
  clearReconnectTimer();
}

/**
 * 安排重连
 */
function scheduleReconnect(reason: string): void {
  if (ws) return;
  if (manualDisconnect) return;
  if (!autoConnectEnabled) return;
  if (reconnectTimer) return;

  const delay = getReconnectDelayMs(reconnectAttempts);
  console.debug(
    `${LOG_PREFIX} 安排重连，${delay}ms后 (尝试=${reconnectAttempts}, 原因=${reason})`,
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (ws) return;
    if (manualDisconnect || !autoConnectEnabled) return;

    reconnectAttempts += 1;
    void connect().catch(() => {});
  }, delay);
}

/**
 * 启动心跳机制
 */
function startHeartbeat(): void {
  clearHeartbeatTimers();

  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      sendMessage({
        type: WebSocketMessageType.PING,
      });

      // 设置心跳超时
      heartbeatTimeoutTimer = setTimeout(() => {
        console.warn(`${LOG_PREFIX} 心跳超时，关闭连接`);
        if (ws) {
          ws.close();
        }
      }, HEARTBEAT_TIMEOUT_MS);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * 处理心跳响应
 */
function handlePong(): void {
  if (heartbeatTimeoutTimer) {
    clearTimeout(heartbeatTimeoutTimer);
    heartbeatTimeoutTimer = null;
  }
}

/**
 * 发送消息队列中的消息
 */
function flushMessageQueue(): void {
  while (messageQueue.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
    const message = messageQueue.shift();
    if (message) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`${LOG_PREFIX} 发送队列消息失败`, error);
        messageQueue.unshift(message); // 重新加入队列
        break;
      }
    }
  }
}

// ==================== WebSocket连接 ====================

/**
 * 连接到WebSocket服务器
 */
export async function connect(): Promise<boolean> {
  if (ws && ws.readyState === WebSocket.OPEN) {
    return true;
  }

  if (ws) {
    // 如果正在连接或关闭中，等待
    if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.CLOSING) {
      return false;
    }
  }

  try {
    const url = await getWebSocketUrl();
    console.debug(`${LOG_PREFIX} 连接到WebSocket服务器: ${url}`);

    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log(`${LOG_PREFIX} WebSocket连接已建立`);
      resetReconnectState();
      startHeartbeat();
      flushMessageQueue();
      broadcastConnectionStatus(true);
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error(`${LOG_PREFIX} 解析消息失败`, error);
      }
    };

    ws.onerror = (error) => {
      console.error(`${LOG_PREFIX} WebSocket错误`, error);
    };

    ws.onclose = (event) => {
      console.warn(`${LOG_PREFIX} WebSocket连接已关闭`, {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      ws = null;
      clearHeartbeatTimers();
      broadcastConnectionStatus(false);

      // 处理未完成的请求
      pendingRequests.forEach((pending) => {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error('WebSocket连接已关闭'));
      });
      pendingRequests.clear();

      // 如果不是手动断开，安排重连
      if (!manualDisconnect && autoConnectEnabled) {
        scheduleReconnect('connection_closed');
      } else {
        manualDisconnect = false;
      }
    };

    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} 连接失败`, error);
    ws = null;
    scheduleReconnect('connect_failed');
    return false;
  }
}

/**
 * 断开WebSocket连接
 */
export function disconnect(): void {
  manualDisconnect = true;
  clearReconnectTimer();
  clearHeartbeatTimers();

  if (ws) {
    ws.close();
    ws = null;
  }

  // 拒绝所有待处理的请求
  pendingRequests.forEach((pending) => {
    clearTimeout(pending.timeoutId);
    pending.reject(new Error('手动断开连接'));
  });
  pendingRequests.clear();
  messageQueue = [];
}

/**
 * 检查连接状态
 */
export function isConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

// ==================== 消息处理 ====================

/**
 * 消息监听器类型
 */
type MessageListener = (message: WebSocketMessage) => void | Promise<void>;

/**
 * 消息监听器映射
 */
const messageListeners: Map<WebSocketMessageType, MessageListener[]> = new Map();

/**
 * 注册消息监听器
 */
export function addMessageListener(
  type: WebSocketMessageType,
  listener: MessageListener,
): void {
  if (!messageListeners.has(type)) {
    messageListeners.set(type, []);
  }
  messageListeners.get(type)!.push(listener);
}

/**
 * 移除消息监听器
 */
export function removeMessageListener(
  type: WebSocketMessageType,
  listener: MessageListener,
): void {
  const listeners = messageListeners.get(type);
  if (listeners) {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }
}

/**
 * 触发消息监听器
 */
async function triggerMessageListeners(message: WebSocketMessage): Promise<void> {
  const listeners = messageListeners.get(message.type);
  if (listeners) {
    for (const listener of listeners) {
      try {
        await listener(message);
      } catch (error) {
        console.error(`${LOG_PREFIX} 消息监听器执行失败`, error);
      }
    }
  }
}

/**
 * 处理接收到的消息
 */
function handleMessage(message: WebSocketMessage): void {
  // 处理心跳
  if (message.type === WebSocketMessageType.PONG) {
    handlePong();
    return;
  }

  // 处理响应消息
  if (message.responseToRequestId) {
    const pending = pendingRequests.get(message.responseToRequestId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      if (message.error) {
        pending.reject(new Error(message.error as string));
      } else {
        pending.resolve(message.payload);
      }
      pendingRequests.delete(message.responseToRequestId);
    }
    // 即使有pending request，也触发监听器（用于状态更新等）
    void triggerMessageListeners(message);
    return;
  }

  // 处理其他类型的消息（触发监听器）
  void triggerMessageListeners(message);
  console.debug(`${LOG_PREFIX} 收到消息`, message);
}

// ==================== 消息发送 ====================

/**
 * 发送消息（不等待响应）
 */
export function sendMessage(message: WebSocketMessage): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    // 如果未连接，加入队列
    messageQueue.push(message);
    // 尝试连接
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      void connect();
    }
    return;
  }

  try {
    ws.send(JSON.stringify(message));
  } catch (error) {
    console.error(`${LOG_PREFIX} 发送消息失败`, error);
    messageQueue.push(message);
  }
}

/**
 * 发送请求并等待响应
 */
export function sendRequest<T = any>(
  message: WebSocketMessage,
  timeoutMs: number = 30_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = generateRequestId();
    const messageWithId: WebSocketMessage = {
      ...message,
      requestId,
    };

    const timeoutId = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`请求超时 (${timeoutMs}ms)`));
    }, timeoutMs);

    pendingRequests.set(requestId, {
      resolve: (value: T) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      reject: (reason?: any) => {
        clearTimeout(timeoutId);
        reject(reason);
      },
      timeoutId,
    });

    sendMessage(messageWithId);
  });
}

// ==================== 广播状态 ====================

/**
 * 广播连接状态变化
 */
function broadcastConnectionStatus(connected: boolean): void {
  chrome.runtime
    .sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.WEBSOCKET_STATUS_CHANGED,
      payload: { connected },
    })
    .catch(() => {
      // 忽略错误（可能没有监听器）
    });
}

// ==================== 初始化 ====================

/**
 * 初始化WebSocket客户端
 */
export function initWebSocketClient(): void {
  // 加载自动连接设置
  chrome.storage.local
    .get([STORAGE_KEYS.WEBSOCKET_AUTO_CONNECT_ENABLED])
    .then((result) => {
      const enabled = result[STORAGE_KEYS.WEBSOCKET_AUTO_CONNECT_ENABLED] ?? true;
      autoConnectEnabled = enabled;
      if (enabled) {
        void connect();
      }
    })
    .catch((error) => {
      console.warn(`${LOG_PREFIX} 加载自动连接设置失败`, error);
      // 默认启用自动连接
      void connect();
    });

  // 监听扩展启动
  chrome.runtime.onStartup.addListener(() => {
    if (autoConnectEnabled) {
      void connect();
    }
  });

  // 监听扩展安装/更新
  chrome.runtime.onInstalled.addListener(() => {
    if (autoConnectEnabled) {
      void connect();
    }
  });
}
