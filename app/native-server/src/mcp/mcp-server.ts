import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { setupTools } from './register-tools';
import { AsyncLocalStorage } from 'async_hooks';

export let mcpServer: Server | null = null;

/**
 * 存储每个 MCP session 的 INSTANCE_ID 鉴权参数
 * key: sessionId, value: instanceId
 */
export const sessionInstanceIdMap: Map<string, string> = new Map();

/**
 * AsyncLocalStorage 用于在当前异步上下文中存储 sessionId
 */
export const sessionIdStorage = new AsyncLocalStorage<string>();

/**
 * 根据 sessionId 获取对应的 INSTANCE_ID
 */
export const getInstanceIdBySession = (sessionId: string | undefined): string | undefined => {
  if (!sessionId) {
    return undefined;
  }
  return sessionInstanceIdMap.get(sessionId);
};

/**
 * 从当前异步上下文获取 INSTANCE_ID
 */
export const getInstanceIdFromContext = (): string | undefined => {
  const sessionId = sessionIdStorage.getStore();
  return sessionId ? getInstanceIdBySession(sessionId) : undefined;
};

export const getMcpServer = () => {
  if (mcpServer) {
    return mcpServer;
  }
  mcpServer = new Server(
    {
      name: 'ChromeMcpServer',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  setupTools(mcpServer);
  return mcpServer;
};
