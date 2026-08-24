import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';
import {ConfirmModal} from '@shared/components/ConfirmModal';
import {PageLayout} from '@shared/components/PageLayout';
import {showCustomAlert} from '@shared/utils/alert';
import {ExecutionCard} from '../components/ExecutionCard';
import {useTaskExecution} from '../hooks/useTaskExecution';
import {useTaskExecutionWithBackground} from '../useTaskExecutionWithBackground';
import {modelService} from '@features/model/services/ModelService';
import {settingsService} from '@features/settings/services/SettingsService';
import {
  accessibilityService,
  appMappingService,
  floatingWindowService,
} from '@core/ability';
import {taskHistoryService} from '../services/TaskHistoryService';
import {COLORS} from '@shared/constants';
import type {NoNoMood} from '@shared/components/NoNoMascot';
import {NonoAvatar3D} from '../components/NonoAvatar3D';
import {nonoConfigService} from '@features/capability/services/NonoConfigService';
import type {CapabilityFlags, MemoryItem} from '@features/capability/types';
import type {AIModel} from '@shared/types/Model';
import type {Task, TaskStep} from '@core/engine/taskEngine';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type HeardTurn = {
  text: string;
  intent: 'operate' | 'preference' | 'errand';
  citePref?: boolean;
  proposal?: {
    kind: 'preference' | 'errand';
    title: string;
    body?: string;
    errandType?: 'once' | 'schedule';
    when?: string;
  };
};

