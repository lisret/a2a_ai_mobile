/**
 * 取消检查模块
 * 负责任务取消检查和处理
 */

import { DeviceEventEmitter } from 'react-native';

/**
 * 取消检查模块
 */
export class CancellationModule {
  private shouldCancel = false;
  private taskId: string | null = null;
  private cancelListener: any = null;

  /**
   * 初始化取消检查
   * @param taskId 任务ID
   */
  initialize(taskId: string): void {
    this.taskId = taskId;
    this.shouldCancel = false;

    // 监听取消事件
    this.cancelListener = DeviceEventEmitter.addListener('TaskCancelRequested', (data) => {
      // 如果没有指定 taskId 或 taskId 匹配，则取消任务
      if (!data || !data.taskId || data.taskId === taskId || data.taskId === 'current') {
        console.info('[取消检查] 收到任务取消请求:', taskId);
        this.shouldCancel = true;
      }
    });
  }

  /**
   * 检查是否应该取消
   */
  shouldCancelTask(): boolean {
    return this.shouldCancel;
  }

  /**
   * 设置取消标志
   */
  setCancel(shouldCancel: boolean): void {
    this.shouldCancel = shouldCancel;
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    if (this.cancelListener) {
      this.cancelListener.remove();
      this.cancelListener = null;
    }
    this.taskId = null;
    this.shouldCancel = false;
  }
}

