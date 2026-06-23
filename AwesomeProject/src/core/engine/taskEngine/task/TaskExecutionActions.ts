/**
 * 任务操作执行模块
 * 负责执行各种操作（点击、滑动、输入等）
 */

import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import type { TaskAction, TaskStep } from '../types/Task';
import { accessibilityService, adbService, appMappingService } from '@core/ability';
import { TASK_TIMEOUT_CONFIG } from '@shared/constants';
import { searchBoxPositionService } from '@features/settings/services/SearchBoxPositionService';
import { settingsService } from '@features/settings/services/SettingsService';

const { AccessibilityActionModule } = NativeModules;

export interface ExecuteActionOptions {
  action: TaskAction;
  taskId: string;
  step: number;
  modelResponse?: string;
}

export interface ExecuteActionResult {
  step?: TaskStep;
  shouldContinue: boolean;
}

/**
 * 执行操作
 */
export async function executeAction(
  options: ExecuteActionOptions
): Promise<ExecuteActionResult> {
  const { action, taskId, step, modelResponse } = options;

  try {
    switch (action.type) {
      // === 基础触控操作 (Basic Touch Actions) ===
      case 'click':
        if (action.x !== undefined && action.y !== undefined) {
          await accessibilityService.performClick(action.x, action.y);
        } else {
          throw new Error('点击操作缺少坐标参数');
        }
        break;
      case 'longPress':
        if (action.x !== undefined && action.y !== undefined) {
          await accessibilityService.performLongPress(action.x, action.y);
        } else {
          throw new Error('长按操作缺少坐标参数');
        }
        break;
      case 'doubleTap':
        if (action.x !== undefined && action.y !== undefined) {
          await accessibilityService.performDoubleTap(action.x, action.y);
        } else {
          throw new Error('双击操作缺少坐标参数');
        }
        break;
      // === 滑动手势 (Swipe Gesture) ===
      case 'swipe':
        if (
          action.startX !== undefined &&
          action.startY !== undefined &&
          action.endX !== undefined &&
          action.endY !== undefined
        ) {
          await accessibilityService.performSwipe(
            action.startX,
            action.startY,
            action.endX,
            action.endY
          );
        } else {
          throw new Error('滑动操作缺少坐标参数');
        }
        break;
      // === 文本输入 (Text Input) ===
      case 'input':
        if (action.text) {
          console.info(`[任务执行] 执行输入操作: "${action.text}"`);
          try {
            await accessibilityService.performTextInput(action.text);
            console.info(`[任务执行] 输入操作完成: "${action.text}"`);
            // 输入后等待一小段时间，确保输入完成
            await new Promise((resolve) => setTimeout(resolve, 300));
          } catch (inputError) {
            console.error(`[任务执行] 输入操作失败:`, inputError);
            throw inputError;
          }
        } else {
          throw new Error('输入操作缺少文本参数');
        }
        break;
      // === 系统导航 (System Navigation) ===
      case 'back':
        await accessibilityService.performBack();
        break;
      case 'home':
        await accessibilityService.performHome();
        break;
      // === 应用启动 (App Launch) ===
      case 'launch':
        if (action.app) {
          await handleLaunchAction(action.app, taskId, step, modelResponse);
        } else {
          throw new Error('Launch操作缺少app参数');
        }
        break;
      // === 用户接管 (Manual Takeover) ===
      case 'take_over':
        await handleTakeOverAction(action, taskId, step, modelResponse);
        return {
          step: {
            step,
            action: '用户接管完成',
            timestamp: Date.now(),
            actionDetails: action,
            modelResponse: modelResponse,
          },
          shouldContinue: true,
        };
      // === 等待 / 记录 (Wait & Record) ===
      case 'wait':
        const duration = action.duration || 500;
        await new Promise((resolve) => setTimeout(resolve, duration));
        break;
      case 'record_search_box':
        if (action.searchBoxPosition) {
          await handleRecordSearchBoxAction(action.searchBoxPosition, taskId, step);
        } else {
          throw new Error('Record_Search_Box操作缺少searchBoxPosition参数');
        }
        break;
      default:
        throw new Error(`未知的操作类型: ${(action as any).type}`);
    }

    return { shouldContinue: true };
  } catch (error) {
    throw error;
  }
}

/**
 * 判断输入是包名还是应用名称
 * @param input 输入字符串
 * @returns true 如果是包名，false 如果是应用名称
 */
