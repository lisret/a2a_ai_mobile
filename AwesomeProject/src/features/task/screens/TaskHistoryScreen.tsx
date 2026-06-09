/**
 * 任务历史页面（重构版）
 * 使用新创建的组件和 Hooks
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Animated,
  AppState,
  AppStateStatus,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@shared/types/navigation';
import { modelService } from '@features/model/services/ModelService';
import { settingsService } from '@features/settings/services/SettingsService';
import { accessibilityService, appMappingService, floatingWindowService } from '@core/ability';
import { useTaskHistory } from '../hooks/useTaskHistory';
import { useTaskExecution } from '../hooks/useTaskExecution';
import { useTaskExecutionWithBackground } from '../useTaskExecutionWithBackground';
import { AppIcon, IconNames } from '@shared/components/Icon';
import { ConfirmModal } from '@shared/components/ConfirmModal';
import { ChatMessage } from '../components/ChatMessage';
import { TaskStepItem } from '../components/TaskStepItem';
import { HistoryPanel } from '../components/HistoryPanel';
import { TaskStatusBadge } from '../components/TaskStatusBadge';
import { UI_CONFIG, COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '@shared/constants';
import { Platform } from 'react-native';
import { PageLayout } from '@shared/components/PageLayout';
import { getTaskTitle } from '@shared/utils/taskHelpers';
import type { Task, TaskAction } from '@core/engine/taskEngine';
import type { AIModel } from '@shared/types/Model';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropType = RouteProp<RootStackParamList, 'TaskHistory'>;

export const TaskHistoryScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutePropType>();
  const { modelId } = route.params;

  const [model, setModel] = useState<AIModel | null>(null);
  const [historyPanelVisible, setHistoryPanelVisible] = useState(false);
  const [newTaskInput, setNewTaskInput] = useState('');
  const [modelMessages, setModelMessages] = useState<Array<{ step: number; content: string; timestamp: number }>>([]);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [showInput, setShowInput] = useState(true); // 控制输入框显示
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const chatScrollViewRef = useRef<ScrollView>(null);
  const historyPanelAnim = useRef(new Animated.Value(0)).current;
  const shouldAutoSelectTaskRef = useRef(true);

  // 使用 Hooks
  const {
    tasks,
    selectedTask: taskHistorySelectedTask,
    refreshing,
    deleteTaskId,
    setDeleteTaskId,
    loadTasks,
    refresh,
    selectTask,
    deleteTask,
    deleteAllTasks,
  } = useTaskHistory({
    modelId,
    autoSelectLatest: shouldAutoSelectTaskRef.current,
  });

  // 本地状态管理选中的任务（用于控制展开步骤等）
  const [selectedTask, setSelectedTask] = useState<Task | null>(taskHistorySelectedTask);

  // 同步 taskHistorySelectedTask 到本地状态
  useEffect(() => {
    setSelectedTask(taskHistorySelectedTask);
    // 如果选择的是已完成的任务，隐藏输入框
    if (taskHistorySelectedTask && (taskHistorySelectedTask.status === 'success' || taskHistorySelectedTask.status === 'failed')) {
      setShowInput(false);
    }
    if (taskHistorySelectedTask?.output?.steps && taskHistorySelectedTask.output.steps.length > 0) {
      const lastStep = taskHistorySelectedTask.output.steps[taskHistorySelectedTask.output.steps.length - 1];
      setExpandedSteps(new Set([lastStep.step]));
    }
  }, [taskHistorySelectedTask]);

  // 执行状态（统一管理前台和后台任务）
  const [executing, setExecuting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentInstruction, setCurrentInstruction] = useState<string>('');

  // 任务执行 Hook（仅用于前台执行）
  const {
    executing: foregroundExecuting,
    currentStep: foregroundStep,
    currentInstruction: foregroundInstruction,
    executeTask: executeTaskForeground,
    cancelTask,
  } = useTaskExecution({
    model,
    onTaskStart: async (taskId) => {
      await loadTasks();
    },
    onTaskComplete: async (task) => {
      await loadTasks();
      if (task.output?.steps && task.output.steps.length > 0) {
        const lastStep = task.output.steps[task.output.steps.length - 1];
        setExpandedSteps(new Set([lastStep.step]));
      }

      // 显示任务完成 Toast 提示（手机屏幕提示窗）
      try {
        const userCommand = task.instruction || '任务执行完成';
        await accessibilityService.showToast(`任务完成：${userCommand}`, 'long');
      } catch (error) {
        console.warn('显示任务完成 Toast 失败:', error);
      }
    },
    onTaskFailed: (error, isCancelled) => {
      Alert.alert(isCancelled ? '任务已中断' : '执行失败', error);
    },
    onStepUpdate: (step, action, modelResponse) => {
      // 步骤更新处理
    },
    onStreamUpdate: (step, content) => {
      setModelMessages(prev => {
        const updated = [...prev];
        const index = updated.findIndex(msg => msg.step === step);
        if (index >= 0) {
          updated[index] = { ...updated[index], content };
        } else {
          updated.push({ step, content, timestamp: Date.now() });
        }
        return updated;
      });
    },
  });

  // 同步前台执行状态到统一状态
  useEffect(() => {
    if (foregroundExecuting) {
      setExecuting(true);
      setShowInput(true); // 任务开始时显示输入框
      setCurrentStep(foregroundStep);
      setCurrentInstruction(foregroundInstruction);
    } else if (!foregroundExecuting && selectedTask && !executing) {
      // 前台任务结束且没有选中任务在执行，隐藏输入框
      setShowInput(false);
    }
  }, [foregroundExecuting, foregroundStep, foregroundInstruction, selectedTask, executing]);

  // 后台任务执行 Hook
  const { startBackgroundTask } = useTaskExecutionWithBackground({
    model,
    onTaskStart: async (taskId) => {
      setExecuting(true);
      setShowInput(true); // 任务开始时显示输入框
      await loadTasks();
    },
    onTaskComplete: async (task) => {
      setExecuting(false);
      setShowInput(false); // 任务结束后隐藏输入框
      await loadTasks();
      if (task.output?.steps && task.output.steps.length > 0) {
        const lastStep = task.output.steps[task.output.steps.length - 1];
        setExpandedSteps(new Set([lastStep.step]));
      }
      setSelectedTask(task);

      // 显示任务完成 Toast 提示（手机屏幕提示窗）
      try {
        const userCommand = task.instruction || '任务执行完成';
        await accessibilityService.showToast(`任务完成：${userCommand}`, 'long');
      } catch (error) {
        console.warn('显示任务完成 Toast 失败:', error);
      }
    },
    onTaskFailed: (error, isCancelled) => {
      setExecuting(false);
      setShowInput(false); // 任务结束后隐藏输入框
      Alert.alert(isCancelled ? '任务已中断' : '执行失败', error);
    },
  });

  // 加载模型信息
  useEffect(() => {
    const loadModel = async () => {
      try {
        const modelData = await modelService.getModelById(modelId);
        setModel(modelData);
      } catch (error) {
        console.error('加载模型信息失败:', error);
      }
    };
    loadModel();
  }, [modelId]);

  // 预加载应用映射表（在新建对话时提前获取，避免执行任务时耗时）
  useEffect(() => {
    const preloadAppMapping = async () => {
      try {
        const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();
        if (adbFallbackEnabled) {
          console.info('[任务历史] 开始预加载应用映射表...');
          // 异步预加载，不阻塞UI
          appMappingService.getAppMapping().catch(error => {
            console.warn('[任务历史] 预加载应用映射表失败（不影响使用）:', error);
          });
        }
      } catch (error) {
        console.warn('[任务历史] 检查ADB设置失败:', error);
      }
    };
    preloadAppMapping();
  }, []); // 组件加载时执行一次

  // 监听导航焦点，重新加载数据
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadTasks();
    });
    return unsubscribe;
  }, [navigation, loadTasks]);

  // 历史面板动画
  useEffect(() => {
    Animated.timing(historyPanelAnim, {
      toValue: historyPanelVisible ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [historyPanelVisible, historyPanelAnim]);

  // 监听后台任务事件（Headless JS）
  useEffect(() => {
    const { DeviceEventEmitter } = require('react-native');

    // 任务开始
    const taskStartedSub = DeviceEventEmitter.addListener('TaskStarted', (data: { taskId: string; step: number; instruction: string }) => {
      console.info('[任务执行] Headless JS 任务开始:', data);
      if (data.taskId) {
        setExecuting(true);
        setCurrentStep(data.step);
        setCurrentInstruction(data.instruction);
        setModelMessages([]);
        setSelectedTask(null);
      }
    });

    // 步骤开始
    const stepStartedSub = DeviceEventEmitter.addListener('TaskStepStarted', (data: { taskId: string; step: number; maxSteps: number }) => {
      console.info('[任务执行] 步骤开始:', data);
      setCurrentStep(data.step);
    });

    // 流式更新
    const streamUpdateSub = DeviceEventEmitter.addListener('TaskStreamUpdate', (data: { taskId: string; step: number; content: string }) => {
      setModelMessages(prev => {
        const updated = [...prev];
        const index = updated.findIndex(msg => msg.step === data.step);
        if (index >= 0) {
          updated[index] = { ...updated[index], content: data.content };
        } else {
          updated.push({ step: data.step, content: data.content, timestamp: Date.now() });
        }
        return updated;
      });
    });

    // 模型响应
    const modelResponseSub = DeviceEventEmitter.addListener('TaskModelResponse', (data: { taskId: string; step: number; response: string }) => {
      setModelMessages(prev => {
        const updated = [...prev];
        const index = updated.findIndex(msg => msg.step === data.step);
        if (index >= 0) {
          updated[index] = { ...updated[index], content: data.response };
        } else {
          updated.push({ step: data.step, content: data.response, timestamp: Date.now() });
        }
        return updated;
      });
    });

    // 步骤完成
    const stepCompletedSub = DeviceEventEmitter.addListener('TaskStepCompleted', async (data: { taskId: string; step: number; action: string }) => {
      await loadTasks();
    });

    // 任务完成
    const taskCompletedSub = DeviceEventEmitter.addListener('TaskCompleted', async (data: { taskId: string; step: number; task: Task }) => {
      setExecuting(false);
      setCurrentStep(0);
      setShowInput(false); // 任务结束后隐藏输入框
      await loadTasks();
      if (data.task) {
        setSelectedTask(data.task);
        if (data.task.output?.steps && data.task.output.steps.length > 0) {
          const lastStep = data.task.output.steps[data.task.output.steps.length - 1];
          setExpandedSteps(new Set([lastStep.step]));
        }

        // 显示任务完成 Toast 提示（手机屏幕提示窗）
        try {
          const userCommand = data.task.instruction || '任务执行完成';
          await accessibilityService.showToast(`任务完成：${userCommand}`, 'long');
        } catch (error) {
          console.warn('显示任务完成 Toast 失败:', error);
        }
      }
    });

    // 任务失败
    const taskFailedSub = DeviceEventEmitter.addListener('TaskFailed', async (data: { taskId: string; error: string; isCancelled?: boolean; task?: Task }) => {
      setExecuting(false);
      setCurrentStep(0);
      setShowInput(false); // 任务结束后隐藏输入框
      await loadTasks();

      // 如果有任务数据，自动选择并显示
      if (data.task) {
        setSelectedTask(data.task);
        if (data.task.output?.steps && data.task.output.steps.length > 0) {
          const lastStep = data.task.output.steps[data.task.output.steps.length - 1];
          setExpandedSteps(new Set([lastStep.step]));
        }
      }

      if (data.isCancelled) {
        // 中断时不显示弹窗，直接显示任务记录（包含已执行的步骤）
        console.info('[任务中断] 任务已中断，已保存的步骤数:', data.task?.output?.steps?.length || 0);
      } else {
        Alert.alert('执行失败', data.error);
      }
    });

    return () => {
      taskStartedSub.remove();
      stepStartedSub.remove();
      streamUpdateSub.remove();
      modelResponseSub.remove();
      stepCompletedSub.remove();
      taskCompletedSub.remove();
      taskFailedSub.remove();
    };
  }, [loadTasks]);

  // 监听 AppState 变化，控制悬浮窗显示
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      const previousAppState = appStateRef.current;
      appStateRef.current = nextAppState;

      if (nextAppState === 'background' && executing) {
        // 暂时禁用悬浮窗显示
        // try {
        //   // 强制后台运行，始终显示悬浮窗
        //   const hasOverlayPermission = await floatingWindowService.canDrawOverlays();
        //   if (hasOverlayPermission) {
        //     await floatingWindowService.showFloatingWindow(`任务执行中...\n步骤: ${currentStep}/50`);
        //   }
        // } catch (error) {
        //   console.warn('[AppState] 显示悬浮窗失败:', error);
        // }
      }

      if (nextAppState === 'active' && previousAppState === 'background') {
        try {
          await floatingWindowService.hideFloatingWindow();
        } catch (error) {
          console.warn('[AppState] 隐藏悬浮窗失败:', error);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [executing, currentStep]);

  // 监听任务中断事件（从通知按钮触发）
  useEffect(() => {
    const { DeviceEventEmitter } = require('react-native');
    const subscription = DeviceEventEmitter.addListener('TaskCancelRequested', () => {
      console.info('[任务执行] 收到任务中断请求（来自通知按钮）');
      if (executing) {
        cancelTask();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [executing, cancelTask]);

  // 处理任务选择
  const handleTaskPress = (task: Task) => {
    shouldAutoSelectTaskRef.current = true;
    selectTask(task);
    setSelectedTask(task);
    // 选择已完成的任务时，隐藏输入框
    if (task.status === 'success' || task.status === 'failed') {
      setShowInput(false);
    }
    if (task.output?.steps && task.output.steps.length > 0) {
      const lastStep = task.output.steps[task.output.steps.length - 1];
      setExpandedSteps(new Set([lastStep.step]));
    } else {
      setExpandedSteps(new Set());
    }
    toggleHistoryPanel();
  };

  // 处理新建任务
  const handleNewTask = async () => {
    const instruction = newTaskInput.trim();
    if (!instruction) {
      return;
    }

    if (!model) {
      Alert.alert('提示', '模型信息加载失败');
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

    // 预加载应用映射表（新建任务时提前获取，作为双重保障）
    try {
      const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();
      if (adbFallbackEnabled) {
        console.info('[任务历史] 新建任务时预加载应用映射表...');
        // 异步预加载，不阻塞任务执行
        appMappingService.getAppMapping().catch(error => {
          console.warn('[任务历史] 预加载应用映射表失败（不影响任务执行）:', error);
        });
      }
    } catch (error) {
      console.warn('[任务历史] 预加载应用映射表失败:', error);
    }

    // 强制后台运行
    try {
      // 设置执行状态
      setExecuting(true);
      setShowInput(true); // 开始新任务时显示输入框
      setCurrentInstruction(instruction);
      setModelMessages([]);
      setSelectedTask(null);

      await startBackgroundTask(instruction);
      setNewTaskInput('');
    } catch (error) {
      console.error('启动后台任务失败，回退到前台执行:', error);
      setExecuting(false);
      await executeTaskForeground(instruction);
      setNewTaskInput('');
    }
  };

  // 处理新建对话按钮
  const handleNewTaskFromButton = async () => {
    shouldAutoSelectTaskRef.current = false;
    setNewTaskInput('');
    selectTask(null);
    setSelectedTask(null);
    setModelMessages([]);
    setShowInput(true); // 点击新建对话后显示输入框
    if (historyPanelVisible) {
      toggleHistoryPanel();
    }

    // 预加载应用映射表（新建对话时提前获取）
    try {
      const adbFallbackEnabled = await settingsService.getADBFallbackEnabled();
      if (adbFallbackEnabled) {
        console.info('[任务历史] 新建对话时预加载应用映射表...');
        // 异步预加载，不阻塞UI
        appMappingService.getAppMapping().catch(error => {
          console.warn('[任务历史] 预加载应用映射表失败（不影响使用）:', error);
        });
      }
    } catch (error) {
      console.warn('[任务历史] 预加载应用映射表失败:', error);
    }
  };

  // 切换历史面板
  const toggleHistoryPanel = () => {
    setHistoryPanelVisible(!historyPanelVisible);
  };

  // 处理删除任务
  const handleDeleteTask = (task: Task) => {
    setDeleteTaskId(task.id);
  };

  // 确认删除任务
  const confirmDeleteTask = async () => {
    if (!deleteTaskId) return;
    try {
      await deleteTask(deleteTaskId);
      setDeleteTaskId(null);
    } catch (error) {
      Alert.alert('删除失败', '删除任务时发生错误');
      setDeleteTaskId(null);
    }
  };

  // 处理删除所有任务
  const handleDeleteAll = () => {
    setShowDeleteAllConfirm(true);
  };

  // 确认删除所有任务
  const confirmDeleteAll = async () => {
    try {
      await deleteAllTasks();
      setShowDeleteAllConfirm(false);
      setSelectedTask(null);
      Alert.alert('成功', '已删除所有任务记录');
    } catch (error) {
      Alert.alert('删除失败', '删除所有任务时发生错误');
      setShowDeleteAllConfirm(false);
    }
  };

  // 切换步骤展开/收起
  const toggleStepExpand = (step: number) => {
    setExpandedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(step)) {
        newSet.delete(step);
      } else {
        newSet.add(step);
      }
      return newSet;
    });
  };

  // 处理中断任务
  const handleCancelTask = async () => {
    if (!executing) {
      return;
    }

    Alert.alert(
      '确认中断',
      '确定要中断当前任务吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          style: 'destructive',
          onPress: async () => {
            try {
              // 发送中断事件到后台任务
              const { DeviceEventEmitter } = require('react-native');
              DeviceEventEmitter.emit('TaskCancelRequested', { taskId: 'current' });

              // 停止后台服务（强制后台运行，始终执行）
              try {
                await accessibilityService.stopTaskExecutionService();
                await accessibilityService.releaseWakeLock();
                await floatingWindowService.hideFloatingWindow();
              } catch (error) {
                console.warn('[任务中断] 停止后台运行功能失败:', error);
              }

              // 调用前台任务的取消方法（如果有）
              cancelTask();

              // 更新状态
              setExecuting(false);
              setCurrentStep(0);
              setCurrentInstruction('');

              console.info('[任务中断] 任务中断请求已发送');
            } catch (error) {
              console.error('[任务中断] 中断任务失败:', error);
              Alert.alert('错误', '中断任务时发生错误');
            }
          },
        },
      ]
    );
  };

  // 构建右侧操作按钮
  const rightAction = (
    <>
      {selectedTask && (
        <TouchableOpacity style={styles.navBtn} onPress={handleNewTaskFromButton}>
          <AppIcon name={IconNames.plus} size={20} color="#FFFFFF" />
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.navBtn} onPress={toggleHistoryPanel}>
        <AppIcon name={IconNames.menu} size={20} color="#FFFFFF" />
      </TouchableOpacity>
    </>
  );

  return (
    <PageLayout
      title={selectedTask ? getTaskTitle(selectedTask) : model?.name || '新对话'}
      showBackButton
      rightAction={rightAction}
      backgroundColor={COLORS.background.default}>
      <View style={styles.container}>

        {/* 历史任务侧边面板 */}
        <HistoryPanel
          tasks={tasks}
          selectedTask={selectedTask}
          refreshing={refreshing}
          panelVisible={historyPanelVisible}
          panelAnim={historyPanelAnim}
          panelWidth={UI_CONFIG.HISTORY_PANEL_WIDTH}
          onTaskPress={handleTaskPress}
          onDeleteTask={handleDeleteTask}
          onDeleteAll={handleDeleteAll}
          onRefresh={refresh}
          onClose={toggleHistoryPanel}
        />

        {/* 对话内容区 */}
        <ScrollView
          ref={chatScrollViewRef}
          style={styles.chatContainer}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={true}>
          {(selectedTask || executing) ? (
            <>
              {/* 用户消息：任务指令 */}
              <ChatMessage
                content={executing && !selectedTask ? currentInstruction : selectedTask?.instruction || ''}
                timestamp={selectedTask?.createdAt || Date.now()}
                isUser={true}
              />

              {/* 执行中的模型回复消息 */}
              {executing && modelMessages.map((msg, index) => (
                <ChatMessage
                  key={`exec-${index}`}
                  content={msg.content}
                  timestamp={msg.timestamp}
                  isUser={false}
                />
              ))}

              {/* 已完成任务的AI消息：执行结果 */}
              {selectedTask && !executing && (
                <View style={styles.aiMessageContainer}>
                  <View style={styles.aiAvatar}>
                    <AppIcon name={IconNames.robot} size={18} color="#2563eb" />
                  </View>
                  <View style={styles.aiMessageContent}>
                    <View style={styles.statusRow}>
                      <TaskStatusBadge status={selectedTask.status} />
                      <Text style={styles.messageTime}>
                        {new Date(selectedTask.createdAt).toLocaleString('zh-CN')}
                      </Text>
                    </View>

                    {selectedTask.error && (
                      <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{selectedTask.error}</Text>
                      </View>
                    )}

                    {/* 显示每个步骤 */}
                    {selectedTask.output?.steps && selectedTask.output.steps.length > 0 && (
                      <View style={styles.stepsContainer}>
                        {selectedTask.output.steps.map((step, index) => (
                          <TaskStepItem
                            key={index}
                            step={step}
                            isExpanded={expandedSteps.has(step.step)}
                            onToggleExpand={() => toggleStepExpand(step.step)}
                          />
                        ))}
                      </View>
                    )}

                    {!selectedTask.output?.steps || selectedTask.output.steps.length === 0 ? (
                      <Text style={styles.noStepsText}>任务尚未开始执行</Text>
                    ) : null}

                    {selectedTask.status === 'success' && (
                      <View style={styles.successContainer}>
                        <AppIcon name={IconNames.success} size={16} color={COLORS.success} />
                        <Text style={styles.successText}>任务执行完成</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </>
          ) : (
            <View style={styles.emptyTip}>
              <AppIcon name={IconNames.chat} size={48} color="#86868b" style={{ opacity: 0.5, marginBottom: 16 }} />
              <Text style={styles.emptyTipText}>开始你的第一次任务吧</Text>
            </View>
          )}
        </ScrollView>

        {/* 执行状态提示 */}
        {executing && (
          <View style={styles.executionStatus}>
            <ActivityIndicator size="small" color="#2563eb" />
            <Text style={styles.executionStatusText}>
              正在执行任务... 步骤 {currentStep}
            </Text>
            <TouchableOpacity
              style={styles.cancelTaskButton}
              onPress={handleCancelTask}
              activeOpacity={0.7}>
              <Text style={styles.cancelTaskButtonText}>中断</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 输入区 - 只在显示时渲染 */}
        {showInput && (
          <View style={styles.inputArea}>
            <View style={styles.inputBox}>
              <TextInput
                style={styles.input}
                placeholder="输入任务指令..."
                value={newTaskInput}
                onChangeText={setNewTaskInput}
                multiline
                maxLength={UI_CONFIG.INPUT_MAX_LENGTH}
                textAlignVertical="top"
                placeholderTextColor="#9ca3af"
                onSubmitEditing={handleNewTask}
                blurOnSubmit={false}
                editable={!executing}
              />
            </View>
            <TouchableOpacity
              style={[styles.sendBtn, (!newTaskInput.trim() || executing) && styles.sendBtnDisabled]}
              onPress={handleNewTask}
              disabled={!newTaskInput.trim() || executing}>
              {executing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <AppIcon name={IconNames.send} size={16} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* 删除确认弹窗 */}
        <ConfirmModal
          visible={deleteTaskId !== null}
          title="删除任务"
          message="确定要删除这条任务记录吗？删除后无法恢复。"
          confirmText="删除"
          cancelText="取消"
          danger={true}
          onConfirm={confirmDeleteTask}
          onCancel={() => setDeleteTaskId(null)}
        />

        {/* 删除所有任务确认弹窗 */}
        <ConfirmModal
          visible={showDeleteAllConfirm}
          title="删除所有任务"
          message={`确定要删除所有任务记录吗？共 ${tasks.length} 条记录，删除后无法恢复。`}
          confirmText="确定删除"
          cancelText="取消"
          danger={true}
          onConfirm={confirmDeleteAll}
          onCancel={() => setShowDeleteAllConfirm(false)}
        />
      </View>
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  chatContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  chatContent: {
    padding: 16,
    paddingBottom: 80,
    flexGrow: 1,
  },
  aiMessageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  aiAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e5e5e5',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiMessageContent: {
    maxWidth: UI_CONFIG.CHAT_MESSAGE_MAX_WIDTH,
    padding: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  messageTime: {
    fontSize: 11,
    color: '#86868b',
  },
  errorBox: {
    padding: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    lineHeight: 18,
  },
  stepsContainer: {
    marginTop: 8,
  },
  noStepsText: {
    fontSize: 13,
    color: '#86868b',
    fontStyle: 'italic',
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  successText: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '500',
  },
  emptyTip: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 400,
  },
  emptyTipText: {
    fontSize: 14,
    color: '#86868b',
  },
  inputArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    minHeight: 48,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  inputBox: {
    flex: 1,
    marginRight: 8,
    justifyContent: 'center',
  },
  input: {
    minHeight: 32,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    fontSize: 14,
    backgroundColor: '#f9fafb',
    color: '#111827',
    lineHeight: 20,
    textAlignVertical: 'center',
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#165DFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendBtnDisabled: {
    backgroundColor: '#d1d5db',
    opacity: 0.5,
  },
  executionStatus: {
    position: 'absolute',
    bottom: 60,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    gap: 8,
  },
  executionStatusText: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '500',
    flex: 1,
  },
  cancelTaskButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#dc2626',
    borderRadius: 6,
  },
  cancelTaskButtonText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
});
