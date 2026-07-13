import { NativeModules, Platform } from 'react-native';
import {
  performClickAction,
  performLongPressAction,
  performDoubleTapAction,
  performSwipeAction,
  performTextInputAction,
  performBackAction,
  performHomeAction,
} from './AccessibilityActions';
import { settingsService } from '@features/settings/services/SettingsService';
import { adbService } from '@core/ability/adb/ADBService';

const { AccessibilityModule, AccessibilityActionModule } = NativeModules;

/**
 * 无障碍服务接口
 * 支持 Android（AccessibilityService）和 iOS（UIAccessibility + UIKit）
 */
class AccessibilityService {
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    if (Platform.OS === 'ios') {
      if (!AccessibilityModule) {
        console.warn('[无障碍服务] iOS AccessibilityModule 未找到，使用降级方案');
      }
      this.isInitialized = true;
      console.info('[无障碍服务] iOS 初始化成功');
      return;
    }

    if (Platform.OS !== 'android') {
      throw new Error('无障碍服务仅支持 Android/iOS 平台');
    }

    if (!AccessibilityModule) {
      throw new Error('无障碍模块未找到，请确保已正确注册Native Module');
    }

    const isEnabled = await this.isEnabled();
    console.info('[无障碍服务] 检查结果:', isEnabled);
    
    if (!isEnabled) {
      const errorMessage = '无障碍服务未启用，请先到系统设置中启用无障碍服务';
      throw new Error(errorMessage);
    }

