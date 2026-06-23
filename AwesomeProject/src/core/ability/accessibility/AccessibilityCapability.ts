/**
 * 无障碍服务能力实现 (Accessibility Capability)
 *
 * 实现 ICapability 接口，封装 Android AccessibilityService 的所有操作：
 * - 截图 (captureScreen)
 * - 手势注入 (click / longPress / doubleTap / swipe)
 * - 文本输入 (textInput)
 * - 系统导航 (back / home)
 * - 应用启动 (launchApp)
 *
 * 作为双通道执行的 Level-1 主力通道，由 CapabilityManager 统一调度。
 * 当无障碍服务不可用时，系统自动降级到 ADBCapability (Level-2)。
 *
 * Wraps Android AccessibilityService operations as an ICapability.
 * Primary execution channel (Level-1) in the dual-channel architecture.
 * Falls back to ADBCapability when this service is unavailable.
 */

import type {
  ICapability,
  CapabilityMetadata,
} from '../types';
import { CapabilityPriority, CapabilityStatus } from '../types';
import { accessibilityService } from './AccessibilityService';

export class AccessibilityCapability implements ICapability {
  private metadata: CapabilityMetadata;
  private initialized = false;

  constructor() {
    this.metadata = {
      name: 'Accessibility',
      description: '无障碍服务能力，提供截图、操作等功能',
      priority: CapabilityPriority.HIGH,
      enabled: true,
      status: CapabilityStatus.UNAVAILABLE,
    };
  }

  getMetadata(): CapabilityMetadata {
    return { ...this.metadata };
  }

  getName(): string {
    return this.metadata.name;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const isEnabled = await accessibilityService.isEnabled();
      this.metadata.status = isEnabled
        ? CapabilityStatus.AVAILABLE
        : CapabilityStatus.UNAVAILABLE;
      return isEnabled;
    } catch (error) {
      this.metadata.status = CapabilityStatus.UNAVAILABLE;
      return false;
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.metadata.status = CapabilityStatus.INITIALIZING;
    try {
      await accessibilityService.initialize();
      this.metadata.status = CapabilityStatus.INITIALIZED;
      this.initialized = true;
    } catch (error) {
      this.metadata.status = CapabilityStatus.UNAVAILABLE;
      throw error;
    }
  }

  async captureScreen(): Promise<string> {
    return await accessibilityService.captureScreen();
  }

  async performClick(x: number, y: number): Promise<void> {
    return await accessibilityService.performClick(x, y);
  }

  async performLongPress(x: number, y: number): Promise<void> {
    return await accessibilityService.performLongPress(x, y);
  }

  async performDoubleTap(x: number, y: number): Promise<void> {
    return await accessibilityService.performDoubleTap(x, y);
  }

  async performSwipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): Promise<void> {
    return await accessibilityService.performSwipe(startX, startY, endX, endY);
  }

  async performTextInput(text: string): Promise<void> {
    return await accessibilityService.performTextInput(text);
  }

  async performBack(): Promise<void> {
    return await accessibilityService.performBack();
  }

  async performHome(): Promise<void> {
    return await accessibilityService.performHome();
  }

  async launchApp(appIdentifier: string): Promise<void> {
    return await accessibilityService.launchApp(appIdentifier);
  }

  async getScreenSize(): Promise<{ width: number; height: number }> {
    return await accessibilityService.getScreenSize();
  }
}

