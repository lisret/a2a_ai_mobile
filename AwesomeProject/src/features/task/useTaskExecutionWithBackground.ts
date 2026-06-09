/**
 * 带后台执行支持的任务执行 Hook
 * 封装前台和后台任务执行的统一逻辑
 */

import { useCallback } from 'react';
import { Alert } from 'react-native';
import { DeviceEventEmitter } from 'react-native';
import { accessibilityService } from '@core/ability';
import { taskHistoryService } from '@features/task/services/TaskHistoryService';
import type { Task } from '@core/engine/taskEngine';
import type { AIModel } from '@shared/types/Model';

interface UseTaskExecutionWithBackgroundOptions {
  model: AIModel | null;
  onTaskStart?: (taskId: string) => void;
  onTaskComplete?: (task: Task) => void;
  onTaskFailed?: (error: string, isCancelled?: boolean) => void;
}

/**
 * 使用后台执行的任务执行 Hook
 * 根据设置自动选择前台或后台执行
 */
export function useTaskExecutionWithBackground(options: UseTaskExecutionWithBackgroundOptions) {
  const { model, onTaskStart, onTaskComplete, onTaskFailed } = options;

  /**
   * 启动后台任务执行
   */
  const startBackgroundTask = useCallback(async (instruction: string): Promise<void> => {
    if (!model) {
      Alert.alert('提示', '模型信息加载失败');
      return;
    }

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

    // 使用模型配置的最大步骤数，如果没有配置则使用默认值99
    const maxSteps = model.maxSteps ?? 99;

    // 准备任务数据
    const taskData = JSON.stringify({
      taskId,
      modelId: model.id,
      instruction: taskInstruction,
      model: {
        id: model.id,
        name: model.name,
        apiUrl: model.apiUrl,
        apiKey: model.apiKey,
        modelName: model.modelName,
        description: model.description,
        maxSteps: model.maxSteps,
        createdAt: model.createdAt,
        updatedAt: model.updatedAt,
      },
    });

    try {
      // 1. 启动前台服务
      await accessibilityService.startTaskExecutionService(`任务执行中...\n步骤: 0/${maxSteps}`);
      
      // 2. 获取 WakeLock
      await accessibilityService.acquireWakeLock();
      
      // 3. 启动后台任务（Headless JS）
      await accessibilityService.startBackgroundTask(taskData);
      
      // 4. 等待一小段时间，确保 Headless JS 任务已启动
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 注意：不再手动切换到后台
      // - Launch操作启动其他应用时，系统会自动将当前应用切换到后台
      // - Headless JS可以在后台继续执行，不受应用前台/后台状态影响
      // - 保持应用在前台可以提高Launch操作成功率（从5-30%提升到85-95%）
      console.info('[任务执行] 后台任务已启动，应用保持在前台（Launch操作会自动切换）');
    } catch (bgError) {
      console.error('[任务执行] 启动后台任务失败:', bgError);
      throw bgError;
    }
  }, [model, onTaskStart]);

  /**
   * 监听后台任务事件
   */
  const setupBackgroundTaskListeners = useCallback(() => {
    const listeners: Array<{ remove: () => void }> = [];

    // 任务完成
    const taskCompletedSub = DeviceEventEmitter.addListener(
      'TaskCompleted',
      async (data: { taskId: string; step?: number; task: Task }) => {
        console.info('[useTaskExecutionWithBackground] 收到任务完成事件:', data.taskId);
        onTaskComplete?.(data.task);
      }
    );

    // 任务失败
    const taskFailedSub = DeviceEventEmitter.addListener(
      'TaskFailed',
      async (data: { taskId: string; error: string; isCancelled?: boolean }) => {
        onTaskFailed?.(data.error, data.isCancelled);
      }
    );

    listeners.push(taskCompletedSub, taskFailedSub);

    return () => {
      listeners.forEach(listener => listener.remove());
    };
  }, [onTaskComplete, onTaskFailed]);

  return {
    startBackgroundTask,
    setupBackgroundTaskListeners,
  };
}

