/**
 * 任务执行引擎
 * 整合所有功能模块，提供完整的任务执行流程
 */

import { capabilityService, accessibilityService, appMappingService } from '@core/ability';
import { taskHistoryService } from '@features/task/services/TaskHistoryService';
import { settingsService } from '@features/settings/services/SettingsService';
import type { Task } from '../types/Task';
import type { AIModel } from '@shared/types/Model';
import { TASK_CONFIG } from '@shared/constants';

import {
  screenshotModule,
  modelInferenceModule,
  actionExecutionModule,
  ConversationHistoryModule,
  StepManagementModule,
  ErrorHandlingModule,
  TaskStateModule,
  CancellationModule,
} from './modules';

/**
 * 任务执行引擎配置
 */
export interface TaskExecutionEngineConfig {
  taskId: string;
  modelId: string;
  instruction: string;
  model: AIModel;
  maxSteps?: number;
  maxConsecutiveErrors?: number;
}

/**
 * 任务执行引擎
 */
export class TaskExecutionEngine {
  private conversationHistory: ConversationHistoryModule;
  private stepManagement: StepManagementModule;
  private errorHandling: ErrorHandlingModule;
  private taskState: TaskStateModule;
  private cancellation: CancellationModule;

  constructor() {
    this.conversationHistory = new ConversationHistoryModule();
    this.stepManagement = new StepManagementModule();
    this.errorHandling = new ErrorHandlingModule({
      maxConsecutiveErrors: TASK_CONFIG.MAX_CONSECUTIVE_ERRORS,
    });
    this.taskState = new TaskStateModule();
    this.cancellation = new CancellationModule();
  }

  /**
   * 执行任务
   */
  async execute(config: TaskExecutionEngineConfig): Promise<Task> {
    const { taskId, modelId, instruction, model, maxSteps, maxConsecutiveErrors } = config;

    // 初始化模块
    this.initialize(taskId, maxSteps ?? model.maxSteps ?? 99, maxConsecutiveErrors);

    try {
      // 前置初始化
      await this.preInitialize();

      // 执行任务循环
      await this.executeTaskLoop(instruction, model);

      // 构建完成的任务
      const completedTask = this.buildCompletedTask(taskId, modelId, instruction);
      this.taskState.emitTaskComplete(completedTask);
      return completedTask;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const failedTask = this.buildFailedTask(taskId, modelId, instruction, errorMessage);
      this.taskState.emitTaskFailed(errorMessage);
      throw failedTask;
    } finally {
      this.cleanup();
    }
  }

  /**
   * 初始化模块
   */
  private initialize(taskId: string, maxSteps: number, maxConsecutiveErrors?: number): void {
    this.taskState.initialize(taskId, maxSteps);
    this.cancellation.initialize(taskId);
    this.stepManagement.clear();
    this.conversationHistory.clear();
    this.errorHandling.reset();

    if (maxConsecutiveErrors !== undefined) {
      this.errorHandling = new ErrorHandlingModule({
        maxConsecutiveErrors,
      });
    }

    this.taskState.emitTaskStarted('');
  }

  /**
   * 前置初始化
   */
  private async preInitialize(): Promise<void> {
    // 初始化能力服务
    await capabilityService.initialize();

    // 初始化应用映射表
    try {
      const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();
      await appMappingService.initializeIfNeeded(adbFallbackEnabled);
    } catch (error) {
      console.warn('[任务引擎] 初始化应用映射表失败，继续执行任务:', error);
    }

    // 提示词将在第一次调用模型时自动获取，无需提前获取

    // 初始化无障碍服务
    try {
      await accessibilityService.initialize();
    } catch (initError) {
      const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();
      if (!adbFallbackEnabled) {
        console.warn('[任务引擎] 无障碍服务初始化失败，ADB回退未启用，跳过初始化继续执行');
        // 不抛出错误，继续执行任务
      } else {
        console.warn('[任务引擎] 无障碍服务初始化失败，但启用了ADB回退');
      }
    }

    // 启动前台服务和WakeLock
    await this.startBackgroundServices();
  }

  /**
   * 启动后台服务
   */
  private async startBackgroundServices(): Promise<void> {
    const state = this.taskState.getState();
    if (!state) return;

    try {
      await accessibilityService.startTaskExecutionService(
        `任务执行中...\n步骤: 0/${state.maxSteps}`
      );
    } catch (e) {
      console.warn('[任务引擎] 启动前台服务失败（可能已启动）:', e);
    }

    try {
      await accessibilityService.acquireWakeLock();
    } catch (e) {
      console.warn('[任务引擎] 获取 WakeLock 失败（可能已获取）:', e);
    }

    // 注意：不再手动切换到后台
    // - 应用保持在前台可以提高Launch操作成功率（从5-30%提升到85-95%）
    // - Launch操作启动其他应用时，系统会自动将当前应用切换到后台
    // - Headless JS可以在后台继续执行，不受应用前台/后台状态影响
  }

