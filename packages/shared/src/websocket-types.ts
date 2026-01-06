/**
 * WebSocket消息类型定义
 * 用于Chrome扩展和Bridge服务器之间的WebSocket通信
 */

/**
 * WebSocket消息类型枚举
 */
export enum WebSocketMessageType {
  // 实例管理
  INSTANCE_REGISTER = 'instance_register',
  INSTANCE_REGISTERED = 'instance_registered',
  INSTANCE_UNREGISTER = 'instance_unregister',
  INSTANCE_UNREGISTERED = 'instance_unregistered',
  
  // 工具调用
  CALL_TOOL = 'call_tool',
  CALL_TOOL_RESPONSE = 'call_tool_response',
  
  // 数据请求
  PROCESS_DATA = 'process_data',
  PROCESS_DATA_RESPONSE = 'process_data_response',
  
  // 流程相关
  LIST_PUBLISHED_FLOWS = 'rr_list_published_flows',
  LIST_PUBLISHED_FLOWS_RESPONSE = 'rr_list_published_flows_response',
  
  // 文件操作
  FILE_OPERATION = 'file_operation',
  FILE_OPERATION_RESPONSE = 'file_operation_response',
  
  // 服务器状态
  SERVER_STARTED = 'server_started',
  SERVER_STOPPED = 'server_stopped',
  
  // 错误
  ERROR = 'error',
  
  // 心跳
  PING = 'ping',
  PONG = 'pong',
}

/**
 * WebSocket消息基础接口
 */
export interface WebSocketMessage<T = any> {
  type: WebSocketMessageType;
  requestId?: string; // 请求ID，用于匹配请求和响应
  responseToRequestId?: string; // 响应对应的请求ID
  instanceId?: string; // 实例ID，用于多实例管理
  payload?: T;
  error?: string | Error;
}

/**
 * 实例注册请求
 */
export interface InstanceRegisterRequest {
  // 可选的客户端标识信息
  clientInfo?: {
    userAgent?: string;
    timestamp?: number;
  };
}

/**
 * 实例注册响应
 */
export interface InstanceRegisterResponse {
  instanceId: string; // 服务器分配的实例ID
  serverInfo?: {
    version?: string;
    timestamp?: number;
  };
}

/**
 * 工具调用请求
 */
export interface CallToolRequest {
  name: string;
  args: Record<string, any>;
}

/**
 * 工具调用响应
 */
export interface CallToolResponse {
  status: 'success' | 'error';
  data?: any;
  error?: string;
}

/**
 * 数据请求
 */
export interface ProcessDataRequest {
  data: any;
}

/**
 * 数据响应
 */
export interface ProcessDataResponse {
  status: 'success' | 'error';
  data?: any;
  error?: string;
}

/**
 * 文件操作请求
 */
export interface FileOperationRequest {
  operation: string;
  params: Record<string, any>;
}

/**
 * 文件操作响应
 */
export interface FileOperationResponse {
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * 服务器状态消息
 */
export interface ServerStatusMessage {
  port?: number;
  isRunning: boolean;
  timestamp?: number;
}
