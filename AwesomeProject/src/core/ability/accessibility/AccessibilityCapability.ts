/**
 * 无障碍服务能力实现
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