  /**
   * 执行任务循环
   */
  private async executeTaskLoop(instruction: string, model: AIModel): Promise<void> {
    const state = this.taskState.getState();
    if (!state) throw new Error('任务状态未初始化');

    while (this.stepManagement.getCurrentStep() < state.maxSteps) {
      // 检查取消
      if (this.cancellation.shouldCancelTask()) {
        throw new Error('任务已中断');
      }

      // 增加步骤
      const step = this.stepManagement.incrementStep();
      this.taskState.updateStep(step);
      this.taskState.emitStepStarted();

      console.info(`[任务引擎] 开始步骤 ${step}/${state.maxSteps}`);

      try {
        // 确保在后台
        await this.ensureBackground();

        // 执行步骤
        await this.executeStep(instruction, model, step);

        // 重置错误计数
        this.errorHandling.reset();
      } catch (error) {
        const shouldContinue = await this.errorHandling.handleError(error as Error, {
          step,
          instruction,
        });

        if (!shouldContinue) {
          throw error;
        }

        // 继续执行下一步
        continue;
      }
    }

    throw new Error(`任务达到最大步骤数 (${state.maxSteps})`);
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(
    instruction: string,
    model: AIModel,
    step: number
  ): Promise<void> {
    const stepStartTime = Date.now();

    // 1. 截图
    const screenshotResult = await screenshotModule.capture();
    const screenshotUri = screenshotResult.screenshotUri;

    // 检查取消
    if (this.cancellation.shouldCancelTask()) {
      throw new Error('任务已中断（截图后）');
    }

    // 2. 模型推理
    const streamUpdateHandler = (content: string) => {
      this.taskState.emitStreamUpdate(content);
    };

    const inferenceResult = await modelInferenceModule.infer(
      screenshotUri,
      instruction,
      model,
      this.conversationHistory.getHistory(),
      streamUpdateHandler
    );

    // 检查取消
    if (this.cancellation.shouldCancelTask()) {
      throw new Error('任务已中断（模型推理后）');
    }

    // 3. 更新对话历史
    this.updateConversationHistory(instruction, screenshotUri, inferenceResult.response);

    // 4. 检查完成
    if (inferenceResult.action.type === 'complete') {
      console.info('[任务引擎] 模型返回完成操作');
      return;
    }

    // 5. 执行操作
    await actionExecutionModule.execute(inferenceResult.action);

    // 6. 记录步骤
    const stepDuration = Date.now() - stepStartTime;
    const stepContext = {
      step,
      maxSteps: this.taskState.getState()?.maxSteps ?? 99,
      action: inferenceResult.action,
      modelResponse: inferenceResult.response,
      screenshotUri,
      timestamp: stepStartTime,
      duration: stepDuration,
    };

    const taskStep = this.stepManagement.addStep(stepContext);
    this.taskState.emitStepUpdate(taskStep.actionDetails || inferenceResult.action, inferenceResult.response);

    // 7. 等待界面更新
    await this.waitForUIUpdate(inferenceResult.action);
  }

  /**
   * 更新对话历史
   */
  private updateConversationHistory(
    instruction: string,
    screenshotUri: string,
    modelResponse: string
  ): void {
    const isFirstStep = this.conversationHistory.isFirstStep();

    if (isFirstStep) {
      // 第一次步骤：添加任务指令和截图
      this.conversationHistory.addUserMessage(instruction, screenshotUri);
    } else {
      // 后续步骤：添加屏幕信息
      this.conversationHistory.addUserMessage('** Screen Info **', screenshotUri);
    }

    // 添加模型回复
    this.conversationHistory.addAssistantMessage(modelResponse);
  }

  /**
   * 等待界面更新
   */
  private async waitForUIUpdate(action: any): Promise<void> {
    // 根据操作类型决定等待时间
    let waitTime = 500; // 默认等待500ms

    switch (action.type) {
      case 'launch':
        waitTime = 2000; // 启动应用需要更长时间
        break;
      case 'wait':
        waitTime = action.duration || 500;
        break;
      case 'swipe':
        waitTime = 800; // 滑动后需要等待界面稳定
        break;
      default:
        waitTime = 500;
    }

    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  /**
   * 确保应用在后台（已废弃）
   * 注意：不再手动切换到后台
   * - 应用保持在前台可以提高Launch操作成功率
   * - Launch操作启动其他应用时，系统会自动将当前应用切换到后台
   * - Headless JS可以在后台继续执行，不受应用前台/后台状态影响
   */
  private async ensureBackground(): Promise<void> {
    // 已废弃：不再手动切换到后台
    // 应用保持在前台，Launch操作会自动切换
  }

  /**
   * 构建成功完成的任务结果
   * @param taskId 任务 ID
   * @param modelId 使用的模型 ID
   * @param instruction 原始用户指令
   * @returns 包含完整步骤记录的 Task 对象，状态为 'success'
   */
  private buildCompletedTask(
    taskId: string,
    modelId: string,
    instruction: string
  ): Task {
    const steps = this.stepManagement.getSteps();
    return {
      id: taskId,
      modelId,
      instruction,
      status: 'success',
      createdAt: Date.now(),
      completedAt: Date.now(),
      output: {
        steps,
      },
    };
  }

  /**
   * 构建失败的任务结果
   * @param taskId 任务 ID
   * @param modelId 使用的模型 ID
   * @param instruction 原始用户指令
   * @param error 失败原因描述
   * @returns 包含错误信息和已执行步骤记录的 Task 对象，状态为 'failed'
   */
  private buildFailedTask(
    taskId: string,
    modelId: string,
    instruction: string,
    error: string
  ): Task {
    const steps = this.stepManagement.getSteps();
    return {
      id: taskId,
      modelId,
      instruction,
      status: 'failed',
      error,
      createdAt: Date.now(),
      completedAt: Date.now(),
      output: {
        steps,
      },
    };
  }

  /**
   * 清理资源
   *
   * 任务结束/取消后调用，重置所有模块状态：
   *   - 注销取消标记（防止内存泄漏）
   *   - 重置任务状态（清空当前 taskId、instruction 等）
   *
   * Called after task completes or is cancelled. Resets cancellation flags
   * and clears the in-memory task state to prevent cross-task contamination.
   */
  private cleanup(): void {
    this.cancellation.cleanup();
    this.taskState.reset();
  }
}

