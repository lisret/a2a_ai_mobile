/**
 * 任务状态管理模块
 * 负责任务状态和事件通知
 */

import { DeviceEventEmitter } from 'react-native';
import type { Task, TaskStep, TaskAction } from '../../types/Task';

export interface TaskState {
  taskId: string;
  status: Task['status'];
  currentStep: number;
  maxSteps: number;
  error?: string;
}

/**
 * 任务状态管理模块
 */
export class TaskStateModule {
  private state: TaskState | null = null;

  /**
   * 初始化任务状态
   */
  initialize(taskId: string, maxSteps: number): void {
    this.state = {
      taskId,
      status: 'running',
      currentStep: 0,
      maxSteps,
    };
  }

  /**
   * 获取当前状态
   */
  getState(): TaskState | null {
    return this.state ? { ...this.state } : null;
  }

  /**
   * 更新步骤
   */
  updateStep(step: number): void {
    if (this.state) {
      this.state.currentStep = step;
    }
  }

  /**
   * 更新状态
   */
  updateStatus(status: Task['status'], error?: string): void {
    if (this.state) {
      this.state.status = status;
      if (error) {
        this.state.error = error;
      }
    }
  }

  /**
   * 发送任务开始事件
   */
  emitTaskStarted(instruction: string): void {
    if (!this.state) return;

    DeviceEventEmitter.emit('TaskStarted', {
      taskId: this.state.taskId,
      step: 0,
      instruction,
    });
  }

  /**
   * 发送步骤开始事件
   */
  emitStepStarted(): void {
    if (!this.state) return;

    DeviceEventEmitter.emit('TaskStepStarted', {
      taskId: this.state.taskId,
      step: this.state.currentStep,
      maxSteps: this.state.maxSteps,
    });
  }

  /**
   * 发送步骤更新事件
   */
  emitStepUpdate(action: TaskAction | string, modelResponse?: string): void {
    if (!this.state) return;

    // 如果 action 是 TaskAction 类型，转换为字符串描述
    const actionString = typeof action === 'string' 
      ? action 
      : (action as TaskAction)?.type || 'unknown';

    DeviceEventEmitter.emit('TaskStepUpdate', {
      taskId: this.state.taskId,
      step: this.state.currentStep,
      action: actionString,
      modelResponse,
    });
  }

  /**
   * 发送流式更新事件
   */
  emitStreamUpdate(content: string): void {
    if (!this.state) return;

    DeviceEventEmitter.emit('TaskStreamUpdate', {
      taskId: this.state.taskId,
      step: this.state.currentStep,
      content,
    });
  }

  /**
   * 发送任务完成事件
   */
  emitTaskComplete(task: Task): void {
    if (!this.state) return;

    DeviceEventEmitter.emit('TaskComplete', {
      taskId: this.state.taskId,
      task,
    });
  }

  /**
   * 发送任务失败事件
   */
  emitTaskFailed(error: string): void {
    if (!this.state) return;

    DeviceEventEmitter.emit('TaskFailed', {
      taskId: this.state.taskId,
      error,
    });
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.state = null;
  }
}