function isPackageName(input: string): boolean {
  // 包名特征：包含点号（.）且不包含空格
  return input.includes('.') && !input.includes(' ');
}

/**
 * 处理启动应用操作
 * 执行流程：
 * 1. 判断输入是包名还是应用名称，如果是应用名称则通过应用映射表获取包名
 * 2. 先尝试无障碍服务启动应用
 * 3. 如果失败，判断是否开启ADB兜底
 * 4. 如果开启了ADB兜底，则使用ADB启动应用
 */
async function handleLaunchAction(
  app: string,
  taskId: string,
  step: number,
  modelResponse?: string
): Promise<void> {
  console.info(`[任务执行] 步骤 ${step}: 启动应用 "${app}"`);
  
  // 步骤0: 判断输入是包名还是应用名称，如果是应用名称则通过应用映射表获取包名
  let packageName = app;
  if (!isPackageName(app)) {
    console.info(`[任务执行] 步骤 ${step}: 输入是应用名称 "${app}"，尝试通过应用映射表获取包名`);
    
    // 初始化应用映射表（如果尚未初始化）
    try {
      console.info(`[任务执行] 步骤 ${step}: 开始初始化应用映射表...`);
      const mapping = await appMappingService.getAppMapping();
      const appCount = Object.keys(mapping).length;
      console.info(`[任务执行] 步骤 ${step}: 应用映射表初始化完成，共 ${appCount} 个应用`);
      console.debug(`[任务执行] 步骤 ${step}: 应用映射表: ${JSON.stringify(mapping)}`);
      // 输出前10个应用作为示例（避免日志过多）
      // const sampleApps = Object.entries(mapping).slice(0, 10);
      // console.info(`[任务执行] 步骤 ${step}: 应用映射表示例（前10个）:`);
      // sampleApps.forEach(([appName, pkgName]) => {
      //   console.info(`[任务执行] 步骤 ${step}:   - "${appName}" -> ${pkgName}`);
      // });
      // if (appCount > 10) {
      //   console.info(`[任务执行] 步骤 ${step}:   ... 还有 ${appCount - 10} 个应用`);
      // }
    } catch (initError) {
      console.warn(`[任务执行] 步骤 ${step}: 初始化应用映射表失败: ${initError}，尝试继续查找`);
    }
    
    try {
      const foundPackageName = await appMappingService.findPackageName(app);
      if (foundPackageName) {
        packageName = foundPackageName;
        console.info(`[任务执行] 步骤 ${step}: 找到包名 "${packageName}" 对应应用名称 "${app}"`);
      } else {
        // 如果映射表找不到包名，跳过执行，不报错
        console.warn(`[任务执行] 步骤 ${step}: 应用映射表中未找到应用名称 "${app}" 对应的包名，跳过Launch操作`);
        return;
      }
    } catch (mappingError) {
      // 如果获取映射表失败，跳过执行，不报错
      console.warn(`[任务执行] 步骤 ${step}: 获取应用映射表失败: ${mappingError}，跳过Launch操作`);
      return;
    }
  } else {
    console.info(`[任务执行] 步骤 ${step}: 输入是包名 "${app}"`);
  }
  
  // 步骤1: 先尝试无障碍服务启动应用
  try {
    console.info(`[任务执行] 步骤 ${step}: 尝试使用无障碍服务启动应用，包名: "${packageName}"`);
    
    // 检查平台和模块是否可用
    if (Platform.OS !== 'android' || !AccessibilityActionModule) {
      throw new Error('无障碍服务仅支持Android平台或模块未找到');
    }
    
    // 直接调用无障碍服务的原生模块方法，不经过内部的ADB回退逻辑
    if (AccessibilityActionModule.launchApp) {
      const success = await AccessibilityActionModule.launchApp(packageName);
      if (success) {
        console.info(`[任务执行] 步骤 ${step}: 无障碍服务启动应用 "${packageName}" 成功`);
        // 等待应用启动完成
        await new Promise((resolve) => setTimeout(resolve, 2000));
        console.info(`[任务执行] 步骤 ${step}: 等待应用启动完成`);
        return;
      } else {
        throw new Error('无障碍服务启动应用返回失败');
      }
    } else {
      throw new Error('无障碍服务不支持启动应用');
    }
  } catch (accessibilityError: any) {
    console.warn(`[任务执行] 步骤 ${step}: 无障碍服务启动应用失败: ${accessibilityError?.message || String(accessibilityError)}`);
    
    // 步骤2: 判断是否开启ADB兜底
    const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();
    
    if (!adbFallbackEnabled) {
      console.warn(`[任务执行] 步骤 ${step}: ADB兜底未启用，无法使用ADB启动应用`);
      // ADB兜底未启用，记录警告但不抛出错误，让任务继续执行
      // 这样即使启动失败，任务也可以尝试其他方式（如通过搜索框打开应用）
      return;
    }
    
    // 步骤3: 使用ADB启动应用
    console.info(`[任务执行] 步骤 ${step}: ADB兜底已启用，尝试使用ADB启动应用，包名: "${packageName}"`);
    try {
      await adbService.launchApp(packageName);
      console.info(`[任务执行] 步骤 ${step}: ADB启动应用 "${packageName}" 成功`);
      // 等待应用启动完成
      await new Promise((resolve) => setTimeout(resolve, 2000));
      console.info(`[任务执行] 步骤 ${step}: 等待应用启动完成`);
    } catch (adbError: any) {
      console.error(`[任务执行] 步骤 ${step}: ADB启动应用失败: ${adbError?.message || String(adbError)}`);
      
      // 检查是否需要用户手动启动
      if (adbError?.requiresManualLaunch) {
        console.warn(`[任务执行] 步骤 ${step}: 无法自动启动应用 "${packageName}"，需要用户手动启动`);
        
        // 发送事件通知用户需要手动启动应用
        DeviceEventEmitter.emit('TaskManualLaunchRequired', {
          taskId,
          step,
          packageName: adbError.packageName || packageName,
          message: `无法自动启动应用: ${app}。请手动启动应用后，任务将继续执行。`,
        });

        // 等待用户确认已手动启动（最多等待30秒）
        const manualLaunchPromise = new Promise<void>((resolve, reject) => {
          const manualLaunchListener = DeviceEventEmitter.addListener(
            'TaskManualLaunchCompleted',
            (data: { taskId: string; step: number }) => {
              if (data.taskId === taskId && data.step === step) {
                console.info(`[任务执行] 步骤 ${step}: 用户已手动启动应用 "${packageName}"`);
                manualLaunchListener.remove();
                resolve();
              }
            }
          );

          // 30秒超时
          setTimeout(() => {
            manualLaunchListener.remove();
            reject(new Error('等待用户手动启动应用超时'));
          }, 30000);
        });

        await manualLaunchPromise;
        // 等待应用启动完成
        await new Promise((resolve) => setTimeout(resolve, 2000));
        console.info(`[任务执行] 步骤 ${step}: 应用 "${packageName}" 手动启动完成`);
      } else {
        // ADB启动也失败，记录警告但不抛出错误，让任务继续执行
        console.warn(`[任务执行] 步骤 ${step}: 无障碍和ADB启动都失败，跳过继续执行`);
      }
    }
  }
}

