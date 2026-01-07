#!/usr/bin/env node
/**
 * 直接启动服务器脚本
 * 不依赖 Chrome 扩展的 Native Messaging 协议
 * 使用方式: node start-server.js [port]
 */

import { Server } from './dist/server/index.js';
import { NativeMessagingHost } from './dist/native-messaging-host.js';

// 创建新的 Server 和 NativeMessagingHost 实例
const serverInstance = new Server();
const nativeHostInstance = new NativeMessagingHost();

// 设置关联（与 index.ts 中的方式相同）
serverInstance.setNativeHost(nativeHostInstance);
nativeHostInstance.setServer(serverInstance);

// 直接启动服务器（默认端口 12306）
const port = process.env.PORT || process.argv[2] || 12306;

serverInstance
  .start(Number(port), nativeHostInstance)
  .then(() => {
    console.log(`✅ 服务器已启动`);
    console.log(`📡 HTTP 服务器: http://localhost:${port}`);
    console.log(`🔌 WebSocket 服务器: ws://localhost:${port}/ws`);
    console.log(`📋 MCP 端点: http://localhost:${port}/mcp`);
    console.log(`\n按 Ctrl+C 停止服务器`);
  })
  .catch((error) => {
    console.error('❌ 启动服务器失败:', error);
    process.exit(1);
  });

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n正在关闭服务器...');
  try {
    await serverInstance.stop();
    console.log('✅ 服务器已关闭');
    process.exit(0);
  } catch (error) {
    console.error('❌ 关闭服务器时出错:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  try {
    await serverInstance.stop();
    process.exit(0);
  } catch (error) {
    console.error('❌ 关闭服务器时出错:', error);
    process.exit(1);
  }
});
