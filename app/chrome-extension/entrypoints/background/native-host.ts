/**
 * Bridge连接管理器（原Native Host，现使用WebSocket）
 * 使用WebSocket客户端替代Native Messaging
 */
import { NativeMessageType } from 'chrome-mcp-shared';
import {
  WebSocketMessage,
  WebSocketMessageType,
  CallToolRequest,
  CallToolResponse,
  ProcessDataRequest,
  ProcessDataResponse,
} from 'chrome-mcp-shared';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import { STORAGE_KEYS, ERROR_MESSAGES, SUCCESS_MESSAGES, WEBSOCKET_CONFIG } from '@/common/constants';
import { handleCallTool } from './tools';
import { listPublished, getFlow } from './record-replay/flow-store';
import { acquireKeepalive } from './keepalive-manager';
import {
  connect as connectWebSocket,
  disconnect as disconnectWebSocket,
  isConnected as isWebSocketConnected,
  sendRequest as sendWebSocketRequest,
  sendMessage as sendWebSocketMessage,
  addMessageListener,
} from './websocket-client';
import { getCurrentInstanceId, registerInstance } from './instance-manager';

const LOG_PREFIX = '[BridgeHost]';

// ==================== 状态管理 ====================

let keepaliveRelease: (() => void) | null = null;
let autoConnectEnabled = true;
let autoConnectLoaded = false;
let ensurePromise: Promise<boolean> | null = null;

/**
 * Server status management interface
 */
interface ServerStatus {
  isRunning: boolean;
  port?: number;
  lastUpdated: number;
}

let currentServerStatus: ServerStatus = {
  isRunning: false,
  lastUpdated: Date.now(),
};

// ==================== 消息监听器 ====================

type MessageListener = (message: any) => void | Promise<void>;
const messageListeners: Map<string, MessageListener[]> = new Map();

/**
 * 注册消息监听器
 */
function addMessageListener(type: string, listener: MessageListener): void {
  if (!messageListeners.has(type)) {
    messageListeners.set(type, []);
  }
  messageListeners.get(type)!.push(listener);
}

/**
 * 触发消息监听器
 */
async function triggerMessageListeners(type: string, message: any): Promise<void> {
  const listeners = messageListeners.get(type);
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

// ==================== 服务器状态管理 ====================

/**
 * Save server status to chrome.storage
 */
async function saveServerStatus(status: ServerStatus): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.SERVER_STATUS]: status });
  } catch (error) {
    console.error(ERROR_MESSAGES.SERVER_STATUS_SAVE_FAILED, error);
  }
}

/**
 * Load server status from chrome.storage
 */
async function loadServerStatus(): Promise<ServerStatus> {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.SERVER_STATUS]);
    if (result[STORAGE_KEYS.SERVER_STATUS]) {
      return result[STORAGE_KEYS.SERVER_STATUS];
    }
  } catch (error) {
    console.error(ERROR_MESSAGES.SERVER_STATUS_LOAD_FAILED, error);
  }
  return {
    isRunning: false,
    lastUpdated: Date.now(),
  };
}

/**
 * Broadcast server status change to all listeners
 */
function broadcastServerStatusChange(status: ServerStatus): void {
  chrome.runtime
    .sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.SERVER_STATUS_CHANGED,
      payload: status,
    })
    .catch(() => {
      // Ignore errors if no listeners are present
    });
}

// ==================== Keepalive Management ====================

/**
 * Sync keepalive hold based on autoConnectEnabled state.
 */
function syncKeepaliveHold(): void {
  if (autoConnectEnabled) {
    if (!keepaliveRelease) {
      keepaliveRelease = acquireKeepalive('bridge-host');
      console.debug(`${LOG_PREFIX} Acquired keepalive`);
    }
    return;
  }
  if (keepaliveRelease) {
    try {
      keepaliveRelease();
      console.debug(`${LOG_PREFIX} Released keepalive`);
    } catch {
      // Ignore
    }
    keepaliveRelease = null;
  }
}

