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
 * 使用React Native Native Modules与Android原生代码通信
 */
class AccessibilityService {
  private isInitialized: boolean = false;

  /**
   * 初始化无障碍服务
   */
  async initialize(): Promise<void> {
    if (Platform.OS !== 'android') {
      throw new Error('无障碍服务仅支持Android平台');
    }

    if (!AccessibilityModule) {
      throw new Error('无障碍模块未找到，请确保已正确注册Native Module');
    }

    // 先检查服务是否已启用
    const isEnabled = await this.isEnabled();
    console.info('[无障碍服务] 检查结果:', isEnabled);
    
    if (!isEnabled) {
      // 再检查一次服务实例（可能服务已启动但列表检查失败）
      try {
        // 尝试执行一个简单的操作来验证服务是否真的可用
        // 如果服务实例存在，说明服务已启动
        const errorMessage = '无障碍服务未启用，请先到系统设置中启用无障碍服务';
        throw new Error(errorMessage);
      } catch (error) {
        throw error;
      }
    }

    this.isInitialized = true;
    console.info('[无障碍服务] 初始化成功');
  }

  /**
   * 检查无障碍服务是否已启用
   * 会重试几次，因为服务启用后可能需要一点时间才能检测到
   */
  async isEnabled(retries: number = 3, delay: number = 500): Promise<boolean> {
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

  /**
   * 打开无障碍服务设置页面
   */
  async openSettings(): Promise<void> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('无障碍服务仅支持Android平台');
    }

