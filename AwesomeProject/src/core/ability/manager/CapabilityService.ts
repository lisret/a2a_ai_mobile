/**
 * 能力服务
 * 提供统一的能力访问接口，封装能力管理器的使用
 */

import { capabilityManager } from './CapabilityManager';
import type { ICapability } from '../types';
import { initializeCapabilities } from '../index';

/**
 * 能力服务
 * 提供统一的能力访问接口
 */
class CapabilityService {
  private initialized = false;

  /**
   * 初始化能力服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 初始化能力管理器并注册所有能力
    initializeCapabilities();

    // 初始化所有能力
    await capabilityManager.initialize();

    this.initialized = true;
    console.info('[能力服务] 初始化完成');
  }

  /**
   * 截图（自动选择可用的能力）
   */
  async captureScreen(): Promise<string> {
    return await capabilityManager.executeWithFallback(
      (cap) => cap.captureScreen(),
      '截图'
    );
  }

  /**
   * 执行点击操作（自动选择可用的能力）
   */
  async performClick(x: number, y: number): Promise<void> {
    return await capabilityManager.executeWithFallback(
      (cap) => cap.performClick(x, y),
      '点击操作'
    );
  }

  /**
   * 执行长按操作（自动选择可用的能力）
   */
  async performLongPress(x: number, y: number): Promise<void> {
    return await capabilityManager.executeWithFallback(
      (cap) => cap.performLongPress(x, y),
      '长按操作'
    );
  }

  /**
   * 执行双击操作（自动选择可用的能力）
   */
  async performDoubleTap(x: number, y: number): Promise<void> {
    return await capabilityManager.executeWithFallback(
      (cap) => cap.performDoubleTap(x, y),
      '双击操作'
    );
  }

  /**
   * 执行滑动操作（自动选择可用的能力）
   */
  async performSwipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): Promise<void> {
    return await capabilityManager.executeWithFallback(
      (cap) => cap.performSwipe(startX, startY, endX, endY),
      '滑动操作'
    );
  }

  /**
   * 执行文本输入（自动选择可用的能力）
   */
  async performTextInput(text: string): Promise<void> {
    return await capabilityManager.executeWithFallback(
      (cap) => cap.performTextInput(text),
      '文本输入'
    );
  }

  /**
   * 执行返回操作（自动选择可用的能力）
   */
  async performBack(): Promise<void> {
    return await capabilityManager.executeWithFallback(
      (cap) => cap.performBack(),
      '返回操作'
    );
  }

  /**
   * 执行Home操作（自动选择可用的能力）
   */
  async performHome(): Promise<void> {
    return await capabilityManager.executeWithFallback(
      (cap) => cap.performHome(),
      'Home操作'
    );
  }

  /**
   * 启动应用（自动选择可用的能力）
   */
  async launchApp(appIdentifier: string): Promise<void> {
    return await capabilityManager.executeWithFallback(
      (cap) => cap.launchApp(appIdentifier),
      '启动应用'
    );
  }

  /**
   * 获取屏幕尺寸（优先使用无障碍服务）
   */
  async getScreenSize(): Promise<{ width: number; height: number }> {
    const available = await capabilityManager.getAvailableCapabilities();
    
    // 优先使用无障碍服务获取屏幕尺寸
    for (const cap of available) {
      if (cap.getName() === 'Accessibility') {
        try {
          return await cap.getScreenSize();
        } catch (error) {
          console.warn('[能力服务] 无障碍服务获取屏幕尺寸失败，尝试其他能力');
        }
      }
    }

    // 如果无障碍服务不可用，使用第一个可用的能力
    if (available.length > 0) {
      return await available[0].getScreenSize();
    }

    throw new Error('没有可用的能力来获取屏幕尺寸');
  }

  /**
   * 获取所有可用的能力
   */
  async getAvailableCapabilities(): Promise<ICapability[]> {
    return await capabilityManager.getAvailableCapabilities();
  }

  /**
   * 获取能力管理器（用于高级用法）
   */
  getManager() {
    return capabilityManager;
  }
}

export const capabilityService = new CapabilityService();