    this.isInitialized = true;
    console.info('[无障碍服务] 初始化成功');
  }

  async isEnabled(retries: number = 3, delay: number = 500): Promise<boolean> {
    if (Platform.OS === 'ios') {
      return true;
    }

    if (Platform.OS !== 'android' || !AccessibilityModule) {
      return false;
    }

    for (let i = 0; i < retries; i++) {
      try {
        const result = await AccessibilityModule.isEnabled();
        if (result) {
          console.info(`[无障碍服务] 检查成功 (尝试 ${i + 1}/${retries})`);
          return true;
        }
        if (i < retries - 1) {
          console.info(`[无障碍服务] 检查失败，${delay}ms 后重试 (${i + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        console.error(`[无障碍服务] 检查失败 (尝试 ${i + 1}/${retries}):`, error);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.info(`[无障碍服务] 检查失败，已重试 ${retries} 次`);
    return false;
  }

  async openSettings(): Promise<void> {
    if (Platform.OS === 'ios' && AccessibilityModule) {
      try {
        await AccessibilityModule.openSettings();
        return;
      } catch (error) {
        console.error('打开设置失败:', error);
        throw error;
      }
    }

    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('当前平台不支持此操作');
    }

    try {
      await AccessibilityModule.openSettings();
    } catch (error) {
      console.error('打开无障碍设置失败:', error);
      throw error;
    }
  }

  async openNotificationSettings(): Promise<void> {
    if (Platform.OS === 'ios' && AccessibilityModule) {
      try {
        await AccessibilityModule.openNotificationSettings();
        return;
      } catch (error) {
        console.error('打开通知设置失败:', error);
        throw error;
      }
    }

    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('当前平台不支持此操作');
    }

    try {
      await AccessibilityModule.openNotificationSettings();
    } catch (error) {
      console.error('打开通知设置失败:', error);
      throw error;
    }
  }

  async hasNotificationPermission(): Promise<boolean> {
    if (!AccessibilityModule) return false;
    try {
      return await AccessibilityModule.hasNotificationPermission();
    } catch (error) {
      console.error('检查通知权限失败:', error);
      return false;
    }
  }

  async requestNotificationPermission(): Promise<boolean> {
    if (!AccessibilityModule) throw new Error('当前平台不支持此操作');
    return await AccessibilityModule.requestNotificationPermission();
  }

  async startTaskExecutionService(statusText: string): Promise<void> {
    if (!AccessibilityModule) throw new Error('当前平台不支持此操作');
    await AccessibilityModule.startTaskExecutionService(statusText);
  }

  async updateTaskExecutionService(statusText: string): Promise<void> {
    if (!AccessibilityModule) return;
    try { await AccessibilityModule.updateTaskExecutionService(statusText); }
    catch (error) { console.warn('更新前台服务失败:', error); }
  }

  async stopTaskExecutionService(): Promise<void> {
    if (!AccessibilityModule) return;
    try { await AccessibilityModule.stopTaskExecutionService(); }
    catch (error) { console.warn('停止前台服务失败:', error); }
  }

  async showTaskCompletionNotification(title: string, message: string): Promise<void> {
    if (!AccessibilityModule) return;
    try { await AccessibilityModule.showTaskCompletionNotification(title, message); }
    catch (error) { console.warn('显示任务完成通知失败:', error); }
  }

  async showToast(message: string, duration: 'short' | 'long' = 'short'): Promise<void> {
    if (!AccessibilityModule) return;
    try {
      const durationValue = duration === 'long' ? 1 : 0;
      await AccessibilityModule.showToast(message, durationValue);
    } catch (error) { console.warn('显示 Toast 失败:', error); }
  }

  async showSystemDialog(title: string, message: string, buttonText: string = '确定'): Promise<void> {
    if (!AccessibilityModule) return;
    try { await AccessibilityModule.showSystemDialog(title, message, buttonText); }
    catch (error) {
      console.warn('显示系统提示窗失败:', error);
      await this.showToast(`${title}: ${message}`, 'long');
    }
  }

  async playTaskCompletionSound(): Promise<void> {
    if (!AccessibilityModule) return;
    try { await AccessibilityModule.playTaskCompletionSound(); }
    catch (error) { console.warn('播放提示音失败:', error); }
  }

  async acquireWakeLock(): Promise<void> {
    if (!AccessibilityModule) throw new Error('当前平台不支持此操作');
    await AccessibilityModule.acquireWakeLock();
  }

  async releaseWakeLock(): Promise<void> {
    if (!AccessibilityModule) return;
    try { await AccessibilityModule.releaseWakeLock(); }
    catch (error) { console.warn('释放 WakeLock 失败:', error); }
  }

  async moveToBackground(): Promise<void> {
    if (!AccessibilityModule) throw new Error('当前平台不支持此操作');
    await AccessibilityModule.moveToBackground();
  }

  async startBackgroundTask(taskData: string): Promise<void> {
    if (!AccessibilityModule) throw new Error('当前平台不支持此操作');
    await AccessibilityModule.startBackgroundTask(taskData);
  }

  async performClick(x: number, y: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    await performClickAction(x, y, async () => settingsService, async () => adbService);
  }

  async performLongPress(x: number, y: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    await performLongPressAction(x, y, async () => settingsService, async () => adbService);
  }

  async performDoubleTap(x: number, y: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    await performDoubleTapAction(x, y, async () => settingsService, async () => adbService);
  }

  async performSwipe(startX: number, startY: number, endX: number, endY: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    await performSwipeAction(startX, startY, endX, endY, async () => settingsService, async () => adbService);
  }

  async performTextInput(text: string): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    await performTextInputAction(text, async () => settingsService, async () => adbService);
  }

  async performBack(): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    await performBackAction(async () => settingsService, async () => adbService);
  }

  async performHome(): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    await performHomeAction(async () => settingsService, async () => adbService);
  }

  async launchApp(appPackage: string): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (!AccessibilityActionModule) throw new Error('当前平台不支持启动应用');

    try {
      if (AccessibilityActionModule.launchApp) {
        const success = await AccessibilityActionModule.launchApp(appPackage);
        if (!success) throw new Error('启动应用失败');
        return;
      } else {
        throw new Error('当前平台不支持启动应用');
      }
    } catch (error) {
      if (Platform.OS === 'android') {
        const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();
        if (!adbFallbackEnabled) {
          console.warn('[无障碍服务] 启动应用失败，ADB回退未启用');
          return;
        }
        try { await adbService.launchApp(appPackage); }
        catch (adbError: any) {
          if (adbError?.requiresManualLaunch) {
            const manualLaunchError = new Error(`无法自动启动应用: ${appPackage}。请手动启动应用后，任务将继续执行。`);
            (manualLaunchError as any).requiresManualLaunch = true;
            (manualLaunchError as any).packageName = adbError.packageName || appPackage;
            throw manualLaunchError;
          }
          throw new Error(`启动应用失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        throw error;
      }
    }
  }

  async getScreenSize(): Promise<{ width: number; height: number }> {
    if (!AccessibilityModule) {
      console.warn('[无障碍服务] 无法获取屏幕分辨率，使用默认值 1080x1920');
      return { width: 1080, height: 1920 };
    }
    try {
      if (AccessibilityModule.getScreenSize) return await AccessibilityModule.getScreenSize();
      console.warn('[无障碍服务] 无法获取屏幕分辨率，使用默认值 1080x1920');
      return { width: 1080, height: 1920 };
    } catch (error) {
      console.warn('[无障碍服务] 获取屏幕分辨率失败:', error);
      return { width: 1080, height: 1920 };
    }
  }

  async requestScreenshotPermission(): Promise<void> {
    if (!AccessibilityModule) throw new Error('当前平台不支持此操作');
    await AccessibilityModule.requestScreenshotPermission();
  }

  async captureScreen(): Promise<string> {
    if (!AccessibilityModule) throw new Error('当前平台不支持截图');

    if (Platform.OS === 'ios') {
      try { return await AccessibilityModule.captureScreen(); }
      catch (error: any) {
        throw new Error(`截图失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const { settingsService } = await import('@features/settings/services/SettingsService');
    const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.isInitialized) {
          try { await this.initialize(); }
          catch (initError) {
            if (adbFallbackEnabled) {
              console.warn(`[无障碍服务] 初始化失败，使用 ADB 截图`);
              try { return await adbService.captureScreen(); }
              catch (adbError) { throw new Error(`截图失败: ${initError instanceof Error ? initError.message : String(initError)}`); }
            } else { throw initError; }
          }
        }
        return await AccessibilityModule.captureScreen();
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message || String(error);

        if (errorMessage.includes('需要先请求截图权限')) {
          try {
            await this.requestScreenshotPermission();
            return await AccessibilityModule.captureScreen();
          } catch (retryError) {
            lastError = retryError instanceof Error ? retryError : new Error(String(retryError));
            if (adbFallbackEnabled && attempt >= maxRetries) {
              try { return await adbService.captureScreen(); }
              catch (adbError) { throw lastError; }
            }
            if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 1000)); continue; }
          }
        } else if (errorMessage.includes('无障碍服务未启动') || errorMessage.includes('服务实例为 null')) {
          if (adbFallbackEnabled) {
            try { return await adbService.captureScreen(); }
            catch (adbError) {
              if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 2000)); continue; }
              throw new Error(`截图失败: ${errorMessage}`);
            }
          } else {
            if (attempt < maxRetries) {
              await new Promise(r => setTimeout(r, 2000));
              this.isInitialized = false;
              continue;
            } else {
              throw new Error('截图失败：无障碍服务无法获取截图，且 ADB 回退未启用。');
            }
          }
        }
        if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 1000)); continue; }
      }
    }

    if (adbFallbackEnabled && lastError) {
      try { return await adbService.captureScreen(); }
      catch (adbError) {
        throw new Error(`截图失败：无障碍服务和 ADB 都无法获取截图。`);
      }
    }

    if (!adbFallbackEnabled && lastError) {
      throw new Error(`截图失败：无障碍服务无法获取截图，且 ADB 回退未启用。`);
    }

    throw lastError || new Error('截图失败：未知错误');
  }

  async getAccessibilityNodeInfo(): Promise<any> {
    return null;
  }
}

export const accessibilityService = new AccessibilityService();