    try {
      await AccessibilityModule.openSettings();
    } catch (error) {
      console.error('打开无障碍设置失败:', error);
      throw error;
    }
  }

  /**
   * 打开应用通知设置页面
   * Android 8.0+ 可以打开应用的通知设置
   */
  async openNotificationSettings(): Promise<void> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('通知设置仅支持Android平台');
    }

    try {
      await AccessibilityModule.openNotificationSettings();
    } catch (error) {
      console.error('打开通知设置失败:', error);
      throw error;
    }
  }

  /**
   * 检查通知权限是否已授予
   * Android 13+ 需要 POST_NOTIFICATIONS 权限
   */
  async hasNotificationPermission(): Promise<boolean> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      return false;
    }

    try {
      const hasPermission = await AccessibilityModule.hasNotificationPermission();
      console.info('[无障碍服务] 通知权限检查:', hasPermission);
      return hasPermission;
    } catch (error) {
      console.error('检查通知权限失败:', error);
      return false;
    }
  }

  /**
   * 请求通知权限
   * Android 13+ 需要 POST_NOTIFICATIONS 权限
   */
  async requestNotificationPermission(): Promise<boolean> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('通知权限仅支持Android平台');
    }

    try {
      const result = await AccessibilityModule.requestNotificationPermission();
      console.info('[无障碍服务] 通知权限请求结果:', result);
      return result;
    } catch (error) {
      console.error('请求通知权限失败:', error);
      throw error;
    }
  }


  /**
   * 启动任务执行前台服务
   */
  async startTaskExecutionService(statusText: string): Promise<void> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('前台服务仅支持Android平台');
    }

    try {
      await AccessibilityModule.startTaskExecutionService(statusText);
    } catch (error) {
      console.error('启动前台服务失败:', error);
      throw error;
    }
  }

  /**
   * 更新任务执行前台服务通知
   */
  async updateTaskExecutionService(statusText: string): Promise<void> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('前台服务仅支持Android平台');
    }

    try {
      await AccessibilityModule.updateTaskExecutionService(statusText);
    } catch (error) {
      console.warn('更新前台服务失败:', error); // 警告而非错误，不中断任务
    }
  }

  /**
   * 停止任务执行前台服务
   */
  async stopTaskExecutionService(): Promise<void> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('前台服务仅支持Android平台');
    }

    try {
      await AccessibilityModule.stopTaskExecutionService();
    } catch (error) {
      console.warn('停止前台服务失败:', error); // 警告而非错误，不中断任务
    }
  }

  /**
   * 显示任务完成通知
   * @param title 通知标题
   * @param message 通知内容
   */
  async showTaskCompletionNotification(title: string, message: string): Promise<void> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('通知功能仅支持Android平台');
    }

    try {
      await AccessibilityModule.showTaskCompletionNotification(title, message);
    } catch (error) {
      console.warn('显示任务完成通知失败:', error);
    }
  }

  /**
   * 显示 Toast 提示消息（屏幕提示窗）
   * @param message 提示消息内容
   * @param duration 显示时长：'short' | 'long'，默认 'short'
   */
  async showToast(message: string, duration: 'short' | 'long' = 'short'): Promise<void> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('Toast 功能仅支持Android平台');
    }

    try {
      const durationValue = duration === 'long' ? 1 : 0;
      await AccessibilityModule.showToast(message, durationValue);
    } catch (error) {
      console.warn('显示 Toast 失败:', error);
    }
  }

  /**
   * 显示系统级提示窗（类似 Toast 但更醒目，自动消失）
   * @param title 提示标题
   * @param message 提示内容
   * @param buttonText 按钮文本（保留参数以兼容，实际不使用）
   */
  async showSystemDialog(title: string, message: string, buttonText: string = '确定'): Promise<void> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('系统提示窗功能仅支持Android平台');
    }

    try {
      await AccessibilityModule.showSystemDialog(title, message, buttonText);
    } catch (error) {
      console.warn('显示系统提示窗失败:', error);
      // 降级到 Toast
      await this.showToast(`${title}: ${message}`, 'long');
    }
  }

  /**
   * 播放任务完成提示音
   * 使用系统默认通知音，无需权限
   */
  async playTaskCompletionSound(): Promise<void> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('提示音功能仅支持Android平台');
    }

    try {
      await AccessibilityModule.playTaskCompletionSound();
    } catch (error) {
      console.warn('播放提示音失败:', error);
      // 静默失败，不影响任务流程
    }
  }

  /**
   * 获取 WakeLock（保持 CPU 唤醒，防止系统休眠）
   * 注意：必须在任务完成后释放，否则会耗电
   */
  async acquireWakeLock(): Promise<void> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('WakeLock 仅支持Android平台');
    }

    try {
      await AccessibilityModule.acquireWakeLock();
    } catch (error) {
      console.error('获取 WakeLock 失败:', error);
      throw error;
    }
  }

  /**
   * 释放 WakeLock
   */
  async releaseWakeLock(): Promise<void> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('WakeLock 仅支持Android平台');
    }

    try {
      await AccessibilityModule.releaseWakeLock();
    } catch (error) {
      console.warn('释放 WakeLock 失败:', error); // 警告而非错误，不中断任务
    }
  }

  /**
   * 将应用切换到后台
   * 配合 WakeLock 和前台服务使用，可以确保 JavaScript 在后台继续执行
   */
  async moveToBackground(): Promise<void> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('后台运行仅支持Android平台');
    }

    try {
      await AccessibilityModule.moveToBackground();
    } catch (error) {
      console.error('切换到后台失败:', error);
      throw error;
    }
  }

  /**
   * 启动后台任务执行（使用 Headless JS）
   * @param taskData 任务数据（JSON 字符串）
   */
  async startBackgroundTask(taskData: string): Promise<void> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('后台任务仅支持Android平台');
    }

    try {
      await AccessibilityModule.startBackgroundTask(taskData);
    } catch (error) {
      console.error('启动后台任务失败:', error);
      throw error;
    }
  }

  /**
   * 执行点击操作
   * 如果无障碍服务失败，会尝试使用 ADB
   */
  async performClick(x: number, y: number): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await performClickAction(
      x,
      y,
      async () => settingsService,
      async () => adbService
    );
  }

  /**
   * 执行长按操作
   * 如果无障碍服务失败，会尝试使用 ADB
   */
  async performLongPress(x: number, y: number): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await performLongPressAction(
      x,
      y,
      async () => settingsService,
      async () => adbService
    );
  }

  /**
   * 执行双击操作
   * 如果无障碍服务失败，会尝试使用 ADB
   */
  async performDoubleTap(x: number, y: number): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await performDoubleTapAction(
      x,
      y,
      async () => settingsService,
      async () => adbService
    );
  }

  /**
   * 执行滑动操作
   * 如果无障碍服务失败，会尝试使用 ADB
   */
  async performSwipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await performSwipeAction(
      startX,
      startY,
      endX,
      endY,
      async () => settingsService,
      async () => adbService
    );
  }

  /**
   * 执行文本输入
   * 如果无障碍服务失败，会尝试使用 ADB
   */
  async performTextInput(text: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await performTextInputAction(
      text,
      async () => settingsService,
      async () => adbService
    );
  }

  /**
   * 执行返回操作
   * 如果无障碍服务失败，会尝试使用 ADB
   */
  async performBack(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await performBackAction(
      async () => settingsService,
      async () => adbService
    );
  }

  /**
   * 执行Home操作（回到桌面）
   * 如果无障碍服务失败，会尝试使用 ADB
   */
  async performHome(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await performHomeAction(
      async () => settingsService,
      async () => adbService
    );
  }

  /**
   * 启动应用
   * @param appPackage 应用包名（如：com.example.app）或应用名称
   */
  async launchApp(appPackage: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (Platform.OS !== 'android' || !AccessibilityActionModule) {
      throw new Error('无障碍服务仅支持Android平台');
    }

    try {
      // 尝试通过无障碍服务启动应用
      // 如果原生模块不支持，会抛出错误，然后使用ADB回退
      if (AccessibilityActionModule.launchApp) {
        const success = await AccessibilityActionModule.launchApp(appPackage);
        if (!success) {
          throw new Error('启动应用失败');
        }
        return;
      } else {
        throw new Error('无障碍服务不支持启动应用');
      }
    } catch (error) {
      // 检查是否启用了 ADB 回退
      const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();
      
      if (!adbFallbackEnabled) {
        console.warn('[无障碍服务] 启动应用失败，ADB回退未启用，跳过Launch操作继续执行');
        // Launch 操作失败时不抛出错误，直接返回，让任务继续执行
        return;
      }

      // 尝试使用 ADB 回退
      try {
        await adbService.launchApp(appPackage);
      } catch (adbError: any) {
        
        // 检查是否需要用户手动启动
        if (adbError?.requiresManualLaunch) {
          // 抛出特殊错误，包含需要手动启动的信息
          const manualLaunchError = new Error(`无法自动启动应用: ${appPackage}。请手动启动应用后，任务将继续执行。`);
          (manualLaunchError as any).requiresManualLaunch = true;
          (manualLaunchError as any).packageName = adbError.packageName || appPackage;
          throw manualLaunchError;
        }
        
        throw new Error(`启动应用失败（无障碍和ADB都失败）: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * 获取屏幕分辨率
   * @returns {width: number, height: number} 屏幕宽度和高度
   */
  async getScreenSize(): Promise<{ width: number; height: number }> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('无障碍服务仅支持Android平台');
    }

    try {
      // 尝试从原生模块获取屏幕分辨率
      if (AccessibilityModule.getScreenSize) {
        const size = await AccessibilityModule.getScreenSize();
        return size;
      } else {
        // 如果原生模块不支持，返回默认值（会在后续修复中从截图获取）
        console.warn('[无障碍服务] 无法获取屏幕分辨率，使用默认值 1080x1920');
        return { width: 1080, height: 1920 };
      }
    } catch (error) {
      console.warn('[无障碍服务] 获取屏幕分辨率失败，使用默认值:', error);
      return { width: 1080, height: 1920 };
    }
  }

  /**
   * 请求截图权限（Android 9 及以下需要）
   */
  async requestScreenshotPermission(): Promise<void> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('无障碍服务仅支持Android平台');
    }

    try {
      await AccessibilityModule.requestScreenshotPermission();
    } catch (error) {
      console.error('请求截图权限失败:', error);
      throw error;
    }
  }

  /**
   * 获取屏幕截图
   * 如果无障碍服务失败，会尝试使用 ADB（如果启用了 ADB 回退）
   */
  async captureScreen(): Promise<string> {
    if (Platform.OS !== 'android' || !AccessibilityModule) {
      throw new Error('无障碍服务仅支持Android平台');
    }

    // 先检查是否启用了 ADB 回退，如果启用了，在无障碍服务失败时自动回退
    const { settingsService } = await import('@features/settings/services/SettingsService');
    const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();

    // 尝试使用无障碍服务截图（最多重试3次）
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 每次尝试前检查初始化状态
        if (!this.isInitialized) {
      try {
        await this.initialize();
      } catch (initError) {
            // 如果初始化失败且启用了 ADB 回退，直接使用 ADB
        if (adbFallbackEnabled) {
              console.warn(`[无障碍服务] 初始化失败（尝试 ${attempt}/${maxRetries}），使用 ADB 截图`);
          try {
            return await adbService.captureScreen();
          } catch (adbError) {
            console.error('[无障碍服务] ADB 截图也失败:', adbError);
            throw new Error(`截图失败（无障碍和ADB都失败）: ${initError instanceof Error ? initError.message : String(initError)}`);
          }
        } else {
          throw initError;
        }
      }
    }

        // 尝试截图
      const result = await AccessibilityModule.captureScreen();
      return result;
    } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message || String(error);

      // 如果是 Android 9 及以下且缺少权限，自动请求
        if (errorMessage.includes('需要先请求截图权限')) {
        try {
            console.info('[无障碍服务] 请求截图权限...');
          await this.requestScreenshotPermission();
          // 重新尝试截图
          const result = await AccessibilityModule.captureScreen();
          return result;
        } catch (retryError) {
            console.error(`[无障碍服务] 获取截图失败（尝试 ${attempt}/${maxRetries}）:`, retryError);
            lastError = retryError instanceof Error ? retryError : new Error(String(retryError));
            
            // 如果重试失败且启用了 ADB 回退，使用 ADB
            if (adbFallbackEnabled && attempt >= maxRetries) {
              console.warn('[无障碍服务] 截图失败，尝试使用 ADB 截图');
              try {
                return await adbService.captureScreen();
              } catch (adbError) {
                console.error('[无障碍服务] ADB 截图也失败:', adbError);
                throw lastError;
              }
            }
            
            // 如果还有重试机会，继续重试
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒后重试
              continue;
            }
          }
        } 
        // 如果是服务未启动错误，且启用了 ADB 回退，直接使用 ADB
        else if (errorMessage.includes('无障碍服务未启动') || errorMessage.includes('服务实例为 null')) {
          console.warn(`[无障碍服务] 服务未启动（尝试 ${attempt}/${maxRetries}）:`, errorMessage);
          
          if (adbFallbackEnabled) {
            console.warn('[无障碍服务] 无障碍服务不可用，使用 ADB 截图');
            try {
              return await adbService.captureScreen();
            } catch (adbError) {
              console.error('[无障碍服务] ADB 截图也失败:', adbError);
              // 如果 ADB 也失败，继续尝试无障碍服务（如果还有重试机会）
              if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒后重试
                continue;
              }
              throw new Error(`截图失败（无障碍和ADB都失败）: ${errorMessage}`);
            }
          } else {
            // 如果没有启用 ADB 回退，等待后重试
            if (attempt < maxRetries) {
              console.info(`[无障碍服务] 等待服务启动，${2000}ms 后重试...`);
              await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒后重试
              // 重置初始化状态，下次重试时会重新初始化
              this.isInitialized = false;
              continue;
            } else {
              // 所有重试都失败且未启用 ADB 回退，抛出错误
              console.error('[无障碍服务] 截图失败，ADB回退未启用');
              throw new Error(
                '截图失败：无障碍服务无法获取截图，且 ADB 回退未启用。\n' +
                '解决方案：\n' +
                '1. 启用无障碍服务的截图权限\n' +
                '2. 在设置中启用 ADB 回退功能\n' +
                '请检查无障碍服务和设置配置。'
              );
            }
          }
        }
        
        // 其他错误，记录并继续重试或抛出
        console.error(`[无障碍服务] 获取截图失败（尝试 ${attempt}/${maxRetries}）:`, errorMessage);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒后重试
          continue;
        }
      }
    }

    // 所有重试都失败，如果启用了 ADB 回退，最后尝试一次 ADB
    if (adbFallbackEnabled && lastError) {
      console.warn('[无障碍服务] 所有重试都失败，最后尝试使用 ADB 截图');
          try {
            return await adbService.captureScreen();
          } catch (adbError) {
            console.error('[无障碍服务] ADB 截图也失败:', adbError);
            // 即使 ADB 也失败，抛出错误而不是返回空图片
            throw new Error(
              `截图失败：无障碍服务和 ADB 都无法获取截图。\n` +
              `无障碍服务错误: ${lastError?.message || '未知错误'}\n` +
              `ADB 错误: ${adbError instanceof Error ? adbError.message : String(adbError)}\n` +
              `请检查无障碍服务和 ADB 权限配置。`
            );
      }
    }

    // 如果没有启用 ADB 回退，抛出错误
    if (!adbFallbackEnabled && lastError) {
      console.error('[无障碍服务] 截图失败，ADB回退未启用');
      throw new Error(
        `截图失败：无障碍服务无法获取截图，且 ADB 回退未启用。\n` +
        `错误详情: ${lastError.message}\n` +
        `解决方案：\n` +
        `1. 启用无障碍服务的截图权限\n` +
        `2. 在设置中启用 ADB 回退功能\n` +
        `请检查无障碍服务和设置配置。`
      );
          }

    // 抛出最后的错误（理论上不应该到达这里）
    throw lastError || new Error('截图失败：未知错误');
  }

  /**
   * 获取界面元素信息
   */
  async getAccessibilityNodeInfo(): Promise<any> {
    // TODO: 如果需要，可以在原生模块中添加此功能
    return null;
  }
}

export const accessibilityService = new AccessibilityService();


