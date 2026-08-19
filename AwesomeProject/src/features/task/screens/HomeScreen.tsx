import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@shared/types/navigation';
import { ConfirmModal } from '@shared/components/ConfirmModal';
import { PageLayout } from '@shared/components/PageLayout';
import { TaskInputCard } from '../components/TaskInputCard';
import { ExecutionCard } from '../components/ExecutionCard';
import { SuggestionChips } from '../components/SuggestionChips';
import { useTaskExecution } from '../hooks/useTaskExecution';
import { useTaskExecutionWithBackground } from '../useTaskExecutionWithBackground';
import { modelService } from '@features/model/services/ModelService';
import { settingsService } from '@features/settings/services/SettingsService';
import { accessibilityService, appMappingService, floatingWindowService } from '@core/ability';
import { taskHistoryService } from '../services/TaskHistoryService';
import { COLORS, HOME_SUGGESTIONS, HOME_QUICK_TASKS } from '@shared/constants';
import { NoNoMascot } from '@shared/components/NoNoMascot';
import { AppMark } from '@shared/components/AppMark';
import type { AIModel } from '@shared/types/Model';
import type { Task, TaskStep } from '@core/engine/taskEngine';

const QUICK_TASK_COLORS = ['#ddd9ff', '#ffe0d6', '#d9efeb', '#efe4ff'];

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
    <PageLayout
      title={executing ? '任务执行' : 'NoNo'}
      kicker={executing ? 'LIVE TASK' : 'YOUR AI COMPANION'}
      headerAccessory={executing ? <AppMark size={48} /> : <NoNoMascot size={54} />}
      backgroundColor={COLORS.background.default}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {!executing && (
          <View style={styles.greetingSection}>
            <Text style={styles.greetingTitle}>
              今天想让手机{'\n'}替你完成什么？
            </Text>
            <Text style={styles.greetingSubtitle}>
              NoNo 会先理解目标，再在关键操作前向你确认。
            </Text>
          </View>
        )}

        {executing ? (
          <ExecutionCard
            instruction={taskInput || '执行中...'}
            steps={executionSteps}
            currentStep={currentStep}
            onStop={handleStopTask}
          />
        ) : (
          <TaskInputCard
            value={taskInput}
            onChangeText={setTaskInput}
            onClear={handleClear}
            onStart={handleStartTask}
            disabled={executing}
          />
        )}

        {!executing && (
          <>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>试试这样说</Text>
              <Text style={styles.sectionHint}>点击即可填入</Text>
            </View>
            <SuggestionChips suggestions={HOME_SUGGESTIONS} onSelect={handleSuggestionSelect} />
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>快捷任务</Text>
              <Text style={styles.sectionHint}>安全演示</Text>
            </View>
            <View style={styles.quickGrid}>
              {HOME_QUICK_TASKS.map((item, index) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.quickTask, {backgroundColor: QUICK_TASK_COLORS[index]}]}
                  onPress={() => handleSuggestionSelect(item.value)}
                  activeOpacity={0.85}>
                  <Text style={styles.quickTitle}>{item.label}</Text>
                  <Text style={styles.quickBody}>{item.value.split('：')[1]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <ConfirmModal
        visible={stopConfirmVisible}
        title="确定终止当前任务？"
        message="NoNo 会停止后续操作；已经在其他应用中完成的操作无法自动撤销。"
        confirmText="确认终止"
        cancelText="取消"
        onConfirm={confirmStopTask}
        onCancel={() => setStopConfirmVisible(false)}
        danger
      />
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 120,
  },
  greetingSection: {
    paddingTop: 10,
  },
  greetingTitle: {
    maxWidth: 310,
    fontSize: 31,
    fontWeight: '800',
    color: COLORS.text.primary,
    lineHeight: 34,
    letterSpacing: -1,
  },
  greetingSubtitle: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.text.secondary,
  },
  sectionHeading: {
    marginTop: 24,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  sectionHint: {
    fontSize: 10,
    color: COLORS.text.secondary,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickTask: {
    width: '48%',
    minHeight: 86,
    padding: 14,
    overflow: 'hidden',
    borderRadius: 19,
  },
  quickTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  quickBody: {
    marginTop: 7,
    fontSize: 10,
    color: '#676a78',
  },
});

