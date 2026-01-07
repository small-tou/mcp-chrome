import { createErrorResponse } from '@/common/tool-handler';
import { ERROR_MESSAGES } from '@/common/constants';
import * as browserTools from './browser';
import { flowRunTool, listPublishedFlowsTool } from './record-replay';

const tools = { ...browserTools, flowRunTool, listPublishedFlowsTool } as any;
const toolsMap = new Map(Object.values(tools).map((tool: any) => [tool.name, tool]));

/**
 * Tool call parameter interface
 */
export interface ToolCallParam {
  name: string;
  args: any;
}

/**
 * Handle tool execution
 */
export const handleCallTool = async (param: ToolCallParam) => {
  console.log('[ToolHandler] 收到工具调用请求:', {
    name: param.name,
    args: param.args,
    availableTools: Array.from(toolsMap.keys()),
  });

  const tool = toolsMap.get(param.name);
  if (!tool) {
    console.error(`[ToolHandler] 工具未找到: ${param.name}`, {
      availableTools: Array.from(toolsMap.keys()),
    });
    return createErrorResponse(`Tool ${param.name} not found`);
  }

  try {
    console.log(`[ToolHandler] 执行工具: ${param.name}`);
    const result = await tool.execute(param.args);
    console.log(`[ToolHandler] 工具执行完成: ${param.name}`);
    return result;
  } catch (error) {
    console.error(`[ToolHandler] 工具执行失败: ${param.name}`, error);
    return createErrorResponse(
      error instanceof Error ? error.message : ERROR_MESSAGES.TOOL_EXECUTION_FAILED,
    );
  }
};
