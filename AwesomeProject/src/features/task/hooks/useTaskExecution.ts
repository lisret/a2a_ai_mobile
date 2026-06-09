/**
 * 任务执行相关的 Hook
 * 封装任务执行的业务逻辑，便于复用和测试
 */

import { useState, useRef, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { accessibilityService, appMappingService, adbService, floatingWindowService } from '@core/ability';
import { modelInferenceModule } from '@core/engine/taskEngine/task/modules/ModelInferenceModule';
import { taskHistoryService } from '../services/TaskHistoryService';
import { settingsService } from '@features/settings/services/SettingsService';
import { TASK_CONFIG, ACCESSIBILITY_CONFIG } from '@shared/constants';
import type { Task, TaskAction } from '@core/engine/taskEngine';
import type { AIModel } from '@shared/types/Model';
import { getActionDescription } from '@shared/utils/taskHelpers';

interface UseTaskExecutionOptions {
  model: AIModel | null;
  onTaskStart?: (taskId: string) => void;
  onTaskComplete?: (task: Task) => void;
  onTaskFailed?: (error: string, isCancelled?: boolean) => void;
  onStepUpdate?: (step: number, action: TaskAction, modelResponse?: string) => void;
  onStreamUpdate?: (step: number, content: string) => void;
}

export function useTaskExecution(options: UseTaskExecutionOptions) {
  const { model, onTaskStart, onTaskComplete, onTaskFailed, onStepUpdate, onStreamUpdate } = options;

  const [executing, setExecuting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentInstruction, setCurrentInstruction] = useState<string>('');
  const executingRef = useRef(false);
  const shouldCancelRef = useRef(false);
  
  // 维护对话历史，确保同一个任务的所有步骤共享上下文
  const conversationHistoryRef = useRef<Array<{
    role: 'user' | 'assistant' | 'system';
    content: string | Array<{
      type: 'text' | 'image_url';
      text?: string;
      image_url?: { url: string };
    }>;
  }>>([]);

  /**
   * 检查无障碍服务状态
   */
  const checkAccessibilityService = useCallback(async (): Promise<boolean> => {
    const isAccessibilityEnabled = await accessibilityService.isEnabled();
    const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();

    if (!isAccessibilityEnabled) {
      if (adbFallbackEnabled) {
        const shouldContinue = await new Promise<boolean>((resolve) => {
          Alert.alert(
            '无障碍服务未启用',
            '无障碍服务未启用，但已启用 ADB 回退。\n\n注意：截图功能需要无障碍服务。如果无法截图，任务将无法继续。操作可以使用 ADB 执行。\n\n是否继续尝试执行？',
            [
              { text: '取消', style: 'cancel', onPress: () => resolve(false) },
              {
                text: '去设置',
                onPress: () => {
                  accessibilityService.openSettings();
                  resolve(false);
                },
              },
              {
                text: '继续执行',
                onPress: () => resolve(true),
              },
            ]
          );
        });
        return shouldContinue;
      } else {
        Alert.alert(
          '需要无障碍权限',
          '请先启用无障碍服务才能执行自动化任务',
          [
            { text: '取消', style: 'cancel' },
            {
              text: '去设置',
              onPress: () => accessibilityService.openSettings(),
            },
          ]
        );
        return false;
      }
    }

    // 无障碍服务已启用，尝试初始化
    try {
      await accessibilityService.initialize();
    } catch (initError) {
      if (adbFallbackEnabled) {
        console.warn('[任务执行] 无障碍服务初始化失败，但启用了ADB回退，继续执行:', initError);
        return true;
      }
      throw initError;
    }

    // 检查服务实例是否可用（Android 9 特殊处理）
    try {
      await accessibilityService.captureScreen();
      return true;
    } catch (captureError) {
      const errorMessage = captureError instanceof Error ? captureError.message : String(captureError);
      
      if (errorMessage.includes('无障碍服务未启动') || errorMessage.includes('服务实例为 null')) {
        if (Platform.OS === 'android' && Platform.Version < 30) {
          const serviceReady = await new Promise<boolean>((resolve) => {
            Alert.alert(
              '启动无障碍服务',
              '请点击屏幕任意位置来启动无障碍服务（Android 9 需要手动触发）',
              [
                {
                  text: '已点击',
                  onPress: async () => {
                    let retries = 0;
                    const maxRetries = ACCESSIBILITY_CONFIG.ANDROID_9_CHECK_RETRIES;
                    const checkService = async () => {
                      try {
                        await accessibilityService.captureScreen();
                        resolve(true);
                      } catch (error) {
                        retries++;
                        if (retries < maxRetries) {
                          setTimeout(checkService, ACCESSIBILITY_CONFIG.ANDROID_9_CHECK_DELAY_MS);
                        } else {
                          resolve(false);
                        }
                      }
                    };
                    setTimeout(checkService, ACCESSIBILITY_CONFIG.ANDROID_9_CHECK_DELAY_MS);
                  },
                },
              ],
              { cancelable: false }
            );
          });

          if (!serviceReady && adbFallbackEnabled) {
            console.warn('[任务执行] 无障碍服务启动超时，但启用了ADB回退，继续执行');
            return true;
          }
          return serviceReady;
        } else {
          if (adbFallbackEnabled) {
            console.warn('[任务执行] 无障碍服务不可用，但启用了ADB回退，继续执行');
            return true;
          }
          throw captureError;
        }
      }
      throw captureError;
    }
  }, []);

  /**
   * 执行任务（前台执行）
   */
  const executeTask = useCallback(async (instruction: string) => {
    if (!model) {
      Alert.alert('提示', '模型信息加载失败');
      return;
    }

    // 检查 ADB 是否启用，如果启用则初始化应用映射表
    try {
      const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();
      await appMappingService.initializeIfNeeded(adbFallbackEnabled);
    } catch (error) {
      console.warn('[任务执行] 初始化应用映射表失败，继续执行任务:', error);
    }

    // 提示词将在第一次调用模型时自动获取，无需提前获取

    // 检查无障碍服务
    const canProceed = await checkAccessibilityService();
    if (!canProceed) {
      setExecuting(false);
      executingRef.current = false;
      return;
    }

    // 获取屏幕分辨率（在任务执行前）
    try {
      const screenSize = await accessibilityService.getScreenSize();
      console.info(`[任务执行] 屏幕分辨率: ${screenSize.width}x${screenSize.height}`);
    } catch (screenSizeError) {
      console.warn('[任务执行] 获取屏幕分辨率失败，继续执行任务:', screenSizeError);
    }

    executingRef.current = true;
    shouldCancelRef.current = false;
    setExecuting(true);
    setCurrentStep(0);
    setCurrentInstruction(instruction);

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const taskInstruction = instruction.trim();

    // 创建初始任务记录
    const initialTask: Task = {
      id: taskId,
      modelId: model.id,
      instruction: taskInstruction,
      status: 'running',
      createdAt: Date.now(),
      output: { steps: [] },
    };
    await taskHistoryService.saveTask(initialTask);
    onTaskStart?.(taskId);

    let step = 0;
    const steps: NonNullable<Task['output']>['steps'] = [];
    let consecutiveErrors = 0;
    // 使用模型配置的最大步骤数，如果没有配置则使用默认值99
    const maxSteps = model.maxSteps ?? 99;

    try {
      while (step < maxSteps) {
        if (shouldCancelRef.current) {
          throw new Error('任务已中断');
        }

        step++;
        setCurrentStep(step);

        try {
          // 截图
          let screenshotUri: string | null = null;
          try {
            const screenshotPromise = accessibilityService.captureScreen();
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('截图超时')), TASK_CONFIG.SCREENSHOT_TIMEOUT_MS)
            );
            screenshotUri = await Promise.race([screenshotPromise, timeoutPromise]);
          } catch (screenshotError) {
            const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();
            if (adbFallbackEnabled) {
              screenshotUri = await adbService.captureScreen();
            } else {
              throw screenshotError;
            }
          }

          // 调用模型API
          const onStreamUpdateCallback = (content: string) => {
            onStreamUpdate?.(step, content);
          };

          // 使用新的 ModelInferenceModule（已实现新流程）
          const { action, response: modelResponse } = await modelInferenceModule.infer(
            screenshotUri!,
            taskInstruction,
            model,
            conversationHistoryRef.current, // 传递对话历史，维护上下文
            onStreamUpdateCallback
          );
          onStepUpdate?.(step, action, modelResponse);
          
          // 构建当前步骤的用户消息（参考 agent.py）
          // 第一次步骤：{task}\n\n{screen_info} + 截图
          // 后续步骤：** Screen Info **\n\n{screen_info} + 截图
          const isFirstStep = conversationHistoryRef.current.length === 0;
          const screenInfo = ''; // TODO: 获取当前应用信息并构建 screen_info
          const currentStepText = isFirstStep
            ? `${taskInstruction}${screenInfo ? `\n\n${screenInfo}` : ''}` // 第一次步骤：任务 + 屏幕信息
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
                  url: screenshotUri!.startsWith('data:') ? screenshotUri! : `data:image/jpeg;base64,${screenshotUri!}`,
                },
              },
            ],
          };
          
          // 将当前步骤的用户消息添加到对话历史
          conversationHistoryRef.current.push(currentUserMessage);
          
          // 添加 Assistant 消息（参考 agent.py 格式）
          // 格式：<think>{thinking}</think><answer>{action}</answer>
          // 注意：modelResponse 已经包含了完整的响应内容（包括 thinking 和 action）
          conversationHistoryRef.current.push({
            role: 'assistant',
            content: modelResponse,
          });
          
          // 执行操作后，从上下文中移除图片以节省空间（参考 agent.py）
          // MessageBuilder.remove_images_from_message(self._context[-1])
          // 移除最后一个 user message 中的图片
          if (conversationHistoryRef.current.length >= 2) {
            const lastUserMessage = conversationHistoryRef.current[conversationHistoryRef.current.length - 2];
            if (lastUserMessage.role === 'user' && Array.isArray(lastUserMessage.content)) {
              // 只保留文本内容，移除图片
              const textContent = lastUserMessage.content.find(item => item.type === 'text');
              if (textContent) {
                lastUserMessage.content = [textContent];
              }
            }
          }

          // 检查是否完成
          if (action.type === 'complete') {
            const finalTask: Task = {
              ...initialTask,
              status: 'success',
              completedAt: Date.now(),
              output: { steps, summary: '任务执行完成' },
            };
            await taskHistoryService.saveTask(finalTask);
            onTaskComplete?.(finalTask);
            setExecuting(false);
            executingRef.current = false;
            return;
          }

          // 检查是否需要用户确认（只有明确标记 requiresConfirmation 的操作才需要确认）
          // take_over 操作在 switch 中有自己的确认逻辑
          if (action.requiresConfirmation) {
            // 前台执行时，使用Alert确认
            const confirmed = await new Promise<boolean>((resolve) => {
              Alert.alert(
                '操作确认',
                action.confirmationMessage || '此操作需要确认，是否继续？',
                [
                  { text: '取消', style: 'cancel', onPress: () => resolve(false) },
                  { text: '确认', style: 'destructive', onPress: () => resolve(true) },
                ]
              );
            });
            
            if (!confirmed) {
              throw new Error('用户取消了操作');
            }
          }

          // 执行操作
          try {
            switch (action.type) {
              case 'click':
                if (action.x !== undefined && action.y !== undefined) {
                  await accessibilityService.performClick(action.x, action.y);
                }
                break;
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
                }
                break;
              case 'input':
                if (action.text) {
                  await accessibilityService.performTextInput(action.text);
                }
                break;
              case 'back':
                await accessibilityService.performBack();
                break;
              case 'home':
                await accessibilityService.performHome();
                break;
              case 'launch':
                if (action.app) {
                  try {
                    await accessibilityService.launchApp(action.app);
                  } catch (launchError: any) {
                    // 检查是否需要用户手动启动
                    if (launchError?.requiresManualLaunch) {
                      // 前台执行时，使用Alert提示用户手动启动
                      await new Promise<void>((resolve) => {
                        Alert.alert(
                          '需要手动启动应用',
                          `无法自动启动应用: ${action.app}。请手动启动应用后点击继续。`,
                          [{ text: '继续', onPress: () => resolve() }]
                        );
                      });
                      // 等待应用启动完成
                      await new Promise(resolve => setTimeout(resolve, 2000));
                    } else {
                      // 其他错误，直接抛出
                      throw launchError;
                    }
                  }
                }
                break;
              case 'take_over':
                // 前台执行时，等待1秒后继续执行
                console.info('[任务执行] 进入接管状态，等待1秒后继续执行');
                await new Promise((resolve) => setTimeout(resolve, 1000));
                break;
              case 'wait':
                await new Promise(resolve => setTimeout(resolve, action.duration || TASK_CONFIG.ACTION_WAIT_DURATION));
                break;
            }
            consecutiveErrors = 0;
          } catch (actionError) {
            consecutiveErrors++;
            if (consecutiveErrors >= TASK_CONFIG.MAX_CONSECUTIVE_ERRORS) {
              throw new Error(`连续 ${TASK_CONFIG.MAX_CONSECUTIVE_ERRORS} 次操作执行失败`);
            }
            throw actionError;
          }

          // 记录步骤
          const taskStep: NonNullable<Task['output']>['steps'][0] = {
            step,
            action: getActionDescription(action),
            timestamp: Date.now(),
            actionDetails: action,
            modelResponse,
          };
          steps.push(taskStep);

          // 更新任务记录
          const updatedTask: Task = {
            ...initialTask,
            output: { steps },
          };
          await taskHistoryService.saveTask(updatedTask);

          // 等待界面更新
          await new Promise(resolve => setTimeout(resolve, TASK_CONFIG.ACTION_WAIT_DURATION));
        } catch (stepError) {
          consecutiveErrors++;
          const errorMessage = stepError instanceof Error ? stepError.message : String(stepError);
          
          const isParseError = errorMessage.includes('无法从模型响应中解析出有效的操作指令');
          const errorStep: NonNullable<Task['output']>['steps'][0] = {
            step,
            action: isParseError ? '思考中' : `错误: ${errorMessage}`,
            timestamp: Date.now(),
            modelResponse: isParseError ? errorMessage : `执行失败: ${errorMessage}`,
          };
          steps.push(errorStep);

          if (consecutiveErrors >= TASK_CONFIG.MAX_CONSECUTIVE_ERRORS) {
            throw new Error(`连续 ${TASK_CONFIG.MAX_CONSECUTIVE_ERRORS} 次步骤执行失败`);
          }

          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      throw new Error(`任务执行超时，已达到最大步数 ${maxSteps}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误';
      const isCancelled = shouldCancelRef.current;
      
      executingRef.current = false;
      shouldCancelRef.current = false;
      setExecuting(false);

      const failedTask: Task = {
        ...initialTask,
        status: 'failed',
        error: isCancelled ? '任务已中断' : errorMessage,
        completedAt: Date.now(),
        output: { steps },
      };
      await taskHistoryService.saveTask(failedTask);
      onTaskFailed?.(errorMessage, isCancelled);
    }
  }, [model, checkAccessibilityService, onTaskStart, onTaskComplete, onTaskFailed, onStepUpdate, onStreamUpdate]);

  /**
   * 取消任务
   */
  const cancelTask = useCallback(async () => {
    if (!executingRef.current) return;

    Alert.alert(
      '确认中断',
      '确定要中断当前任务吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          style: 'destructive',
          onPress: async () => {
            shouldCancelRef.current = true;
            const { DeviceEventEmitter } = require('react-native');
            DeviceEventEmitter.emit('TaskCancelRequested', { taskId: 'current' });
            
            try {
              // 强制后台运行，始终清理资源
              await accessibilityService.stopTaskExecutionService();
              await accessibilityService.releaseWakeLock();
              await floatingWindowService.hideFloatingWindow();
              executingRef.current = false;
              setExecuting(false);
              setCurrentStep(0);
            } catch (error) {
              console.warn('[任务中断] 停止后台运行功能失败:', error);
            }
          },
        },
      ]
    );
  }, []);

  return {
    executing,
    currentStep,
    currentInstruction,
    executeTask,
    cancelTask,
  };
}

