/**
 * 实例管理器
 * 管理Chrome扩展的实例注册和ID生成
 */
// 使用crypto.randomUUID()替代uuid包
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`;
}
import { sendRequest } from './websocket-client';
import {
  WebSocketMessageType,
  InstanceRegisterRequest,
  InstanceRegisterResponse,
} from 'chrome-mcp-shared';

const LOG_PREFIX = '[InstanceManager]';

// ==================== 状态管理 ====================

interface InstanceInfo {
  instanceId: string;
  registered: boolean;
  registeredAt: number;
  lastActivity: number;
}

let currentInstance: InstanceInfo | null = null;
let registrationPromise: Promise<string> | null = null;

// ==================== 实例管理 ====================

/**
 * 生成新的实例ID
 */
function generateInstanceId(): string {
  return generateUUID();
}

/**
 * 注册实例到Bridge服务器
 */
export async function registerInstance(): Promise<string> {
  // 如果已有注册中的实例，等待其完成
  if (registrationPromise) {
    return registrationPromise;
  }

  // 如果已有注册的实例，直接返回
  if (currentInstance && currentInstance.registered) {
    currentInstance.lastActivity = Date.now();
    return currentInstance.instanceId;
  }

  // 开始新的注册流程
  registrationPromise = (async () => {
    try {
      const instanceId = currentInstance?.instanceId || generateInstanceId();

      const request: InstanceRegisterRequest = {
        clientInfo: {
          userAgent: navigator.userAgent,
          timestamp: Date.now(),
        },
      };

      const response = await sendRequest<InstanceRegisterResponse>(
        {
          type: WebSocketMessageType.INSTANCE_REGISTER,
          instanceId,
          payload: request,
        },
        10_000, // 10秒超时
      );

      if (response && response.instanceId) {
        currentInstance = {
          instanceId: response.instanceId,
          registered: true,
          registeredAt: Date.now(),
          lastActivity: Date.now(),
        };
        console.log(`${LOG_PREFIX} 实例注册成功: ${response.instanceId}`);
        console.log(
          `%c✅ 当前实例ID: ${response.instanceId}`,
          'color: #10b981; font-weight: bold; font-size: 14px;',
        );

        // 广播实例ID变化
        chrome.runtime
          .sendMessage({
            type: 'INSTANCE_ID_CHANGED',
            instanceId: response.instanceId,
          })
          .catch(() => {
            // 忽略错误（可能没有监听器）
          });

        return response.instanceId;
      } else {
        throw new Error('服务器返回无效的实例ID');
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} 实例注册失败`, error);
      // 清除当前实例状态
      currentInstance = null;
      throw error;
    } finally {
      registrationPromise = null;
    }
  })();

  return registrationPromise;
}

/**
 * 注销实例
 */
export async function unregisterInstance(): Promise<void> {
  if (!currentInstance || !currentInstance.registered) {
    return;
  }

  try {
    await sendRequest(
      {
        type: WebSocketMessageType.INSTANCE_UNREGISTER,
        instanceId: currentInstance.instanceId,
      },
      5_000,
    );
    console.log(`${LOG_PREFIX} 实例注销成功: ${currentInstance.instanceId}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} 实例注销失败`, error);
  } finally {
    currentInstance = null;
  }
}

/**
 * 获取当前实例ID
 */
export function getCurrentInstanceId(): string | null {
  return currentInstance?.instanceId || null;
}

/**
 * 检查实例是否已注册
 */
export function isInstanceRegistered(): boolean {
  return currentInstance?.registered || false;
}

/**
 * 更新实例活动时间
 */
export function updateInstanceActivity(): void {
  if (currentInstance) {
    currentInstance.lastActivity = Date.now();
  }
}

/**
 * 初始化实例管理器
 */
export function initInstanceManager(): void {
  // 在扩展启动时自动注册实例
  void registerInstance().catch((error) => {
    console.warn(`${LOG_PREFIX} 自动注册实例失败`, error);
  });

  // 监听扩展卸载，注销实例
  chrome.runtime.onSuspend.addListener(() => {
    void unregisterInstance();
  });
}
