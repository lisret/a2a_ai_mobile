import React, { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@shared/types/navigation';
import { useTaskExecution } from '../hooks/useTaskExecution';
import { useTaskExecutionWithBackground } from '../useTaskExecutionWithBackground';
import { modelService } from '@features/model/services/ModelService';
import { settingsService } from '@features/settings/services/SettingsService';
import { accessibilityService, appMappingService, floatingWindowService } from '@core/ability';
import { taskHistoryService } from '../services/TaskHistoryService';
import { HOME_SUGGESTIONS, HOME_QUICK_TASKS } from '@shared/constants';
import { NoNoHomeView } from '../components/NoNoHomeView';
import type { AIModel } from '@shared/types/Model';
import type { Task, TaskStep } from '@core/engine/taskEngine';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

  const [model, setModel] = useState<AIModel | null>(null);
  const [taskInput, setTaskInput] = useState('');
  const [executing, setExecuting] = useState(false);
  const [executionSteps, setExecutionSteps] = useState<TaskStep[]>([]);
  const [currentStep, setCurrentStep] = useState<number | undefined>(undefined);
  const [stopConfirmVisible, setStopConfirmVisible] = useState(false);

  // 加载激活的模型
  useEffect(() => {
    loadActiveModel();
    const unsubscribe = navigation.addListener('focus', loadActiveModel);
    return unsubscribe;
  }, [navigation]);

  // 处理路由参数（从历史页面跳转过来时填充输入框）
  // 使用一个简单的全局变量来传递参数（临时方案）
  useFocusEffect(
    useCallback(() => {
      // 检查是否有待填充的任务
      const pendingTaskId = (global as any).__pendingTaskId;
      const pendingInstruction = (global as any).__pendingInstruction;
      
      if (pendingTaskId) {
        loadTaskAndFillInput(pendingTaskId);
        (global as any).__pendingTaskId = undefined;
      } else if (pendingInstruction) {
        setTaskInput(pendingInstruction);
        (global as any).__pendingInstruction = undefined;
      }
    }, [])
  );

  const loadActiveModel = async () => {
    try {
      const selectedModel = await modelService.getSelectedModel();
      setModel(selectedModel);
    } catch (error) {
      console.error('加载模型失败:', error);
    }
  };

  const loadTaskAndFillInput = async (taskId: string) => {
    try {
      const task = await taskHistoryService.getTaskById(taskId);
      if (task) {
        setTaskInput(task.instruction || '');
      }
    } catch (error) {
      console.error('加载任务失败:', error);
    }
  };

  // 前台任务执行 Hook
  const {
    executing: foregroundExecuting,
    currentStep: foregroundStep,
    executeTask: executeTaskForeground,
    cancelTask,
  } = useTaskExecution({
    model,
    onTaskStart: async (taskId) => {
      setExecuting(true);
      setExecutionSteps([]);
      setCurrentStep(0);
    },
    onTaskComplete: async (task) => {
      setExecuting(false);
      setCurrentStep(undefined);
      await loadActiveModel(); // 刷新模型状态
      Alert.alert('成功', '任务执行完成');
    },
    onTaskFailed: (error, isCancelled) => {
      setExecuting(false);
      setCurrentStep(undefined);
      setExecutionSteps([]); // 清空执行步骤
      if (!isCancelled) {
        Alert.alert('执行失败', error);
      }
    },
    onStepUpdate: (step, action) => {
      setCurrentStep(step);
      if (action) {
        setExecutionSteps(prev => {
          const existing = prev.find(s => s.step === step);
          if (existing) {
            return prev.map(s => s.step === step ? { ...s, action: action as any } : s);
          }
          return [...prev, { step, action: action as any, timestamp: Date.now() } as TaskStep];
        });
      }
    },
  });

  // 后台任务执行 Hook
  const { startBackgroundTask, setupBackgroundTaskListeners } = useTaskExecutionWithBackground({
    model,
    onTaskStart: async (taskId) => {
      setExecuting(true);
      setExecutionSteps([]);
      setCurrentStep(0);
    },
    onTaskComplete: async (task) => {
      console.info('[HomeScreen] 任务完成回调被触发:', task?.id);
      setExecuting(false);
      setCurrentStep(undefined);
      // 如果任务包含步骤信息，更新步骤列表
      if (task?.output?.steps && task.output.steps.length > 0) {
        setExecutionSteps(task.output.steps as TaskStep[]);
      } else {
        setExecutionSteps([]);
      }
      await loadActiveModel();
      Alert.alert('成功', '任务执行完成');
    },
    onTaskFailed: (error, isCancelled) => {
      setExecuting(false);
      setCurrentStep(undefined);
      setExecutionSteps([]); // 清空执行步骤
      if (!isCancelled) {
        Alert.alert('执行失败', error);
      }
    },
  });

  // 设置后台任务监听器
  useEffect(() => {
    const cleanup = setupBackgroundTaskListeners();
    return cleanup;
  }, [setupBackgroundTaskListeners]);

  // 同步执行状态
  useEffect(() => {
    if (foregroundExecuting) {
      setExecuting(true);
      setCurrentStep(foregroundStep);
    }
  }, [foregroundExecuting, foregroundStep]);

  // 监听后台任务事件
  useEffect(() => {
    const { DeviceEventEmitter } = require('react-native');

    const stepStartedSub = DeviceEventEmitter.addListener(
      'TaskStepStarted',
      (data: { taskId: string; step: number; maxSteps: number }) => {
        if (executing) {
          setCurrentStep(data.step);
        }
      }
    );

    const stepCompletedSub = DeviceEventEmitter.addListener(
      'TaskStepCompleted',
      async (data: { taskId: string; step: number; action: any }) => {
        if (executing && data.action) {
          setExecutionSteps(prev => {
            const existing = prev.find(s => s.step === data.step);
            if (existing) {
              return prev.map(s =>
                s.step === data.step ? { ...s, action: data.action as any } : s
              );
            }
            return [...prev, { step: data.step, action: data.action as any, timestamp: Date.now() } as TaskStep];
          });
        }
      }
    );

    // 监听任务完成事件（额外监听，确保状态同步）
    const taskCompletedSub = DeviceEventEmitter.addListener(
      'TaskCompleted',
      async (data: { taskId: string; step?: number; task: Task }) => {
        console.info('[HomeScreen] 直接收到任务完成事件:', data.taskId);
        if (executing) {
          setExecuting(false);
          setCurrentStep(undefined);
          // 如果任务包含步骤信息，更新步骤列表
          if (data.task?.output?.steps && data.task.output.steps.length > 0) {
            setExecutionSteps(data.task.output.steps as TaskStep[]);
          } else {
            setExecutionSteps([]);
          }
          await loadActiveModel();
          // 延迟显示 Alert，避免与系统对话框冲突
          setTimeout(() => {
            Alert.alert('成功', '任务执行完成');
          }, 500);
        }
      }
    );

    // 监听任务失败事件
    const taskFailedSub = DeviceEventEmitter.addListener(
      'TaskFailed',
      (data: { taskId: string; error: string; isCancelled?: boolean; task?: Task }) => {
        // 同步失败状态
        setExecuting(false);
        setCurrentStep(undefined);
        // 如果任务数据中包含步骤信息，保留已执行的步骤；否则清空
        if (data.task?.output?.steps && data.task.output.steps.length > 0) {
          setExecutionSteps(data.task.output.steps as TaskStep[]);
        } else {
          setExecutionSteps([]);
        }
        // 触发回调（如果还没有被触发）
        if (!data.isCancelled) {
          // 延迟显示 Alert，避免与系统对话框冲突
          setTimeout(() => {
            Alert.alert('执行失败', data.error);
          }, 500);
        }
      }
    );

    return () => {
      stepStartedSub.remove();
      stepCompletedSub.remove();
      taskCompletedSub.remove();
      taskFailedSub.remove();
    };
  }, [executing]);

  const handleStartTask = async () => {
    const instruction = taskInput.trim();
    if (!instruction) {
      Alert.alert('提示', '请输入任务指令');
      return;
    }

    if (!model) {
      Alert.alert('提示', '请先选择一个模型');
      (navigation as any).navigate('MainTabs', { screen: 'Models' });
      return;
    }

    const isEnabled = await accessibilityService.isEnabled();
    if (!isEnabled) {
      Alert.alert(
        '需要无障碍权限',
        '请先启用无障碍服务',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '去设置',
            onPress: () => accessibilityService.openSettings(),
          },
        ]
      );
      return;
    }

    // 预加载应用映射表
    try {
      const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();
      if (adbFallbackEnabled) {
        appMappingService.getAppMapping().catch(error => {
          console.warn('预加载应用映射表失败:', error);
        });
      }
    } catch (error) {
      console.warn('预加载应用映射表失败:', error);
    }

    // 尝试后台执行，失败则前台执行
    try {
      await startBackgroundTask(instruction);
      setTaskInput(''); // 清空输入
    } catch (error) {
      console.error('启动后台任务失败，回退到前台执行:', error);
      await executeTaskForeground(instruction);
      setTaskInput('');
    }
  };

  const handleStopTask = async () => {
    setStopConfirmVisible(true);
  };

  const confirmStopTask = async () => {
    setStopConfirmVisible(false);
    try {
      const { DeviceEventEmitter } = require('react-native');
      DeviceEventEmitter.emit('TaskCancelRequested', { taskId: 'current' });
      
      try {
        await accessibilityService.stopTaskExecutionService();
        await accessibilityService.releaseWakeLock();
        await floatingWindowService.hideFloatingWindow();
      } catch (error) {
        console.warn('停止后台运行功能失败:', error);
      }

      cancelTask();
      setExecuting(false);
      setCurrentStep(undefined);
      setExecutionSteps([]);
    } catch (error) {
      console.error('中断任务失败:', error);
      Alert.alert('错误', '中断任务时发生错误');
    }
  };

  const handleSuggestionSelect = (text: string) => {
    setTaskInput(text);
  };

  const handleClear = () => {
    setTaskInput('');
  };

  return (
    <NoNoHomeView
      input={taskInput}
      executing={executing}
      displayInstruction={taskInput || '执行中...'}
      steps={executionSteps}
      currentStep={currentStep}
      suggestions={HOME_SUGGESTIONS}
      quickTasks={HOME_QUICK_TASKS}
      stopConfirmVisible={stopConfirmVisible}
      onInputChange={setTaskInput}
      onClear={handleClear}
      onStart={handleStartTask}
      onRequestStop={handleStopTask}
      onConfirmStop={confirmStopTask}
      onCancelStop={() => setStopConfirmVisible(false)}
      onSuggestionSelect={handleSuggestionSelect}
    />
  );
};

