/**
 * 能力管理器
 * 支持多层级能力选择和自动回退
 */

import type { CapabilityMetadata } from '../types';
import { ICapability, CapabilityPriority, CapabilityStatus } from '../types';

/**
 * 能力管理器
 */
export class CapabilityManager {
  private capabilities: ICapability[] = [];
  private initialized = false;

  /**
   * 注册能力
   * @param capability 能力实例
   */
  register(capability: ICapability): void {
    // 按优先级排序（优先级高的在前）
    this.capabilities.push(capability);
    this.capabilities.sort((a, b) => {
      const priorityA = a.getMetadata().priority;
      const priorityB = b.getMetadata().priority;
      return priorityA - priorityB;
    });
  }

  /**
   * 取消注册能力
   * @param name 能力名称
   */
  unregister(name: string): void {
    this.capabilities = this.capabilities.filter((cap) => cap.getName() !== name);
  }

  /**
   * 获取所有已注册的能力
   */
  getAllCapabilities(): ICapability[] {
    return [...this.capabilities];
  }

  /**
   * 初始化所有能力
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const initPromises = this.capabilities.map(async (cap) => {
      try {
        const isAvailable = await cap.isAvailable();
        if (isAvailable) {
          await cap.initialize();
          console.info(`[能力管理器] 能力 "${cap.getName()}" 初始化成功`);
        } else {
          console.warn(`[能力管理器] 能力 "${cap.getName()}" 不可用，跳过初始化`);
        }
      } catch (error) {
        console.error(`[能力管理器] 能力 "${cap.getName()}" 初始化失败:`, error);
      }
    });

    await Promise.allSettled(initPromises);
    this.initialized = true;
  }

  /**
   * 获取可用的能力（按优先级排序）
   */
  async getAvailableCapabilities(): Promise<ICapability[]> {
    const available: ICapability[] = [];

    for (const cap of this.capabilities) {
      try {
        const isAvailable = await cap.isAvailable();
        if (isAvailable) {
          available.push(cap);
        }
      } catch (error) {
        console.warn(`[能力管理器] 检查能力 "${cap.getName()}" 可用性失败:`, error);
      }
    }

    return available;
  }

  /**
   * 执行操作（自动选择可用的能力，支持多层级回退）
   * @param operation 操作函数
   * @param operationName 操作名称（用于日志）
   */
  async executeWithFallback<T>(
    operation: (capability: ICapability) => Promise<T>,
    operationName: string = '操作'
  ): Promise<T> {
    const availableCapabilities = await this.getAvailableCapabilities();

    if (availableCapabilities.length === 0) {
      throw new Error(`没有可用的能力来执行 ${operationName}`);
    }

    let lastError: Error | null = null;

    // 按优先级顺序尝试
    for (const capability of availableCapabilities) {
      try {
        console.info(`[能力管理器] 尝试使用能力 "${capability.getName()}" 执行 ${operationName}`);
        const result = await operation(capability);
        console.info(`[能力管理器] 能力 "${capability.getName()}" 成功执行 ${operationName}`);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(
          `[能力管理器] 能力 "${capability.getName()}" 执行 ${operationName} 失败:`,
          errorMessage
        );
        lastError = error instanceof Error ? error : new Error(String(error));

        // 继续尝试下一个能力
        continue;
      }
    }

    // 所有能力都失败
    throw new Error(
      `所有能力都无法执行 ${operationName}。最后错误: ${lastError?.message || '未知错误'}`
    );
  }

  /**
   * 获取截图能力（优先使用第一个可用的）
   */
  async getScreenshotCapability(): Promise<ICapability> {
    const available = await this.getAvailableCapabilities();
    if (available.length === 0) {
      throw new Error('没有可用的截图能力');
    }
    return available[0];
  }

  /**
   * 获取操作能力（优先使用第一个可用的）
   */
  async getActionCapability(): Promise<ICapability> {
    const available = await this.getAvailableCapabilities();
    if (available.length === 0) {
      throw new Error('没有可用的操作能力');
    }
    return available[0];
  }
}

/**
 * 全局能力管理器实例
 */
export const capabilityManager = new CapabilityManager();

