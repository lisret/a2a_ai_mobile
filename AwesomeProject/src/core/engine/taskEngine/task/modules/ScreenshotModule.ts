/**
 * 截图模块
 * 负责屏幕感知（截图）功能
 */

import { capabilityService } from '@core/ability';
import { TASK_CONFIG } from '@shared/constants';

export interface ScreenshotResult {
  screenshotUri: string;
  timestamp: number;
}

/**
 * 截图模块
 */
export class ScreenshotModule {
  /**
   * 截图（带超时和回退）
   * @param timeoutMs 超时时间（毫秒）
   * @returns 截图数据 URI
   */
  async capture(timeoutMs: number = TASK_CONFIG.SCREENSHOT_TIMEOUT_MS): Promise<ScreenshotResult> {
    try {
      const screenshotPromise = capabilityService.captureScreen();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('截图超时')), timeoutMs)
      );

      const screenshotUri = await Promise.race([screenshotPromise, timeoutPromise]);

      if (!screenshotUri) {
        throw new Error('截图失败：返回为空');
      }

      return {
        screenshotUri,
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`截图失败: ${errorMessage}`);
    }
  }
}

export const screenshotModule = new ScreenshotModule();