// ==================== Auto-connect Settings ====================

/**
 * Load the autoConnectEnabled setting from storage.
 */
async function loadAutoConnectEnabled(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.WEBSOCKET_AUTO_CONNECT_ENABLED]);
    const raw = result[STORAGE_KEYS.WEBSOCKET_AUTO_CONNECT_ENABLED];
    if (typeof raw === 'boolean') return raw;
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to load autoConnectEnabled`, error);
  }
  return true; // Default to enabled
}

/**
 * Set the autoConnectEnabled setting and persist to storage.
 */
async function setAutoConnectEnabled(enabled: boolean): Promise<void> {
  autoConnectEnabled = enabled;
  autoConnectLoaded = true;
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.WEBSOCKET_AUTO_CONNECT_ENABLED]: enabled });
    console.debug(`${LOG_PREFIX} Set autoConnectEnabled=${enabled}`);
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to persist autoConnectEnabled`, error);
  }
  syncKeepaliveHold();
}

// ==================== 消息处理 ====================

/**
 * 处理来自WebSocket服务器的消息
 */
function setupWebSocketMessageHandlers(): void {
  // 这些处理器会在websocket-client中调用
  // 我们需要在这里注册处理器
}

/**
 * 处理工具调用请求（从服务器接收）
 */
async function handleIncomingCallTool(message: WebSocketMessage): Promise<void> {
  const request = message.payload as CallToolRequest;
  const instanceId = message.instanceId || getCurrentInstanceId();

  try {
    const result = await handleCallTool(request);
    const response: CallToolResponse = {
      status: 'success',
      data: result,
    };

    sendWebSocketMessage({
      type: WebSocketMessageType.CALL_TOOL_RESPONSE,
      responseToRequestId: message.requestId,
      instanceId,
      payload: response,
    });
  } catch (error) {
    const response: CallToolResponse = {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
    sendWebSocketMessage({
      type: WebSocketMessageType.CALL_TOOL_RESPONSE,
      responseToRequestId: message.requestId,
      instanceId,
      payload: response,
    });
  }
}

/**
 * 处理数据请求（从服务器接收）
 */
async function handleIncomingProcessData(message: WebSocketMessage): Promise<void> {
  const request = message.payload as ProcessDataRequest;
  const instanceId = message.instanceId || getCurrentInstanceId();

  try {
    const response: ProcessDataResponse = {
      status: 'success',
      data: request.data,
    };

    sendWebSocketMessage({
      type: WebSocketMessageType.PROCESS_DATA_RESPONSE,
      responseToRequestId: message.requestId,
      instanceId,
      payload: response,
    });
  } catch (error) {
    const response: ProcessDataResponse = {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
    sendWebSocketMessage({
      type: WebSocketMessageType.PROCESS_DATA_RESPONSE,
      responseToRequestId: message.requestId,
      instanceId,
      payload: response,
    });
  }
}

/**
 * 处理列出已发布流程的请求
 */
async function handleIncomingListPublishedFlows(message: WebSocketMessage): Promise<void> {
  const instanceId = message.instanceId || getCurrentInstanceId();

  try {
    const published = await listPublished();
    const items = [] as any[];
    for (const p of published) {
      const flow = await getFlow(p.id);
      if (!flow) continue;
      items.push({
        id: p.id,
        slug: p.slug,
        version: p.version,
        name: p.name,
        description: p.description || flow.description || '',
        variables: flow.variables || [],
        meta: flow.meta || {},
      });
    }

    sendWebSocketMessage({
      type: WebSocketMessageType.LIST_PUBLISHED_FLOWS_RESPONSE,
      responseToRequestId: message.requestId,
      instanceId,
      payload: { status: 'success', items },
    });
  } catch (error: any) {
    sendWebSocketMessage({
      type: WebSocketMessageType.LIST_PUBLISHED_FLOWS_RESPONSE,
      responseToRequestId: message.requestId,
      instanceId,
      payload: { status: 'error', error: error?.message || String(error) },
    });
  }
}

// ==================== Core Ensure Function ====================

/**
 * Ensure WebSocket connection is established.
 * This is the main entry point for auto-connect logic.
 *
 * @param trigger - Description of what triggered this call (for logging)
 * @returns Whether the connection is now established
 */
async function ensureConnected(trigger: string): Promise<boolean> {
  // Concurrency protection: only one ensure flow at a time
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    // Load auto-connect setting if not yet loaded
    if (!autoConnectLoaded) {
      autoConnectEnabled = await loadAutoConnectEnabled();
      autoConnectLoaded = true;
      syncKeepaliveHold();
    }

    // If auto-connect is disabled, do nothing
    if (!autoConnectEnabled) {
      console.debug(`${LOG_PREFIX} Auto-connect disabled, skipping ensure (trigger=${trigger})`);
      return false;
    }

    // Sync keepalive hold
    syncKeepaliveHold();

    // Already connected
    if (isWebSocketConnected()) {
      console.debug(`${LOG_PREFIX} Already connected (trigger=${trigger})`);
      // 确保实例已注册
      const instanceId = getCurrentInstanceId();
      if (!instanceId) {
        try {
          await registerInstance();
        } catch (error) {
          console.warn(`${LOG_PREFIX} 实例注册失败`, error);
        }
      }
      return true;
    }

    console.debug(`${LOG_PREFIX} Attempting connection (trigger=${trigger})`);

    // Attempt connection
    const connected = await connectWebSocket();
    if (!connected) {
      console.warn(`${LOG_PREFIX} Connection failed (trigger=${trigger})`);
      return false;
    }

    // 注册实例
    try {
      await registerInstance();
    } catch (error) {
      console.warn(`${LOG_PREFIX} 实例注册失败`, error);
    }

    // 更新服务器状态
    currentServerStatus = {
      isRunning: true,
      lastUpdated: Date.now(),
    };
    await saveServerStatus(currentServerStatus);
    broadcastServerStatusChange(currentServerStatus);

    console.debug(`${LOG_PREFIX} Connection established successfully (trigger=${trigger})`);
    return true;
  })().finally(() => {
    ensurePromise = null;
  });

  return ensurePromise;
}

