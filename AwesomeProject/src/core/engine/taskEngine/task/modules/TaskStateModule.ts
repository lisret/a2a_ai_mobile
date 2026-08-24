/**
 * 任务状态管理模块
 *
 * Pure in-memory task state holder. Global `DeviceEventEmitter` broadcasts have
 * been removed: UI updates now flow only through the task-scoped, validated
 * `NonoTaskEventV1` stream emitted by the shared runner. This module no longer
 * emits any event.
 */

import type {Task} from '../../types/Task';

export interface TaskState {
  taskId: string;
  status: Task['status'];
  currentStep: number;
  maxSteps: number;
  error?: string;
}

export class TaskStateModule {
  private state: TaskState | null = null;

  initialize(taskId: string, maxSteps: number): void {
    this.state = {
      taskId,
      status: 'running',
      currentStep: 0,
      maxSteps,
    };
  }

  getState(): TaskState | null {
    return this.state ? {...this.state} : null;
  }

  updateStep(step: number): void {
    if (this.state) {
      this.state.currentStep = step;
    }
  }

  updateStatus(status: Task['status'], error?: string): void {
    if (this.state) {
      this.state.status = status;
      if (error) {
        this.state.error = error;
      }
    }
  }

  reset(): void {
    this.state = null;
  }
}