/**
 * 处理用户接管操作
 */
async function handleTakeOverAction(
  action: TaskAction,
  taskId: string,
  step: number,
  modelResponse?: string
): Promise<void> {
  console.info(`[任务执行] 步骤 ${step}: 进入接管状态`);
  DeviceEventEmitter.emit('TaskTakeOverRequired', {
    taskId,
    step,
    message:
      action.takeOverMessage ||
      '需要用户协助完成登录或验证，请手动操作后点击继续',
  });

  // 等待1秒后继续执行，不再等待用户确认
  console.info(`[任务执行] 步骤 ${step}: 等待1秒后继续执行`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.info(`[任务执行] 步骤 ${step}: 接管状态等待完成，继续执行`);
}

/**
 * 处理记录搜索框位置操作
 */
async function handleRecordSearchBoxAction(
  position: string,
  taskId: string,
  step: number
): Promise<void> {
  try {
    console.info(`[任务执行] 步骤 ${step}: 记录搜索框位置: "${position}"`);
    await searchBoxPositionService.saveSearchBoxPosition(position);
    console.info(`[任务执行] 步骤 ${step}: 搜索框位置已保存: "${position}"`);
  } catch (error) {
    console.error(`[任务执行] 步骤 ${step}: 保存搜索框位置失败:`, error);
    throw new Error(`保存搜索框位置失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