/**
 * Connect to the bridge server via WebSocket
 * @returns Whether the connection was initiated successfully
 */
export function connectNativeHost(_port?: number): boolean {
  if (isWebSocketConnected()) {
    return true;
  }

  void connectWebSocket()
    .then((connected) => {
      if (connected) {
        void registerInstance().catch((error) => {
          console.warn(`${LOG_PREFIX} 实例注册失败`, error);
        });
      }
    })
    .catch((error) => {
      console.warn(`${LOG_PREFIX} 连接失败`, error);
    });

  return true;
}

/**
 * Mark server as stopped and broadcast the change.
 */
async function markServerStopped(reason: string): Promise<void> {
  currentServerStatus = {
    isRunning: false,
    port: currentServerStatus.port,
    lastUpdated: Date.now(),
  };
  try {
    await saveServerStatus(currentServerStatus);
  } catch {
    // Ignore
  }
  broadcastServerStatusChange(currentServerStatus);
  console.debug(`${LOG_PREFIX} Server marked stopped (${reason})`);
}

/**
 * Initialize bridge host listeners and load initial state
 */
export const initNativeHostListener = () => {
  // Initialize server status from storage
  loadServerStatus()
    .then((status) => {
      currentServerStatus = status;
    })
    .catch((error) => {
      console.error(ERROR_MESSAGES.SERVER_STATUS_LOAD_FAILED, error);
    });

  // 注册WebSocket消息处理器
  // 注册工具调用处理器
  addMessageListener(WebSocketMessageType.CALL_TOOL, handleIncomingCallTool);
  // 注册数据请求处理器
  addMessageListener(WebSocketMessageType.PROCESS_DATA, handleIncomingProcessData);
  // 注册列出流程处理器
  addMessageListener(WebSocketMessageType.LIST_PUBLISHED_FLOWS, handleIncomingListPublishedFlows);

  // Auto-connect on SW activation (covers SW restart after idle termination)
  void ensureConnected('sw_startup').catch(() => {});

  // Auto-connect on Chrome browser startup
  chrome.runtime.onStartup.addListener(() => {
    void ensureConnected('onStartup').catch(() => {});
  });

  // Auto-connect on extension install/update
  chrome.runtime.onInstalled.addListener(() => {
    void ensureConnected('onInstalled').catch(() => {});
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Allow UI to call tools directly
    if (message && message.type === 'call_tool' && message.name) {
      handleCallTool({ name: message.name, args: message.args })
        .then((res) => sendResponse({ success: true, result: res }))
        .catch((err) =>
          sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) }),
        );
      return true;
    }

    const msgType = typeof message === 'string' ? message : message?.type;

    // ENSURE_NATIVE: Trigger ensure without changing autoConnectEnabled
    if (msgType === NativeMessageType.ENSURE_NATIVE) {
      ensureConnected('ui_ensure')
        .then((connected) => {
          sendResponse({ success: true, connected, autoConnectEnabled });
        })
        .catch((e) => {
          sendResponse({ success: false, connected: isWebSocketConnected(), error: String(e) });
        });
      return true;
    }

    // CONNECT_NATIVE: Explicit user connect, re-enables auto-connect
    if (msgType === NativeMessageType.CONNECT_NATIVE) {
      (async () => {
        // Explicit user connect: re-enable auto-connect
        await setAutoConnectEnabled(true);
        return ensureConnected('ui_connect');
      })()
        .then((connected) => {
          sendResponse({ success: true, connected });
        })
        .catch((e) => {
          sendResponse({ success: false, connected: isWebSocketConnected(), error: String(e) });
        });
      return true;
    }

    if (msgType === NativeMessageType.PING_NATIVE) {
      const connected = isWebSocketConnected();
      sendResponse({ connected, autoConnectEnabled });
      return true;
    }

    // DISCONNECT_NATIVE: Explicit user disconnect, disables auto-connect
    if (msgType === NativeMessageType.DISCONNECT_NATIVE) {
      (async () => {
        // Explicit user disconnect: disable auto-connect
        await setAutoConnectEnabled(false);
        syncKeepaliveHold();

        if (isWebSocketConnected()) {
          disconnectWebSocket();
        }
        await markServerStopped('manual_disconnect');
      })()
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((e) => {
          sendResponse({ success: false, error: String(e) });
        });
      return true;
    }

    if (message.type === BACKGROUND_MESSAGE_TYPES.GET_SERVER_STATUS) {
      sendResponse({
        success: true,
        serverStatus: currentServerStatus,
        connected: isWebSocketConnected(),
      });
      return true;
    }

    if (message.type === BACKGROUND_MESSAGE_TYPES.REFRESH_SERVER_STATUS) {
      loadServerStatus()
        .then((storedStatus) => {
          currentServerStatus = storedStatus;
          sendResponse({
            success: true,
            serverStatus: currentServerStatus,
            connected: isWebSocketConnected(),
          });
        })
        .catch((error) => {
          console.error(ERROR_MESSAGES.SERVER_STATUS_LOAD_FAILED, error);
          sendResponse({
            success: false,
            error: ERROR_MESSAGES.SERVER_STATUS_LOAD_FAILED,
            serverStatus: currentServerStatus,
            connected: isWebSocketConnected(),
          });
        });
      return true;
    }

    // Forward file operation messages (通过WebSocket发送)
    if (message.type === 'forward_to_native' && message.message) {
      if (isWebSocketConnected()) {
        const instanceId = getCurrentInstanceId();
        sendWebSocketMessage({
          type: WebSocketMessageType.FILE_OPERATION,
          instanceId,
          payload: message.message,
        });
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'WebSocket not connected' });
      }
      return true;
    }
  });
};

// 导出兼容性常量
export const HOST_NAME = 'websocket-bridge';
