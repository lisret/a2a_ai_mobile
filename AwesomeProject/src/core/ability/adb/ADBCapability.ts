/**
 * ADB 服务能力实现 (ADB Fallback Capability)
 *
 * 实现 ICapability 接口，封装 ADB shell 命令的所有操作。
 * 作为双通道执行的 Level-2 降级通道：
 *   - 默认不启用，由用户在设置中开启 "ADB 回退" 开关
 *   - 当 AccessibilityService 被系统杀死 / 控件树为空 / 手势超时时自动接管
 *   - 每个操作通过 adb shell input 转发，约 200-500ms 额外延迟
 *
 * 注意：getScreenSize() 优先从无障碍服务获取，ADB 无原生分辨率接口。
 *
 * Level-2 fallback in the dual-channel execution architecture.
 * Activated when AccessibilityService is unavailable or times out.
 * Operations go through adb shell input with ~200-500ms extra latency.
 */

import type {
  ICapability,
  CapabilityMetadata,
} from '../types';
import { CapabilityPriority, CapabilityStatus } from '../types';
import { adbService } from './ADBService';
import { settingsService } from '@features/settings/services/SettingsService';
import { accessibilityService } from '../Accessibility/AccessibilityService';

export class ADBCapability implements ICapability {
  private metadata: CapabilityMetadata;
  private initialized = false;

  constructor() {
    this.metadata = {
      name: 'ADB',
      description: 'ADB 服务能力，作为无障碍服务的回退方案',
      priority: CapabilityPriority.MEDIUM,
      enabled: false, // 默认不启用，需要检查设置
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
      // 检查 ADB 回退是否启用
      const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();
      this.metadata.enabled = adbFallbackEnabled;

      if (!adbFallbackEnabled) {
        this.metadata.status = CapabilityStatus.UNAVAILABLE;
        return false;
      }

      // ADB 服务本身不需要特殊初始化，只要设置启用即可
      this.metadata.status = CapabilityStatus.AVAILABLE;
      return true;
    } catch (error) {
      this.metadata.status = CapabilityStatus.UNAVAILABLE;
      return false;
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const isAvailable = await this.isAvailable();
    if (!isAvailable) {
      throw new Error('ADB 能力不可用（未启用 ADB 回退）');
    }

    this.metadata.status = CapabilityStatus.INITIALIZING;
    try {
      // ADB 服务不需要特殊初始化
      this.metadata.status = CapabilityStatus.INITIALIZED;
      this.initialized = true;
    } catch (error) {
      this.metadata.status = CapabilityStatus.UNAVAILABLE;
      throw error;
    }
  }

  async captureScreen(): Promise<string> {
    return await adbService.captureScreen();
  }

  async performClick(x: number, y: number): Promise<void> {
    return await adbService.performClick(x, y);
  }

  async performLongPress(x: number, y: number): Promise<void> {
    return await adbService.performLongPress(x, y);
  }

  async performDoubleTap(x: number, y: number): Promise<void> {
    return await adbService.performDoubleTap(x, y);
  }

  async performSwipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): Promise<void> {
    return await adbService.performSwipe(startX, startY, endX, endY);
  }

  async performTextInput(text: string): Promise<void> {
    return await adbService.performTextInput(text);
  }

  async performBack(): Promise<void> {
    return await adbService.performBack();
  }

  async performHome(): Promise<void> {
    return await adbService.performHome();
  }

  async launchApp(appIdentifier: string): Promise<void> {
    return await adbService.launchApp(appIdentifier);
  }

  async getScreenSize(): Promise<{ width: number; height: number }> {
    // ADB 服务没有直接的获取屏幕尺寸方法
    // 尝试从无障碍服务获取（如果可用），否则使用默认值
    try {
      return await accessibilityService.getScreenSize();
    } catch (error) {
      // 如果无法获取，返回常见的屏幕尺寸（1080x1920）
      console.warn('[ADB能力] 无法获取屏幕尺寸，使用默认值');
      return { width: 1080, height: 1920 };
    }
  }
}

