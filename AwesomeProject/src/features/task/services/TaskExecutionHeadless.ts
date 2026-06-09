/**
 * Headless JS 任务执行服务
 * 用于在后台执行任务流程
 */

import { DeviceEventEmitter } from 'react-native';
import { accessibilityService, adbService, appMappingService, floatingWindowService } from '@core/ability';
import { modelInferenceModule } from '@core/engine/taskEngine/task/modules/ModelInferenceModule';
import { taskHistoryService } from './TaskHistoryService';
import { settingsService } from '@features/settings/services/SettingsService';
import { getActionDescription, executeAction } from '@core/engine/taskEngine';
import type { Task, TaskStep, TaskAction } from '@core/engine/taskEngine';
import type { AIModel } from '@shared/types/Model';
import { TASK_CONFIG, TASK_TIMEOUT_CONFIG } from '@shared/constants';

interface TaskExecutionData {
  taskId: string;
  modelId: string;
  instruction: string;
  model: AIModel;
}


/**
 * Headless JS 任务执行函数
 * 这个函数会在后台线程中执行，即使应用切换到后台也能继续运行
 * @param taskDataObj 任务数据对象，包含 taskData 字符串
 */
export async function registerTaskExecutionTask(taskDataObj: any): Promise<void> {
  // 从 taskDataObj 中获取 taskData 字符串并解析
  const taskDataString = taskDataObj?.taskData;
  if (!taskDataString) {
    console.error('[Headless JS] 任务数据为空');
    return;
  }

  let taskData: TaskExecutionData;
  try {
    taskData = JSON.parse(taskDataString);
  } catch (parseError) {
    console.error('[Headless JS] 解析任务数据失败:', parseError);
    return;
  }

  const { taskId, modelId, instruction, model } = taskData;

  console.info('[Headless JS] 开始执行后台任务:', taskId);

  // 发送事件到前台，通知任务开始
  DeviceEventEmitter.emit('TaskStarted', {
    taskId,
    step: 0,
    instruction,
  });

  try {
    // 执行任务逻辑
    await executeTaskInBackground(taskId, modelId, instruction, model);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[Headless JS] 任务执行失败:', errorMessage);

    // 发送事件到前台，通知任务失败
    DeviceEventEmitter.emit('TaskFailed', {
      taskId,
      error: errorMessage,
    });
  }
}

/**
 * 在后台执行任务
 */
