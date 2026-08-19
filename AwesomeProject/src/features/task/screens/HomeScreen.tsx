import React, {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import {Alert, TextInput} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';
import {useTaskExecution} from '../hooks/useTaskExecution';
import {useTaskExecutionWithBackground} from '../useTaskExecutionWithBackground';
import {modelService} from '@features/model/services/ModelService';
import {settingsService} from '@features/settings/services/SettingsService';
import {accessibilityService, appMappingService, floatingWindowService} from '@core/ability';
import {taskHistoryService} from '../services/TaskHistoryService';
import {HOME_SUGGESTIONS, HOME_QUICK_TASKS} from '@shared/constants';
import {NoNoHomeView} from '../components/NoNoHomeView';
import type {AvatarMood} from '../components/avatarTypes';
import type {AIModel} from '@shared/types/Model';
import type {Task, TaskStep} from '@core/engine/taskEngine';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

  const [model, setModel] = useState<AIModel | null>(null);
  const [taskInput, setTaskInput] = useState('');
  const [executing, setExecuting] = useState(false);
  const [executionSteps, setExecutionSteps] = useState<TaskStep[]>([]);
  const [currentStep, setCurrentStep] = useState<number | undefined>(undefined);
  const [stopConfirmVisible, setStopConfirmVisible] = useState(false);
  const [runningInstruction, setRunningInstruction] = useState('');
  const [bubbleOverride, setBubbleOverride] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    loadActiveModel();
    const unsubscribe = navigation.addListener('focus', loadActiveModel);
    return unsubscribe;
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      const pendingTaskId = (global as any).__pendingTaskId;
      const pendingInstruction = (global as any).__pendingInstruction;

      if (pendingTaskId) {
        loadTaskAndFillInput(pendingTaskId);
        (global as any).__pendingTaskId = undefined;
      } else if (pendingInstruction) {
        setTaskInput(pendingInstruction);
        (global as any).__pendingInstruction = undefined;
      }
    }, []),
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

  const {
    executing: foregroundExecuting,
    currentStep: foregroundStep,
    executeTask: executeTaskForeground,
    cancelTask,
  } = useTaskExecution({
    model,
    onTaskStart: async () => {
      setExecuting(true);
      setExecutionSteps([]);
      setCurrentStep(0);
    },
    onTaskComplete: async () => {
      setExecuting(false);
      setCurrentStep(undefined);
      await loadActiveModel();
      setRunningInstruction('');
      setBubbleOverride('搞定了，还要我做点别的吗？');
      Alert.alert('成功', '任务执行完成');
    },
    onTaskFailed: (error, isCancelled) => {
      setExecuting(false);
      setCurrentStep(undefined);
      setExecutionSteps([]);
      setRunningInstruction('');
      setBubbleOverride(isCancelled ? '好，已经停手了。' : '这次没做成。换个说法再试一次？');
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
            return prev.map(s => (s.step === step ? {...s, action: action as any} : s));
          }
          return [...prev, {step, action: action as any, timestamp: Date.now()} as TaskStep];
        });
      }
    },
  });

  const {startBackgroundTask, setupBackgroundTaskListeners} = useTaskExecutionWithBackground({
    model,
    onTaskStart: async () => {
      setExecuting(true);
      setExecutionSteps([]);
      setCurrentStep(0);
    },
    onTaskComplete: async task => {
      console.info('[HomeScreen] 任务完成回调被触发:', task?.id);
      setExecuting(false);
      setCurrentStep(undefined);
      if (task?.output?.steps && task.output.steps.length > 0) {
        setExecutionSteps(task.output.steps as TaskStep[]);
      } else {
        setExecutionSteps([]);
      }
      await loadActiveModel();
      setRunningInstruction('');
      setBubbleOverride('搞定了，还要我做点别的吗？');
      Alert.alert('成功', '任务执行完成');
    },
    onTaskFailed: (error, isCancelled) => {
      setExecuting(false);
      setCurrentStep(undefined);
      setExecutionSteps([]);
      setRunningInstruction('');
      setBubbleOverride(isCancelled ? '好，已经停手了。' : '这次没做成。换个说法再试一次？');
      if (!isCancelled) {
        Alert.alert('执行失败', error);
      }
    },
  });

  useEffect(() => {
    const cleanup = setupBackgroundTaskListeners();
    return cleanup;
  }, [setupBackgroundTaskListeners]);

  useEffect(() => {
    if (foregroundExecuting) {
      setExecuting(true);
      setCurrentStep(foregroundStep);
    }
  }, [foregroundExecuting, foregroundStep]);

  useEffect(() => {
    const {DeviceEventEmitter} = require('react-native');

    const stepStartedSub = DeviceEventEmitter.addListener(
      'TaskStepStarted',
      (data: {taskId: string; step: number; maxSteps: number}) => {
        if (executing) {
          setCurrentStep(data.step);
        }
      },
    );

    const stepCompletedSub = DeviceEventEmitter.addListener(
      'TaskStepCompleted',
      async (data: {taskId: string; step: number; action: any}) => {
        if (executing && data.action) {
          setExecutionSteps(prev => {
            const existing = prev.find(s => s.step === data.step);
            if (existing) {
              return prev.map(s =>
                s.step === data.step ? {...s, action: data.action as any} : s,
              );
            }
            return [
              ...prev,
              {step: data.step, action: data.action as any, timestamp: Date.now()} as TaskStep,
            ];
          });
        }
      },
    );

    const taskCompletedSub = DeviceEventEmitter.addListener(
      'TaskCompleted',
      async (data: {taskId: string; step?: number; task: Task}) => {
        console.info('[HomeScreen] 直接收到任务完成事件:', data.taskId);
        if (executing) {
          setExecuting(false);
          setCurrentStep(undefined);
          if (data.task?.output?.steps && data.task.output.steps.length > 0) {
            setExecutionSteps(data.task.output.steps as TaskStep[]);
          } else {
            setExecutionSteps([]);
          }
          await loadActiveModel();
          setRunningInstruction('');
          setBubbleOverride('搞定了，还要我做点别的吗？');
          setTimeout(() => {
            Alert.alert('成功', '任务执行完成');
          }, 500);
        }
      },
    );

    const taskFailedSub = DeviceEventEmitter.addListener(
      'TaskFailed',
      (data: {taskId: string; error: string; isCancelled?: boolean; task?: Task}) => {
        setExecuting(false);
        setCurrentStep(undefined);
        if (data.task?.output?.steps && data.task.output.steps.length > 0) {
          setExecutionSteps(data.task.output.steps as TaskStep[]);
        } else {
          setExecutionSteps([]);
        }
        setRunningInstruction('');
        setBubbleOverride(data.isCancelled ? '好，已经停手了。' : '这次没做成。换个说法再试一次？');
        if (!data.isCancelled) {
          setTimeout(() => {
            Alert.alert('执行失败', data.error);
          }, 500);
        }
      },
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
      setBubbleOverride('先去「模型」页选一个，我才能干活。');
      Alert.alert('提示', '请先选择一个模型');
      (navigation as any).navigate('MainTabs', {screen: 'Models'});
      return;
    }

    const isEnabled = await accessibilityService.isEnabled();
    if (!isEnabled) {
      setBubbleOverride('先去打开无障碍，我才能动手。');
      Alert.alert('需要无障碍权限', '请先启用无障碍服务', [
        {text: '取消', style: 'cancel'},
        {
          text: '去设置',
          onPress: () => accessibilityService.openSettings(),
        },
      ]);
      return;
    }

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

    setRunningInstruction(instruction);
    try {
      await startBackgroundTask(instruction);
      setTaskInput('');
      setBubbleOverride(null);
    } catch (error) {
      console.error('启动后台任务失败，回退到前台执行:', error);
      await executeTaskForeground(instruction);
      setTaskInput('');
      setBubbleOverride(null);
    }
  };

  const handleStopTask = async () => {
    setStopConfirmVisible(true);
  };

  const confirmStopTask = async () => {
    setStopConfirmVisible(false);
    try {
      const {DeviceEventEmitter} = require('react-native');
      DeviceEventEmitter.emit('TaskCancelRequested', {taskId: 'current'});

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
      setRunningInstruction('');
      setBubbleOverride('好，已经停手了。');
    } catch (error) {
      console.error('中断任务失败:', error);
      Alert.alert('错误', '中断任务时发生错误');
    }
  };

  const handleSuggestionSelect = (text: string) => {
    setTaskInput(text);
    setBubbleOverride('要我去做这件事吗？点发送就开始。');
  };

  const handleClear = () => {
    setTaskInput('');
  };

  const handleAvatarPress = () => {
    inputRef.current?.focus();
    setBubbleOverride('想让我干什么？打在下面就行。');
  };

  const mood: AvatarMood = executing ? 'work' : model ? 'idle' : 'error';
  const bubble = useMemo(() => {
    if (bubbleOverride) {
      return bubbleOverride;
    }
    if (executing) {
      return '我去动手，你先看着。';
    }
    if (!model) {
      return '先去「模型」页选一个，我才能干活。';
    }
    return '点我，或在下面打字，剩下的交给我。';
  }, [bubbleOverride, executing, model]);

  return (
    <NoNoHomeView
      input={taskInput}
      executing={executing}
      displayInstruction={runningInstruction || taskInput || '执行中...'}
      steps={executionSteps}
      currentStep={currentStep}
      suggestions={HOME_SUGGESTIONS}
      quickTasks={HOME_QUICK_TASKS}
      stopConfirmVisible={stopConfirmVisible}
      bubble={bubble}
      mood={mood}
      inputRef={inputRef}
      onInputChange={setTaskInput}
      onClear={handleClear}
      onStart={handleStartTask}
      onRequestStop={handleStopTask}
      onConfirmStop={confirmStopTask}
      onCancelStop={() => setStopConfirmVisible(false)}
      onSuggestionSelect={handleSuggestionSelect}
      onAvatarPress={handleAvatarPress}
    />
  );
};
