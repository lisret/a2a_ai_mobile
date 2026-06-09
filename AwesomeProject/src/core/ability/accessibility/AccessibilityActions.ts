/**
 * 无障碍操作模块
 * 负责执行各种操作（点击、滑动、输入等）
 */

import { Platform } from 'react-native';
import { NativeModules } from 'react-native';

const { AccessibilityActionModule } = NativeModules;

/**
 * 执行操作并处理 ADB 回退
 */
export async function executeActionWithFallback(
  actionName: string,
  actionFn: () => Promise<boolean>,
  adbFallbackFn: () => Promise<void>,
  getSettingsService: () => Promise<any>
): Promise<void> {
  if (Platform.OS !== 'android' || !AccessibilityActionModule) {
    throw new Error('无障碍服务仅支持Android平台');
  }

  try {
    const success = await actionFn();
    if (!success) {
      throw new Error(`${actionName}操作执行失败`);
    }
  } catch (error) {
    // 检查是否启用了 ADB 回退
    const settingsService = await getSettingsService();
    const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();

    if (!adbFallbackEnabled) {
      console.warn(`[无障碍服务] ${actionName}失败，ADB回退未启用`);
      // 非 Launch 操作失败时抛出错误
      throw error;
    }

    console.warn(`[无障碍服务] ${actionName}失败，尝试使用ADB:`, error);
    // 尝试使用 ADB 回退
    try {
      await adbFallbackFn();
      console.info(`[无障碍服务] 使用ADB ${actionName}成功`);
    } catch (adbError) {
      console.error(`[无障碍服务] ADB ${actionName}也失败:`, adbError);
      throw new Error(
        `${actionName}操作失败（无障碍和ADB都失败）: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * 执行点击操作
 */
export async function performClickAction(
  x: number,
  y: number,
  getSettingsService: () => Promise<any>,
  getAdbService: () => Promise<any>
): Promise<void> {
  await executeActionWithFallback(
    '点击',
    () => AccessibilityActionModule.performClick(x, y),
    async () => {
      const adbService = await getAdbService();
      await adbService.performClick(x, y);
    },
    getSettingsService
  );
}

/**
 * 执行长按操作
 */
export async function performLongPressAction(
  x: number,
  y: number,
  getSettingsService: () => Promise<any>,
  getAdbService: () => Promise<any>
): Promise<void> {
  await executeActionWithFallback(
    '长按',
    () => AccessibilityActionModule.performLongPress(x, y),
    async () => {
      const adbService = await getAdbService();
      await adbService.performLongPress(x, y);
    },
    getSettingsService
  );
}

/**
 * 执行双击操作
 */
export async function performDoubleTapAction(
  x: number,
  y: number,
  getSettingsService: () => Promise<any>,
  getAdbService: () => Promise<any>
): Promise<void> {
  await executeActionWithFallback(
    '双击',
    () => AccessibilityActionModule.performDoubleTap(x, y),
    async () => {
      const adbService = await getAdbService();
      await adbService.performDoubleTap(x, y);
    },
    getSettingsService
  );
}

/**
 * 执行滑动操作
 */
export async function performSwipeAction(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  getSettingsService: () => Promise<any>,
  getAdbService: () => Promise<any>
): Promise<void> {
  await executeActionWithFallback(
    '滑动',
    () => AccessibilityActionModule.performSwipe(startX, startY, endX, endY),
    async () => {
      const adbService = await getAdbService();
      await adbService.performSwipe(startX, startY, endX, endY);
    },
    getSettingsService
  );
}

/**
 * 执行文本输入操作
 */
export async function performTextInputAction(
  text: string,
  getSettingsService: () => Promise<any>,
  getAdbService: () => Promise<any>
): Promise<void> {
  console.info(`[文本输入] 开始输入文本: "${text}" (长度: ${text.length})`);
  
  await executeActionWithFallback(
    '文本输入',
    async () => {
      console.info('[文本输入] 尝试使用无障碍服务输入');
      const success = await AccessibilityActionModule.performTextInput(text);
      console.info(`[文本输入] 无障碍服务返回结果: ${success}`);
      if (!success) {
        console.warn('[文本输入] 无障碍服务返回 false，输入可能失败');
      }
      return success;
    },
    async () => {
      console.info('[文本输入] 无障碍服务失败，尝试使用 ADB 输入');
      const adbService = await getAdbService();
      await adbService.performTextInput(text);
      console.info('[文本输入] ADB 输入完成');
    },
    getSettingsService
  );
  
  console.info(`[文本输入] 文本输入操作完成: "${text}"`);
}

/**
 * 执行返回操作
 */
export async function performBackAction(
  getSettingsService: () => Promise<any>,
  getAdbService: () => Promise<any>
): Promise<void> {
  await executeActionWithFallback(
    '返回',
    () => AccessibilityActionModule.performBack(),
    async () => {
      const adbService = await getAdbService();
      await adbService.performBack();
    },
    getSettingsService
  );
}

/**
 * 执行Home操作
 */
export async function performHomeAction(
  getSettingsService: () => Promise<any>,
  getAdbService: () => Promise<any>
): Promise<void> {
  if (Platform.OS !== 'android' || !AccessibilityActionModule) {
    throw new Error('无障碍服务仅支持Android平台');
  }

  try {
    if (AccessibilityActionModule.performHome) {
      const success = await AccessibilityActionModule.performHome();
      if (!success) {
        throw new Error('Home操作执行失败');
      }
      return;
    } else {
      throw new Error('无障碍服务不支持Home操作');
    }
  } catch (error) {
    const settingsService = await getSettingsService();
    const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();

    if (!adbFallbackEnabled) {
      console.warn('[无障碍服务] Home操作失败，ADB回退未启用');
      throw error;
    }

    console.warn('[无障碍服务] Home操作失败，尝试使用ADB:', error);
    try {
      const adbService = await getAdbService();
      await adbService.performHome();
      console.info('[无障碍服务] 使用ADB Home操作成功');
    } catch (adbError) {
      console.error('[无障碍服务] ADB Home操作也失败:', adbError);
      throw new Error(
        `Home操作失败（无障碍和ADB都失败）: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

