/**
 * 操作执行模块
 * 负责执行各种操作（点击、滑动、输入等）
 */

import { capabilityService } from '@core/ability';
import type { TaskAction } from '../../types/Task';
import { TASK_CONFIG } from '@shared/constants';

/**
 * 操作执行模块
 */
export class ActionExecutionModule {
  /**
   * 执行操作
   * @param action 操作指令
   * @param timeoutMs 超时时间（毫秒）
   */
  async execute(action: TaskAction, timeoutMs: number = TASK_CONFIG.API_TIMEOUT_MS): Promise<void> {
    try {
      switch (action.type) {
        case 'click':
          if (action.x !== undefined && action.y !== undefined) {
            await this.executeWithTimeout(
              () => capabilityService.performClick(action.x!, action.y!),
              timeoutMs,
              '点击操作'
            );
          } else {
            throw new Error('点击操作缺少坐标参数');
          }
          break;

        case 'longPress':
          if (action.x !== undefined && action.y !== undefined) {
            await this.executeWithTimeout(
              () => capabilityService.performLongPress(action.x!, action.y!),
              timeoutMs,
              '长按操作'
            );
          } else {
            throw new Error('长按操作缺少坐标参数');
          }
          break;

        case 'doubleTap':
          if (action.x !== undefined && action.y !== undefined) {
            await this.executeWithTimeout(
              () => capabilityService.performDoubleTap(action.x!, action.y!),
              timeoutMs,
              '双击操作'
            );
          } else {
            throw new Error('双击操作缺少坐标参数');
          }
          break;

        case 'swipe':
          if (
            action.startX !== undefined &&
            action.startY !== undefined &&
            action.endX !== undefined &&
            action.endY !== undefined
          ) {
            await this.executeWithTimeout(
              () =>
                capabilityService.performSwipe(
                  action.startX!,
                  action.startY!,
                  action.endX!,
                  action.endY!
                ),
              timeoutMs,
              '滑动操作'
            );
          } else {
            throw new Error('滑动操作缺少坐标参数');
          }
          break;

        case 'input':
          if (action.text !== undefined) {
            await this.executeWithTimeout(
              () => capabilityService.performTextInput(action.text!),
              timeoutMs,
              '文本输入'
            );
          } else {
            throw new Error('文本输入操作缺少文本参数');
          }
          break;

        case 'back':
          await this.executeWithTimeout(
            () => capabilityService.performBack(),
            timeoutMs,
            '返回操作'
          );
          break;

        case 'home':
          await this.executeWithTimeout(
            () => capabilityService.performHome(),
            timeoutMs,
            'Home操作'
          );
          break;

        case 'launch':
          if (action.app !== undefined) {
            await this.executeWithTimeout(
              () => capabilityService.launchApp(action.app!),
              timeoutMs,
              '启动应用'
            );
          } else {
            throw new Error('启动应用操作缺少应用参数');
          }
          break;

        case 'wait':
          await this.wait(action.duration || 500);
          break;

        case 'take_over':
          // 用户接管操作，不需要执行
          console.info('[操作执行] 用户接管操作，等待用户操作');
          break;

        case 'record_search_box':
          // 记录搜索框位置操作，由 TaskExecutionActions 处理
          console.info('[操作执行] 记录搜索框位置操作，由 TaskExecutionActions 处理');
          break;

        case 'complete':
          // 完成操作，不需要执行
          console.info('[操作执行] 任务完成');
          break;

        default:
          throw new Error(`未知的操作类型: ${(action as any).type}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`执行操作失败: ${errorMessage}`);
    }
  }

  /**
   * 带超时的操作执行
   */
  private async executeWithTimeout(
    operation: () => Promise<void>,
    timeoutMs: number,
    operationName: string
  ): Promise<void> {
    const operationPromise = operation();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${operationName}超时`)), timeoutMs)
    );

    await Promise.race([operationPromise, timeoutPromise]);
  }

  /**
   * 等待指定时间
   */
  private async wait(duration: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, duration));
  }
}

export const actionExecutionModule = new ActionExecutionModule();

