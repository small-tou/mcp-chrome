/**
 * 外部消息监听
 * 允许网页通过chrome.runtime.sendMessage触发扩展事件
 */
import { registerInstance, getCurrentInstanceId } from './instance-manager';
import { connect, isConnected } from './websocket-client';

const LOG_PREFIX = '[ExternalMessaging]';

// ==================== 消息类型定义 ====================

/**
 * 实例注册请求消息
 */
interface InstanceRegisterMessage {
  type: 'register_instance';
  payload?: {
    // 可选的客户端信息
    clientInfo?: {
      userAgent?: string;
      timestamp?: number;
    };
  };
}

/**
 * 实例注册响应
 */
interface InstanceRegisterResponse {
  success: boolean;
  instanceId?: string;
  error?: string;
}

/**
 * 获取实例ID请求
 */
interface GetInstanceIdMessage {
  type: 'get_instance_id';
}

/**
 * 获取实例ID响应
 */
interface GetInstanceIdResponse {
  success: boolean;
  instanceId?: string;
  error?: string;
}

/**
 * 连接WebSocket请求
 */
interface ConnectWebSocketMessage {
  type: 'connect_websocket';
  payload?: {
    url?: string;
  };
}

/**
 * 连接WebSocket响应
 */
interface ConnectWebSocketResponse {
  success: boolean;
  connected?: boolean;
  error?: string;
}

/**
 * 检查连接状态请求
 */
interface CheckConnectionMessage {
  type: 'check_connection';
}

/**
 * 检查连接状态响应
 */
interface CheckConnectionResponse {
  success: boolean;
  connected: boolean;
  instanceId?: string;
}

// ==================== 消息处理 ====================

/**
 * 处理实例注册请求
 */
async function handleRegisterInstance(
  message: InstanceRegisterMessage,
): Promise<InstanceRegisterResponse> {
  try {
    // 确保WebSocket已连接
    if (!isConnected()) {
      await connect();
    }

    // 注册实例
    const instanceId = await registerInstance();
    return {
      success: true,
      instanceId,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} 实例注册失败`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 处理获取实例ID请求
 */
async function handleGetInstanceId(
  _message: GetInstanceIdMessage,
): Promise<GetInstanceIdResponse> {
  try {
    const instanceId = getCurrentInstanceId();
    if (instanceId) {
      return {
        success: true,
        instanceId,
      };
    } else {
      // 如果没有实例ID，尝试注册
      const newInstanceId = await registerInstance();
      return {
        success: true,
        instanceId: newInstanceId,
      };
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} 获取实例ID失败`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 处理连接WebSocket请求
 */
async function handleConnectWebSocket(
  message: ConnectWebSocketMessage,
): Promise<ConnectWebSocketResponse> {
  try {
    if (message.payload?.url) {
      // 如果提供了URL，保存到存储
      await chrome.storage.local.set({
        websocketUrl: message.payload.url,
      });
    }

    const connected = await connect();
    return {
      success: true,
      connected,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} 连接WebSocket失败`, error);
    return {
      success: false,
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 处理检查连接状态请求
 */
async function handleCheckConnection(
  _message: CheckConnectionMessage,
): Promise<CheckConnectionResponse> {
  const connected = isConnected();
  const instanceId = getCurrentInstanceId();
  return {
    success: true,
    connected,
    instanceId: instanceId || undefined,
  };
}

// ==================== 消息监听器 ====================

/**
 * 初始化外部消息监听
 */
export function initExternalMessaging(): void {
  chrome.runtime.onMessageExternal.addListener(
    (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      // 处理实例注册
      if (message && message.type === 'register_instance') {
        handleRegisterInstance(message as InstanceRegisterMessage)
          .then((response) => sendResponse(response))
          .catch((error) => {
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        return true; // 保持消息通道开放以支持异步响应
      }

      // 处理获取实例ID
      if (message && message.type === 'get_instance_id') {
        handleGetInstanceId(message as GetInstanceIdMessage)
          .then((response) => sendResponse(response))
          .catch((error) => {
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        return true;
      }

      // 处理连接WebSocket
      if (message && message.type === 'connect_websocket') {
        handleConnectWebSocket(message as ConnectWebSocketMessage)
          .then((response) => sendResponse(response))
          .catch((error) => {
            sendResponse({
              success: false,
              connected: false,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        return true;
      }

      // 处理检查连接状态
      if (message && message.type === 'check_connection') {
        handleCheckConnection(message as CheckConnectionMessage)
          .then((response) => sendResponse(response))
          .catch((error) => {
            sendResponse({
              success: false,
              connected: false,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        return true;
      }

      // 未知消息类型
      console.warn(`${LOG_PREFIX} 收到未知消息类型`, message);
      sendResponse({
        success: false,
        error: 'Unknown message type',
      });
      return false;
    },
  );

  console.log(`${LOG_PREFIX} 外部消息监听已初始化`);
}
