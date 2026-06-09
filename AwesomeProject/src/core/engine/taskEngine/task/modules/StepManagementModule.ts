/**
 * 步骤管理模块
 * 负责步骤记录和状态管理
 */

import type { TaskStep, TaskAction } from '../../types/Task';
import { getActionDescription } from '@shared/utils/taskHelpers';

export interface StepContext {
  step: number;
  maxSteps: number;
  action: TaskAction;
  modelResponse?: string;
  screenshotUri?: string;
  timestamp: number;
  duration?: number;
}

/**
 * 步骤管理模块
 */
export class StepManagementModule {
  private steps: TaskStep[] = [];
  private currentStep = 0;

  /**
   * 获取所有步骤
   */
  getSteps(): TaskStep[] {
    return [...this.steps];
  }

  /**
   * 获取当前步骤数
   */
  getCurrentStep(): number {
    return this.currentStep;
  }

  /**
   * 增加步骤数
   */
  incrementStep(): number {
    this.currentStep++;
    return this.currentStep;
  }

  /**
   * 添加步骤记录
   * @param context 步骤上下文
   */
  addStep(context: StepContext): TaskStep {
    const step: TaskStep = {
      step: context.step,
      action: getActionDescription(context.action), // action 字段是 string
      actionDetails: context.action, // 操作详情存储在 actionDetails
      timestamp: context.timestamp,
      modelResponse: context.modelResponse,
      screenshotUri: context.screenshotUri,
    };

    this.steps.push(step);
    return step;
  }

  /**
   * 更新最后一步
   * @param updates 更新内容
   */
  updateLastStep(updates: Partial<TaskStep>): void {
    if (this.steps.length > 0) {
      const lastStep = this.steps[this.steps.length - 1];
      Object.assign(lastStep, updates);
    }
  }

  /**
   * 清除所有步骤
   */
  clear(): void {
    this.steps = [];
    this.currentStep = 0;
  }

  /**
   * 获取步骤数量
   */
  getStepCount(): number {
    return this.steps.length;
  }
}