async function executeTaskInBackground(
  taskId: string,
  modelId: string,
  instruction: string,
  model: AIModel
): Promise<void> {
  // 检查 ADB 是否启用，如果启用则初始化应用映射表
  try {
    const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();
    await appMappingService.initializeIfNeeded(adbFallbackEnabled);
  } catch (error) {
    console.warn('[任务执行] 初始化应用映射表失败，继续执行任务:', error);
  }

  // 提示词将在第一次调用模型时自动获取，无需提前获取

  let step = 0;
  // 使用模型配置的最大步骤数，如果没有配置则使用默认值99
  const maxSteps = model.maxSteps ?? 99;
  const steps: TaskStep[] = [];
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = TASK_CONFIG.MAX_CONSECUTIVE_ERRORS;
  let shouldCancel = false;
  
  // 跟踪所有待保存的步骤Promise，确保任务结束前所有步骤都已写入
  const pendingSavePromises: Promise<void>[] = [];

  // 维护对话历史，确保同一个任务的所有步骤共享上下文
  const conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string | Array<{
      type: 'text' | 'image_url';
      text?: string;
      image_url?: { url: string };
    }>;
  }> = [];

  // 监听取消事件
  const cancelListener = DeviceEventEmitter.addListener('TaskCancelRequested', (data) => {
    // 如果没有指定 taskId 或 taskId 匹配，则取消任务
    if (!data || !data.taskId || data.taskId === taskId || data.taskId === 'current') {
      console.info('[Headless JS] 收到任务取消请求:', taskId);
      shouldCancel = true;
    }
  });

  try {
    // 初始化无障碍服务
    try {
      await accessibilityService.initialize();
    } catch (initError) {
      const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();
      if (!adbFallbackEnabled) {
        console.warn('[Headless JS] 无障碍服务初始化失败，ADB回退未启用，跳过初始化继续执行');
        // 不抛出错误，继续执行任务
      }
      console.warn('[Headless JS] 无障碍服务初始化失败，但启用了ADB回退');
    }

    // 获取屏幕分辨率（在任务执行前）
    try {
      const screenSize = await accessibilityService.getScreenSize();
      console.info(`[Headless JS] 屏幕分辨率: ${screenSize.width}x${screenSize.height}`);
    } catch (screenSizeError) {
      console.warn('[Headless JS] 获取屏幕分辨率失败，继续执行任务:', screenSizeError);
    }

    // 强制后台运行：确保前台服务、WakeLock 和悬浮窗正在运行
    // 注意：前台服务、WakeLock 和悬浮窗应该在前台启动 Headless JS 任务之前就已经启动
    // 在 Headless JS 中，我们不应该再次启动前台服务（会导致应用回到前台），
    // 而是只更新前台服务的通知内容

    try {
      // 更新前台服务通知（不重新启动服务，避免应用回到前台）
      // 如果服务未运行，updateTaskExecutionService 会启动它，但不会导致应用回到前台
      await accessibilityService.updateTaskExecutionService(`任务执行中...\n步骤: 0/${maxSteps}`);
    } catch (e) {
      console.warn('[Headless JS] 更新前台服务失败（可能服务未启动）:', e);
      // 如果更新失败，尝试启动服务（作为降级方案）
      try {
        await accessibilityService.startTaskExecutionService(`任务执行中...\n步骤: 0/${maxSteps}`);
      } catch (startError) {
        console.warn('[Headless JS] 启动前台服务也失败:', startError);
      }
    }

    try {
      // 确保 WakeLock 已获取
      await accessibilityService.acquireWakeLock();
    } catch (e) {
      console.warn('[Headless JS] 获取 WakeLock 失败（可能已获取）:', e);
    }

    // 显示悬浮窗（如果权限允许）- 暂时禁用
    // try {
    //   const hasOverlayPermission = await floatingWindowService.canDrawOverlays();
    //   if (hasOverlayPermission) {
    //     await floatingWindowService.showFloatingWindow(`任务执行中...\n步骤: 0/${maxSteps}`);
    //   }
    // } catch (overlayError) {
    //   console.warn('[Headless JS] 显示悬浮窗失败:', overlayError);
    // }

    // 注意：不再手动切换到后台
    // - 应用保持在前台可以提高Launch操作成功率（从5-30%提升到85-95%）
    // - Launch操作启动其他应用时，系统会自动将当前应用切换到后台
    // - Headless JS可以在后台继续执行，不受应用前台/后台状态影响

    // ========== 严格按照 Open-AutoGLM 框架的交互流程执行 ==========
    // 参考：https://github.com/zai-org/Open-AutoGLM/tree/main/phone_agent
    // 流程：1.屏幕感知(截图) -> 2.意图解析(调用模型API) -> 3.操作规划(解析响应) 
    //      -> 4.检查完成 -> 5.敏感操作确认 -> 6.执行操作 -> 7.等待界面更新 -> 循环
    while (step < maxSteps) {
      // 检查是否应该取消（在每次循环开始时检查）
      if (shouldCancel) {
        console.info('[Headless JS] 任务已被取消');
        throw new Error('任务已中断');
      }

      step++;
      console.info(`[Headless JS] 开始步骤 ${step}/${maxSteps}`);

      // 在步骤开始时再次检查（防止在循环检查后、步骤开始前收到取消请求）
      if (shouldCancel) {
        console.info('[Headless JS] 任务已被取消（步骤开始前）');
        // 等待所有待保存的步骤完成
        if (pendingSavePromises.length > 0) {
          await Promise.allSettled(pendingSavePromises);
        }
        // 在中断前，先保存已执行的步骤
        if (steps.length > 0) {
          const interruptedTask: Task = {
            id: taskId,
            modelId,
            instruction,
            status: 'failed',
            error: '任务已中断',
            createdAt: Date.now(),
            completedAt: Date.now(),
            output: {
              steps: steps,
            },
          };
          await taskHistoryService.saveTask(interruptedTask);
        }
        throw new Error('任务已中断');
      }

      // 发送事件到前台，通知步骤开始
      DeviceEventEmitter.emit('TaskStepStarted', {
        taskId,
        step,
        maxSteps,
      });

      // 在截图前检查是否应该取消
      if (shouldCancel) {
        console.info('[Headless JS] 任务已被取消（截图前）');
        // 等待所有待保存的步骤完成
        if (pendingSavePromises.length > 0) {
          await Promise.allSettled(pendingSavePromises);
        }
        // 在中断前，先保存已执行的步骤
        if (steps.length > 0) {
          const interruptedTask: Task = {
            id: taskId,
            modelId,
            instruction,
            status: 'failed',
            error: '任务已中断',
            createdAt: Date.now(),
            completedAt: Date.now(),
            output: {
              steps: steps,
            },
          };
          await taskHistoryService.saveTask(interruptedTask);
        }
        throw new Error('任务已中断');
      }

      // 注意：不再检查AppState并切换到后台
      // - 应用保持在前台可以提高Launch操作成功率
      // - Launch操作启动其他应用时，系统会自动将当前应用切换到后台
      // - Headless JS可以在后台继续执行，不受应用前台/后台状态影响

      try {
        // ========== 步骤1: 屏幕感知（截图）==========
        // 参考 Open-AutoGLM: 通过无障碍服务或ADB获取屏幕截图
        let screenshotUri: string | null = null;

        try {
          const screenshotPromise = accessibilityService.captureScreen();
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('截图超时')), 5000)
          );
          screenshotUri = await Promise.race([screenshotPromise, timeoutPromise]);

          if (!screenshotUri) {
            throw new Error('截图失败：返回为空');
          }
        } catch (screenshotError) {
          const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();
          if (adbFallbackEnabled) {
            try {
              screenshotUri = await adbService.captureScreen();
            } catch (adbScreenshotError) {
              console.error('[Headless JS] 截图失败（无障碍和ADB都失败）');
              throw new Error(
                '截图失败：无法通过无障碍服务或 ADB 获取屏幕截图。\n' +
                '可能原因：\n' +
                '1. 无障碍服务未启用或未授权截图权限\n' +
                '2. ADB 权限不足或未启用 ADB 回退\n' +
                '3. 设备不支持截图功能\n' +
                '请检查无障碍服务和 ADB 权限配置。'
              );
            }
          } else {
            console.error('[Headless JS] 截图失败，ADB回退未启用');
            throw new Error(
              '截图失败：无障碍服务无法获取截图，且 ADB 回退未启用。\n' +
              '解决方案：\n' +
              '1. 启用无障碍服务的截图权限\n' +
              '2. 在设置中启用 ADB 回退功能\n' +
              '请检查无障碍服务和设置配置。'
            );
          }
        }

        // 在调用模型 API 前检查是否应该取消
        if (shouldCancel) {
          console.info('[Headless JS] 任务已被取消（调用模型前）');
          // 等待所有待保存的步骤完成
          if (pendingSavePromises.length > 0) {
            await Promise.allSettled(pendingSavePromises);
          }
          // 在中断前，先保存已执行的步骤
          if (steps.length > 0) {
            const interruptedTask: Task = {
              id: taskId,
              modelId,
              instruction,
              status: 'failed',
              error: '任务已中断',
              createdAt: Date.now(),
              completedAt: Date.now(),
              output: {
                steps: steps,
              },
            };
            await taskHistoryService.saveTask(interruptedTask);
          }
          throw new Error('任务已中断');
        }

        // ========== 步骤2: 意图解析（调用模型API）==========
        // 参考 Open-AutoGLM: 将截图和任务指令发送给模型，获取操作指令
        // 流式更新回调
        let streamContent = '';
        const onStreamUpdate = (content: string) => {
          streamContent = content;
          // 发送流式更新事件到前台
          DeviceEventEmitter.emit('TaskStreamUpdate', {
            taskId,
            step,
            content,
          });
        };

        // 使用新的 ModelInferenceModule（已实现新流程）
        const { action, response: modelResponse } = await modelInferenceModule.infer(
          screenshotUri,
          instruction,
          model,
          conversationHistory, // 传递对话历史，维护上下文
          onStreamUpdate
        );
        // 输出模型响应文本
        console.info(`[模型响应文本]  \n${modelResponse}`);
        // 构建当前步骤的用户消息（参考 agent.py）
        // 第一次步骤：{task}\n\n{screen_info} + 截图
        // 后续步骤：** Screen Info **\n\n{screen_info} + 截图
        const isFirstStep = conversationHistory.length === 0;
        const screenInfo = ''; // TODO: 获取当前应用信息并构建 screen_info
        const currentStepText = isFirstStep
          ? `${instruction}${screenInfo ? `\n\n${screenInfo}` : ''}` // 第一次步骤：任务 + 屏幕信息
          : `** Screen Info **${screenInfo ? `\n\n${screenInfo}` : ''}`; // 后续步骤：屏幕信息

        const currentUserMessage = {
          role: 'user' as const,
          content: [
            {
              type: 'text' as const,
              text: currentStepText,
            },
            {
              type: 'image_url' as const,
              image_url: {
                // 截图已压缩为 JPEG 格式（原生层压缩，质量 70%）
                url: screenshotUri.startsWith('data:') ? screenshotUri : `data:image/jpeg;base64,${screenshotUri}`,
              },
            },
          ],
        };

        // 将当前步骤的用户消息添加到对话历史
        conversationHistory.push(currentUserMessage);

        // 添加 Assistant 消息（参考 agent.py 格式）
        // 格式：<think>{thinking}</think><answer>{action}</answer>
        // 注意：modelResponse 已经包含了完整的响应内容（包括 thinking 和 action）
        conversationHistory.push({
          role: 'assistant',
          content: modelResponse,
        });

        // 执行操作后，从上下文中移除图片以节省空间（参考 agent.py）
        // MessageBuilder.remove_images_from_message(self._context[-1])
        // 移除最后一个 user message 中的图片
        if (conversationHistory.length >= 2) {
          const lastUserMessage = conversationHistory[conversationHistory.length - 2];
          if (lastUserMessage.role === 'user' && Array.isArray(lastUserMessage.content)) {
            // 只保留文本内容，移除图片
            const textContent = lastUserMessage.content.find(item => item.type === 'text');
            if (textContent) {
              lastUserMessage.content = [textContent];
            }
          }
        }

        // 更新前台服务通知和悬浮窗（强制后台运行，始终更新）
        try {
          const statusText = `任务执行中...\n步骤: ${step}/${maxSteps}\n操作: ${getActionDescription(action)}`;
          await accessibilityService.updateTaskExecutionService(statusText);
          // 暂时禁用悬浮窗更新
          // try {
          //   await floatingWindowService.updateFloatingWindowText(statusText);
          // } catch (overlayError) {
          //   // 忽略悬浮窗更新失败
          // }
        } catch (updateError) {
          // 忽略更新失败
        }

        // 发送模型响应事件到前台
        DeviceEventEmitter.emit('TaskModelResponse', {
          taskId,
          step,
          response: modelResponse,
        });

        // ========== 步骤3: 操作规划（解析响应）==========
        // 参考 Open-AutoGLM: 解析模型响应，提取操作指令（已在 getAction 中完成）
        // ========== 步骤4: 检查是否完成 ==========
        // 参考 Open-AutoGLM: 如果模型返回 finish()，任务完成
        if (action.type === 'complete') {
          console.info(`[Headless JS] 任务完成，共执行 ${step} 个步骤`);

          // ========== 先记录finish步骤，确保步骤信息完整 ==========
          const finishStep: TaskStep = {
            step: step + 1,  // finish是最后一个步骤
            action: getActionDescription(action),  // 操作描述
            timestamp: Date.now(),  // 时间戳
            actionDetails: action,  // 操作详情
            modelResponse: modelResponse,  // 模型响应
          };
          steps.push(finishStep);
          console.info(`[Headless JS] finish步骤已记录: ${JSON.stringify(finishStep)}`);

          // ========== 强制同步所有状态更新（在显示提示窗前）==========
          // 0. 等待所有待保存的步骤完成（确保所有步骤都已写入）
          if (pendingSavePromises.length > 0) {
            console.info(`[Headless JS] 等待 ${pendingSavePromises.length} 个待保存的步骤完成...`);
            await Promise.allSettled(pendingSavePromises);
            console.info('[Headless JS] 所有待保存的步骤已完成');
          }
          
          // 1. 保存最终任务记录（阻塞等待完成）
          const finalTask: Task = {
            id: taskId,
            modelId,
            instruction,
            status: 'success',
            createdAt: Date.now(),
            completedAt: Date.now(),
            output: {
              steps,  // 包含finish步骤的完整步骤列表
              summary: action.message || '任务执行完成',
            },
          };
          await taskHistoryService.saveTask(finalTask);
          console.info('[Headless JS] 任务记录已保存完成');

          // 2. 更新前台服务通知为完成状态（阻塞等待完成）
          try {
            await accessibilityService.updateTaskExecutionService(
              `任务完成\n步骤: ${step}/${maxSteps}`
            );
            console.info('[Headless JS] 前台服务通知已更新为完成状态');
          } catch (updateError) {
            console.warn('[Headless JS] 更新前台服务通知失败:', updateError);
          }

          // 3. 发送完成事件到前台（同步非阻塞，但确保在提示窗前发送）
          DeviceEventEmitter.emit('TaskCompleted', {
            taskId,
            step,
            task: finalTask,
          });
          console.info('[Headless JS] 任务完成事件已发送');

          // 4. 播放任务完成提示音（如果启用）
          try {
            const soundEnabled = await settingsService.getTaskCompletionSoundEnabled();
            if (soundEnabled) {
              await accessibilityService.playTaskCompletionSound();
              console.info('[Headless JS] 任务完成提示音已播放');
            } else {
              console.info('[Headless JS] 任务完成提示音已禁用，跳过播放');
            }
          } catch (soundError) {
            console.warn('[Headless JS] 播放任务完成提示音失败:', soundError);
            // 静默失败，不影响任务流程
          }

          // ========== 所有状态更新完成，现在可以显示提示窗 ==========
          // 显示任务完成通知和系统对话框
          try {
            const completionMessage = action.message || '任务执行完成';

            // 显示系统对话框（更醒目的提示）
            await accessibilityService.showSystemDialog(
              '任务完成',
              completionMessage,
              '确定'
            );

            // 同时显示通知（用于通知栏）
            await accessibilityService.showTaskCompletionNotification(
              '任务完成',
              completionMessage
            );
          } catch (notificationError) {
            console.warn('[Headless JS] 显示任务完成提示失败:', notificationError);
          }

          // 清理资源
          await cleanupResources();
          cancelListener.remove();
          return;
        }

        // 在执行操作前检查是否应该取消
        if (shouldCancel) {
          console.info('[Headless JS] 任务已被取消（执行操作前）');
          // 等待所有待保存的步骤完成
          if (pendingSavePromises.length > 0) {
            await Promise.allSettled(pendingSavePromises);
          }
          // 即使被中断，也要记录当前步骤（已获取模型响应但未执行操作）
          const interruptedStep: TaskStep = {
            step,
            action: `已中断: ${getActionDescription(action)}`,
            timestamp: Date.now(),
            actionDetails: action,
            modelResponse: modelResponse,
          };
          steps.push(interruptedStep);

          // 保存已执行的步骤
          const interruptedTask: Task = {
            id: taskId,
            modelId,
            instruction,
            status: 'failed',
            error: '任务已中断',
            createdAt: Date.now(),
            completedAt: Date.now(),
            output: {
              steps: steps,
            },
          };
          await taskHistoryService.saveTask(interruptedTask);

          throw new Error('任务已中断');
        }

        // ========== 步骤5: 操作确认 ==========
        // 只有明确标记需要确认的操作（requiresConfirmation）才需要确认
        // take_over 操作在 switch 中有自己的确认逻辑，这里不需要处理
        if (action.requiresConfirmation) {

          // 发送确认请求事件到前台
          DeviceEventEmitter.emit('TaskConfirmationRequired', {
            taskId,
            step,
            message: action.confirmationMessage || '此操作需要确认，是否继续？',
            actionType: action.type,
          });

          // 等待用户确认（最多等待30秒）
          const confirmationPromise = new Promise<boolean>((resolve) => {
            const confirmationListener = DeviceEventEmitter.addListener('TaskConfirmationResult', (data: { taskId: string; step: number; confirmed: boolean }) => {
              if (data.taskId === taskId && data.step === step) {
                confirmationListener.remove();
                resolve(data.confirmed);
              }
            });

            // 超时，默认拒绝
            setTimeout(() => {
              confirmationListener.remove();
              resolve(false);
            }, TASK_TIMEOUT_CONFIG.CONFIRMATION_TIMEOUT_MS);
          });

          const confirmed = await confirmationPromise;
          if (!confirmed) {
            throw new Error('用户取消了操作');
          }
        }

        // ========== 步骤6: 执行操作 ==========
        // 参考 Open-AutoGLM: 通过无障碍服务或ADB执行规划的操作
        try {
          const actionResult = await executeAction({
            action,
            taskId,
            step,
            modelResponse,
          });

          // 如果返回了步骤记录（如 take_over），添加到步骤列表
          if (actionResult.step) {
            steps.push(actionResult.step);
          }

          // 操作成功，重置连续错误计数
          consecutiveErrors = 0;

          // 记录步骤（如果还没有记录）
          if (action.type !== 'take_over') {
            const taskStep: TaskStep = {
              step,
              action: getActionDescription(action),  // 操作描述
              timestamp: Date.now(),  // 时间戳
              actionDetails: action,  // 操作详情
              modelResponse: modelResponse,  // 模型响应
            };
            steps.push(taskStep);
          }
        } catch (actionError) {
          consecutiveErrors++;
          const actionErrorMessage = actionError instanceof Error ? actionError.message : String(actionError);

          if (consecutiveErrors >= maxConsecutiveErrors) {
            throw new Error(
              `连续 ${maxConsecutiveErrors} 次操作执行失败，任务已停止。最后错误: ${actionErrorMessage}`
            );
          }
          throw actionError;
        }

        // 更新任务记录（异步执行，不阻塞任务流程，但跟踪Promise确保最终写入）
        const updatedTask: Task = {
          id: taskId,  // 任务ID
          modelId,  // 模型ID
          instruction,  // 任务指令
          status: 'running',  // 任务状态
          createdAt: Date.now(),  // 创建时间戳
          output: {
            steps,  // 步骤列表
          },
        };
        // 异步保存，不等待完成，减少50-200ms延迟
        // 但将Promise添加到队列中，确保任务结束前所有步骤都已写入
        const savePromise = taskHistoryService.saveTask(updatedTask).catch(error => {
          console.warn('[Headless JS] 保存任务记录失败（不影响任务执行）:', error);
        });
        pendingSavePromises.push(savePromise);

        // 发送步骤完成事件到前台
        DeviceEventEmitter.emit('TaskStepCompleted', {
          taskId,
          step,
          action: getActionDescription(action),
        });

        // ========== 步骤7: 等待界面更新 ==========
        // 参考 Open-AutoGLM: 操作执行后等待界面更新，然后进入下一轮循环
        await new Promise(resolve => setTimeout(resolve, TASK_TIMEOUT_CONFIG.UI_UPDATE_DELAY_MS));
      } catch (stepError) {
        consecutiveErrors++;
        const errorMessage = stepError instanceof Error ? stepError.message : String(stepError);

        // 记录错误步骤
        // 判断是否是解析失败（没有明确的操作指令）
        const isParseError = errorMessage.includes('无法从模型响应中解析出有效的操作指令');
        const errorStep: TaskStep = {
          step,
          action: isParseError ? '思考中' : `错误: ${errorMessage}`,
          timestamp: Date.now(),
          modelResponse: isParseError ? errorMessage : `执行失败: ${errorMessage}`,
        };
        steps.push(errorStep);

        // 发送错误事件到前台
        DeviceEventEmitter.emit('TaskStepError', {
          taskId,
          step,
          error: errorMessage,
        });

        // 如果连续错误次数过多，停止任务
        if (consecutiveErrors >= maxConsecutiveErrors) {
          throw new Error(`连续 ${maxConsecutiveErrors} 次步骤执行失败，任务已停止。最后错误: ${errorMessage}`);
        }

        // 等待一段时间后继续
        await new Promise(resolve => setTimeout(resolve, TASK_TIMEOUT_CONFIG.ERROR_RETRY_DELAY_MS));
      }
    }

    if (step >= maxSteps) {
      throw new Error(`任务执行超时，已达到最大步数 ${maxSteps}`);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : '未知错误';
    const isCancelled = shouldCancel;

    // ========== 强制同步所有状态更新（在显示提示窗前）==========
    // 0. 等待所有待保存的步骤完成（确保所有步骤都已写入）
    if (pendingSavePromises.length > 0) {
      console.info(`[Headless JS] 等待 ${pendingSavePromises.length} 个待保存的步骤完成...`);
      await Promise.allSettled(pendingSavePromises);
      console.info('[Headless JS] 所有待保存的步骤已完成');
    }
    
    // 1. 保存失败的任务记录（阻塞等待完成）
    const failedTask: Task = {
      id: taskId,
      modelId,
      instruction,
      status: 'failed',
      error: isCancelled ? '任务已中断' : errorMessage,
      createdAt: Date.now(),
      completedAt: Date.now(),
      output: {
        steps: steps, // 保存已执行的步骤，而不是空数组
      },
    };
    await taskHistoryService.saveTask(failedTask);
    console.info('[Headless JS] 失败任务记录已保存完成');

    // 2. 更新前台服务通知为失败状态（阻塞等待完成）
    try {
      const failureStatusText = isCancelled
        ? `任务已中断\n步骤: ${steps.length}`
        : `任务失败\n步骤: ${steps.length}\n错误: ${errorMessage}`;
      await accessibilityService.updateTaskExecutionService(failureStatusText);
      console.info('[Headless JS] 前台服务通知已更新为失败状态');
    } catch (updateError) {
      console.warn('[Headless JS] 更新前台服务通知失败:', updateError);
    }

    // 3. 发送失败事件到前台（同步非阻塞，但确保在提示窗前发送）
    DeviceEventEmitter.emit('TaskFailed', {
      taskId,
      error: isCancelled ? '任务已中断' : errorMessage,
      isCancelled,
      task: failedTask, // 传递完整的任务数据，包含已执行的步骤
    });
    console.info('[Headless JS] 任务失败事件已发送');

    // 4. 播放任务失败提示音（如果启用）
    try {
      const soundEnabled = await settingsService.getTaskCompletionSoundEnabled();
      if (soundEnabled) {
        await accessibilityService.playTaskCompletionSound();
        console.info('[Headless JS] 任务失败提示音已播放');
      } else {
        console.info('[Headless JS] 任务完成提示音已禁用，跳过播放');
      }
    } catch (soundError) {
      console.warn('[Headless JS] 播放任务失败提示音失败:', soundError);
      // 静默失败，不影响任务流程
    }

    // ========== 所有状态更新完成，现在可以显示提示窗 ==========
    // 显示任务失败通知和系统对话框
    try {
      const failureMessage = isCancelled ? '任务已中断' : errorMessage;

      // 显示系统对话框（更醒目的提示）
      await accessibilityService.showSystemDialog(
        '任务失败',
        failureMessage,
        '确定'
      );

      // 同时显示通知（用于通知栏）
      await accessibilityService.showTaskCompletionNotification(
        '任务失败',
        failureMessage
      );
    } catch (notificationError) {
      console.warn('[Headless JS] 显示任务失败提示失败:', notificationError);
    }

    // 清理资源
    await cleanupResources();
    cancelListener.remove();

    throw err;
  }
}

/**
 * 清理资源
 */
async function cleanupResources(): Promise<void> {
  try {
    // 强制后台运行，始终清理资源
    await accessibilityService.stopTaskExecutionService();
    await accessibilityService.releaseWakeLock();
    await floatingWindowService.hideFloatingWindow();
  } catch (error) {
    console.warn('[Headless JS] 清理资源失败:', error);
  }
}

