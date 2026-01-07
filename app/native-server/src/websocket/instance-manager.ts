/**
 * 服务器端实例管理器
 * 维护实例ID到WebSocket连接的映射
 */
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

const LOG_PREFIX = '[InstanceManager]';

interface InstanceInfo {
  instanceId: string;
  connection: WebSocket;
  registeredAt: number;
  lastActivity: number;
}

export class InstanceManager {
  private instances: Map<string, InstanceInfo> = new Map();
  private connections: Map<WebSocket, string> = new Map(); // 连接 -> 实例ID的映射
  private instanceTimeout: number = 3600_000; // 1小时超时

  /**
   * 注册实例
   */
  public register(connection: WebSocket, providedInstanceId?: string): string {
    console.log(
      `${LOG_PREFIX} 开始注册实例，providedInstanceId: ${providedInstanceId || '未提供'}, 连接状态: ${connection.readyState}`,
    );

    // 如果提供了实例ID，检查是否已存在
    if (providedInstanceId && this.instances.has(providedInstanceId)) {
      // 如果已存在，更新连接
      const existing = this.instances.get(providedInstanceId)!;
      console.log(`${LOG_PREFIX} 实例 ${providedInstanceId} 已存在，更新连接`);
      // 关闭旧连接
      if (
        existing.connection !== connection &&
        existing.connection.readyState === existing.connection.OPEN
      ) {
        existing.connection.close();
      }
      // 更新连接
      existing.connection = connection;
      existing.lastActivity = Date.now();
      this.connections.set(connection, providedInstanceId);
      console.log(`${LOG_PREFIX} 实例连接已更新: ${providedInstanceId}`);
      return providedInstanceId;
    }

    // 生成新的实例ID
    const instanceId = providedInstanceId || uuidv4();
    console.log(
      `${LOG_PREFIX} 使用实例ID: ${instanceId} (${providedInstanceId ? '客户端提供' : '服务器生成'})`,
    );

    // 如果连接已存在，先注销
    if (this.connections.has(connection)) {
      const oldInstanceId = this.connections.get(connection)!;
      console.log(`${LOG_PREFIX} 连接已存在，注销旧实例: ${oldInstanceId}`);
      this.unregister(oldInstanceId);
    }

    const instanceInfo: InstanceInfo = {
      instanceId,
      connection,
      registeredAt: Date.now(),
      lastActivity: Date.now(),
    };

    this.instances.set(instanceId, instanceInfo);
    this.connections.set(connection, instanceId);

    console.log(`${LOG_PREFIX} 实例注册成功: ${instanceId} (总计: ${this.instances.size})`);
    console.log(`${LOG_PREFIX} 当前所有实例ID:`, Array.from(this.instances.keys()));
    return instanceId;
  }

  /**
   * 注销实例
   */
  public unregister(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return false;
    }

    this.instances.delete(instanceId);
    this.connections.delete(instance.connection);
    console.log(`${LOG_PREFIX} 实例注销: ${instanceId} (剩余: ${this.instances.size})`);
    return true;
  }

  /**
   * 通过连接注销实例
   */
  public unregisterByConnection(connection: WebSocket): boolean {
    const instanceId = this.connections.get(connection);
    if (instanceId) {
      return this.unregister(instanceId);
    }
    return false;
  }

  /**
   * 获取实例的连接
   */
  public getConnection(instanceId: string): WebSocket | null {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      console.log(`${LOG_PREFIX} 获取连接失败: 实例 ${instanceId} 不存在`);
      console.log(`${LOG_PREFIX} 当前所有实例ID:`, Array.from(this.instances.keys()));
      return null;
    }
    console.log(
      `${LOG_PREFIX} 获取连接成功: 实例 ${instanceId}, 连接状态: ${instance.connection.readyState}`,
    );
    return instance.connection;
  }

  /**
   * 获取实例ID（通过连接）
   */
  public getInstanceId(connection: WebSocket): string | null {
    return this.connections.get(connection) || null;
  }

  /**
   * 检查实例是否存在
   */
  public hasInstance(instanceId: string): boolean {
    return this.instances.has(instanceId);
  }

  /**
   * 更新实例活动时间
   */
  public updateActivity(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.lastActivity = Date.now();
    }
  }

  /**
   * 更新实例活动时间（通过连接）
   */
  public updateActivityByConnection(connection: WebSocket): void {
    const instanceId = this.getInstanceId(connection);
    if (instanceId) {
      this.updateActivity(instanceId);
    }
  }

  /**
   * 清理超时的实例
   */
  public cleanupInactiveInstances(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    this.instances.forEach((instance, instanceId) => {
      if (now - instance.lastActivity > this.instanceTimeout) {
        toRemove.push(instanceId);
      }
    });

    toRemove.forEach((instanceId) => {
      console.log(`${LOG_PREFIX} 清理超时实例: ${instanceId}`);
      this.unregister(instanceId);
    });

    if (toRemove.length > 0) {
      console.log(`${LOG_PREFIX} 清理了 ${toRemove.length} 个超时实例`);
    }
  }

  /**
   * 获取所有实例ID
   */
  public getAllInstanceIds(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * 获取实例数量
   */
  public getInstanceCount(): number {
    return this.instances.size;
  }

  /**
   * 设置实例超时时间（毫秒）
   */
  public setInstanceTimeout(timeoutMs: number): void {
    this.instanceTimeout = timeoutMs;
  }

  /**
   * 启动定期清理任务
   */
  public startCleanupTask(intervalMs: number = 60_000): void {
    setInterval(() => {
      this.cleanupInactiveInstances();
    }, intervalMs);
  }
}
