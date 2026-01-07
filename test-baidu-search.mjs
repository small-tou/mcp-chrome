#!/usr/bin/env node
/**
 * 测试脚本：通过 MCP server 控制浏览器打开百度并搜索
 * 
 * 使用方法：
 * 1. 确保 native-server 已构建: pnpm --filter mcp-chrome-bridge build
 * 2. 确保 MCP server 正在运行 (默认端口 12306)
 * 3. 运行: node test-baidu-search.mjs
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// 尝试使用构建后的文件，如果不存在则提示用户先构建
let AgentToolBridge;
try {
  const bridgeModule = await import('./app/native-server/dist/agent/tool-bridge.js');
  AgentToolBridge = bridgeModule.AgentToolBridge;
} catch (error) {
  console.error('❌ 无法加载 tool-bridge 模块。请先构建项目：');
  console.error('   pnpm --filter mcp-chrome-bridge build');
  process.exit(1);
}

const instanceId = '6b1c9d69-6691-4aca-af70-ef2880936848';

async function testBaiduSearch() {
  const bridge = new AgentToolBridge();
  
  try {
    // 1. 打开 https://baidu.com
    console.log('📌 步骤 1: 打开 https://baidu.com');
    const navigateResult = await bridge.callTool({
      tool: 'chrome_navigate',
      args: {
        instanceId,
        url: 'https://baidu.com',
      },
    });
    
    console.log('导航结果:', JSON.stringify(navigateResult, null, 2));
    
    if (navigateResult.isError) {
      console.error('❌ 导航失败');
      return;
    }
    
    // 等待页面加载
    console.log('⏳ 等待页面加载...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 2. 输入"测试"
    console.log('\n📌 步骤 2: 在搜索框输入"测试"');
    // 百度搜索框的选择器通常是 #kw 或 input[name="wd"]
    const fillResult = await bridge.callTool({
      tool: 'chrome_fill_or_select',
      args: {
        instanceId,
        selector: '#kw',
        value: '测试',
      },
    });
    
    console.log('输入结果:', JSON.stringify(fillResult, null, 2));
    
    if (fillResult.isError) {
      console.error('❌ 输入失败');
      return;
    }
    
    // 等待一下
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 3. 按回车
    console.log('\n📌 步骤 3: 按回车键');
    const keyboardResult = await bridge.callTool({
      tool: 'chrome_keyboard',
      args: {
        instanceId,
        keys: 'Enter',
        selector: '#kw',
      },
    });
    
    console.log('回车结果:', JSON.stringify(keyboardResult, null, 2));
    
    if (keyboardResult.isError) {
      console.error('❌ 按回车失败');
      return;
    }
    
    console.log('\n✅ 所有操作完成！');
    
  } catch (error) {
    console.error('❌ 执行过程中出错:', error);
  }
}

testBaiduSearch();
