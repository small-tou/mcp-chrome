/**
 * Web Agent Bridge
 * 供AI agent在网页中调用的通信脚本
 * 通过chrome.runtime.sendMessage与扩展通信
 */

(function () {
  'use strict';

  // 检查是否已经注入
  if (window.__chromeMcpWebAgentBridge) {
    return;
  }

  const EXTENSION_ID = chrome?.runtime?.id;
  if (!EXTENSION_ID) {
    console.error('[WebAgentBridge] Chrome extension runtime not available');
    return;
  }

  /**
   * 发送消息到扩展
   */
  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(EXTENSION_ID, message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 注册实例并获取实例ID
   */
  async function registerInstance(clientInfo) {
    try {
      const response = await sendMessage({
        type: 'register_instance',
        payload: {
          clientInfo: {
            userAgent: navigator.userAgent,
            timestamp: Date.now(),
            ...clientInfo,
          },
        },
      });

      if (response.success && response.instanceId) {
        return response.instanceId;
      } else {
        throw new Error(response.error || 'Failed to register instance');
      }
    } catch (error) {
      console.error('[WebAgentBridge] 实例注册失败', error);
      throw error;
    }
  }

  /**
   * 获取当前实例ID
   */
  async function getInstanceId() {
    try {
      const response = await sendMessage({
        type: 'get_instance_id',
      });

      if (response.success && response.instanceId) {
        return response.instanceId;
      } else {
        // 如果没有实例ID，尝试注册
        return await registerInstance();
      }
    } catch (error) {
      console.error('[WebAgentBridge] 获取实例ID失败', error);
      throw error;
    }
  }

  /**
   * 连接WebSocket服务器
   */
  async function connectWebSocket(url) {
    try {
      const response = await sendMessage({
        type: 'connect_websocket',
        payload: {
          url,
        },
      });

      if (response.success) {
        return response.connected;
      } else {
        throw new Error(response.error || 'Failed to connect WebSocket');
      }
    } catch (error) {
      console.error('[WebAgentBridge] 连接WebSocket失败', error);
      throw error;
    }
  }

  /**
   * 检查连接状态
   */
  async function checkConnection() {
    try {
      const response = await sendMessage({
        type: 'check_connection',
      });

      return {
        connected: response.connected || false,
        instanceId: response.instanceId || null,
      };
    } catch (error) {
      console.error('[WebAgentBridge] 检查连接状态失败', error);
      return {
        connected: false,
        instanceId: null,
      };
    }
  }

  /**
   * 导出API到window对象
   */
  window.__chromeMcpWebAgentBridge = {
    /**
     * 注册实例并获取实例ID
     * @param {Object} clientInfo - 可选的客户端信息
     * @returns {Promise<string>} 实例ID
     */
    registerInstance,

    /**
     * 获取当前实例ID（如果不存在则自动注册）
     * @returns {Promise<string>} 实例ID
     */
    getInstanceId,

    /**
     * 连接WebSocket服务器
     * @param {string} url - WebSocket服务器URL（可选）
     * @returns {Promise<boolean>} 是否连接成功
     */
    connectWebSocket,

    /**
     * 检查连接状态
     * @returns {Promise<{connected: boolean, instanceId: string|null}>}
     */
    checkConnection,

    /**
     * 扩展ID
     */
    extensionId: EXTENSION_ID,
  };

  console.log('[WebAgentBridge] 已初始化，扩展ID:', EXTENSION_ID);
})();