const DEMO_TURNS: HeardTurn[] = [
  {
    text: '帮我查找附近评分高的咖啡店',
    intent: 'operate',
    citePref: true,
  },
  {
    text: '以后点奶茶也少糖',
    intent: 'preference',
    proposal: {
      kind: 'preference',
      title: '奶茶少糖',
      body: '点奶茶时默认少糖',
    },
  },
  {
    text: '每周五下班前提醒我交周报',
    intent: 'errand',
    proposal: {
      kind: 'errand',
      errandType: 'schedule',
      title: '每周五下班前提醒交周报',
      when: '周五 18:00',
    },
  },
];

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

  const [model, setModel] = useState<AIModel | null>(null);
  const [taskInput, setTaskInput] = useState('');
  const [executing, setExecuting] = useState(false);
  const [executionSteps, setExecutionSteps] = useState<TaskStep[]>([]);
  const [currentStep, setCurrentStep] = useState<number | undefined>(undefined);
  const [stopConfirmVisible, setStopConfirmVisible] = useState(false);
  const [companion, setCompanion] = useState<AIModel | null>(null);
  const [flags, setFlags] = useState<CapabilityFlags | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<HeardTurn | null>(null);
  const listenTurn = useRef(0);
  const listenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const [operate, nextCompanion, nextFlags, nextMemories] =
        await Promise.all([
          modelService.getSelectedModel(),
          modelService.getSelectedModel('companion'),
          nonoConfigService.getCapabilities(),
          nonoConfigService.getMemories(),
        ]);
      setModel(operate);
      setCompanion(nextCompanion);
      setFlags(nextFlags);
      setMemories(nextMemories);
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

  useEffect(() => {
    return () => {
      if (listenTimer.current) {
        clearTimeout(listenTimer.current);
      }
    };
  }, []);

  const handleStartTask = async (instructionText?: string) => {
    const instruction = (instructionText ?? taskInput).trim();
    if (!instruction) {
      Alert.alert('提示', '请输入任务指令');
      return;
    }

    if (!flags?.phoneOperate && !flags?.openclaw) {
      Alert.alert('要操作手机，请先打开「替我操作手机」或 OpenClaw');
      navigation.navigate('MainTabs', {screen: 'Capabilities'});
      return;
    }

    if (!model) {
      Alert.alert('提示', '请先选择一个模型');
      (navigation as any).navigate('PhoneOperate');
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
      setTaskInput(instruction);
      setHeard(null);
      await startBackgroundTask(instruction);
    } catch (error) {
      console.error('启动后台任务失败，回退到前台执行:', error);
      await executeTaskForeground(instruction);
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
        // Home 尚未跟踪当前会话 identity（operate 接线在 Task 8）；缺少精确
        // {taskId, sessionRevision} 时按 fail-closed 跳过原生停止，避免误停其它会话。
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

  const startVoiceListen = () => {
    if (executing || listening) return;
    if (!companion) {
      showCustomAlert('请先配置陪伴模型', '首页说话用设置里的对话模型。', [
        {text: '取消', style: 'cancel'},
        {
          text: '去设置',
          onPress: () => navigation.navigate('CompanionConfig'),
        },
      ]);
      return;
    }
    setHeard(null);
    setListening(true);
    if (listenTimer.current) clearTimeout(listenTimer.current);
    listenTimer.current = setTimeout(() => {
      const turn = DEMO_TURNS[listenTurn.current % DEMO_TURNS.length];
      listenTurn.current += 1;
      setListening(false);
      setHeard(turn);
    }, 2600);
  };

  const coffeePref =
    memories.find(
      item => item.kind === 'preference' && item.title.includes('咖啡'),
    ) || memories.find(item => item.kind === 'preference');

  const recallParts: string[] = [];
  const pref = memories.find(item => item.kind === 'preference');
  if (pref) recallParts.push(pref.title);
  if (flags?.errands) {
    const errand =
      memories.find(
        item => item.kind === 'errand' && item.errandType === 'schedule',
      ) || memories.find(item => item.kind === 'errand');
    if (errand) recallParts.push(errand.title);
  }
  const recall = recallParts.slice(0, 2).join(' · ');

  const acceptHeard = async () => {
    if (!heard?.proposal) return;
    if (heard.intent === 'preference') {
      const exists = memories.some(
        item =>
          item.kind === 'preference' && item.title === heard.proposal?.title,
      );
      if (!exists && heard.proposal) {
        await nonoConfigService.addMemory({
          id: `mem-${Date.now()}`,
          kind: 'preference',
          title: heard.proposal.title,
          body: heard.proposal.body,
        });
        setMemories(await nonoConfigService.getMemories());
      }
    } else if (heard.intent === 'errand') {
      if (!flags?.errands) {
        Alert.alert('先在能力里打开「交代的事」');
        navigation.navigate('Errands');
        return;
      }
      const exists = memories.some(
        item => item.kind === 'errand' && item.title === heard.proposal?.title,
      );
      if (!exists && heard.proposal) {
        await nonoConfigService.addMemory({
          id: `mem-${Date.now()}`,
          kind: 'errand',
          errandType: heard.proposal.errandType || 'once',
          title: heard.proposal.title,
          when: heard.proposal.when || '',
        });
        setMemories(await nonoConfigService.getMemories());
      }
    }
    setHeard(null);
  };

  const saveHeardErrand = async () => {
    if (!heard) return;
    if (!flags?.errands) {
      Alert.alert('先在能力里打开「交代的事」');
      navigation.navigate('Errands');
      return;
    }
    await nonoConfigService.addMemory({
      id: `mem-${Date.now()}`,
      kind: 'errand',
      errandType: 'once',
      title: heard.text,
      when: '',
    });
    setMemories(await nonoConfigService.getMemories());
    setHeard(null);
  };

  const mascotMood: NoNoMood = executing
    ? 'thinking'
    : listening
    ? 'listen'
    : 'idle'; // stage idle / listen / operate


  if (executing) {
    return (
      <PageLayout
        title="任务执行"
        kicker="LIVE TASK"
        backgroundColor={COLORS.background.default}>
        <View style={styles.console}>
          <ExecutionCard
            instruction={taskInput || '执行中...'}
            steps={executionSteps}
            currentStep={currentStep}
            onStop={handleStopTask}
          />
        </View>
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
  }

  return (
    <View style={styles.stage}>
      {Platform.OS === 'android' ? (
        <StatusBar
          barStyle="dark-content"
          backgroundColor="transparent"
          translucent
        />
      ) : (
        <StatusBar barStyle="dark-content" />
      )}
      <View style={styles.topDock}>
        <Text style={styles.topDockText}>
          陪伴 · {companion?.name || '未配置陪伴模型'}
        </Text>
      </View>
      <View style={styles.avatarWrap}>
        <NonoAvatar3D mood={mascotMood} />
        <TouchableOpacity
          style={styles.avatarHit}
          activeOpacity={0.92}
          onPress={startVoiceListen}
          accessibilityLabel="和 NoNo 说话"
        />
      </View>
      {listening ? (
        <View style={[styles.bottomDock, styles.mintDock, styles.dockFloat]}>
          <Text style={styles.dockKicker}>正在听</Text>
          <Text style={styles.dockBody}>说完我会自己停，不用点结束</Text>
        </View>
      ) : heard ? (
        <View style={styles.heardStack}>
          <View style={[styles.bottomDock, styles.mintDock]}>
            <Text style={styles.dockKicker}>
              {heard.intent === 'preference'
                ? '要不要记住'
                : heard.intent === 'errand'
                ? '要不要交代'
                : heard.citePref && coffeePref
                ? `我记得你${coffeePref.title}`
                : '我听到了'}
            </Text>
            <Text style={styles.dockBody}>
              {heard.intent === 'operate'
                ? coffeePref
                  ? `按你「${coffeePref.title}」的习惯，帮你找附近评分高的店`
                  : '帮你找附近评分高的咖啡店'
                : heard.intent === 'errand'
                ? `${heard.proposal?.title} · ${heard.proposal?.when}`
                : heard.proposal?.title || heard.text}
            </Text>
          </View>
          <View style={styles.actions}>
            {heard.intent === 'operate' ? (
              <>
                {(flags?.phoneOperate && model) || flags?.openclaw ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionMint]}
                    onPress={() => handleStartTask(heard.text)}>
                    <Text style={styles.actionText}>开始操作</Text>
                  </TouchableOpacity>
                ) : null}
                {flags?.errands ? (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={saveHeardErrand}>
                    <Text style={styles.actionText}>记成交代</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => setHeard(null)}>
                  <Text style={styles.actionText}>先不用</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionMint]}
                  onPress={acceptHeard}>
                  <Text style={styles.actionText}>
                    {heard.intent === 'errand' ? '记成交代' : '记住这条'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => setHeard(null)}>
                  <Text style={styles.actionText}>不用</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      ) : (
        <View style={[styles.bottomDock, styles.dockFloat]}>
          <Text style={styles.dockKicker}>点角色开始说</Text>
          <Text style={styles.dockBody}>
            {recall ? `还记得 ${recall}` : '说完我会自己停'}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    backgroundColor: COLORS.pearl,
  },
  console: {
    paddingHorizontal: 18,
    paddingBottom: 120,
  },
  topDock: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 56,
    right: 14,
    zIndex: 2,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  topDockText: {
    color: COLORS.text.primary,
    fontSize: 10,
    fontWeight: '800',
  },
  avatarWrap: {
    flex: 1,
    position: 'relative',
    paddingBottom: 96,
  },
  avatarHit: {
    position: 'absolute',
    left: '28%',
    right: '28%',
    top: '28%',
    bottom: '30%',
  },
  bottomDock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  dockFloat: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 108,
  },
  mintDock: {
    backgroundColor: 'rgba(141,244,226,0.88)',
  },
  dockKicker: {
    marginBottom: 3,
    color: COLORS.text.secondary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  dockBody: {
    color: COLORS.text.primary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  heardStack: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 108,
    gap: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  actionMint: {
    backgroundColor: 'rgba(141,244,226,0.92)',
  },
  actionText: {
    color: COLORS.text.primary,
    fontSize: 11,
    fontWeight: '700',
  },
});
