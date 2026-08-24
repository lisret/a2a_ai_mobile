import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {COLORS} from '@shared/constants';
import {ConfirmModal} from '@shared/components/ConfirmModal';
import {showCustomAlert} from '@shared/utils/alert';
import type {NoNoMood} from '@shared/components/NoNoMascot';
import {NonoAvatar3D} from '../components/NonoAvatar3D';
import {useAppFacades} from '../../../application/facades/AppFacadesContext';
import type {
  CompanionViewState,
  OperateTaskViewState,
  TaskUiEvent,
  Unsubscribe,
} from '../../../application/facades/UiRuntimeContracts';

// Home owns no business state. It renders exactly two Facade view states —
// `CompanionViewState` and `OperateTaskViewState` — plus a little pure
// presentation state (stop-confirm modal, the fixed dictation-unavailable
// notice, and the active task subscription cleanup). There are no demo turns:
// a transcript only ever exists because the Companion Facade produced a turn,
// and Task 10 will replace the avatar tap with the real `SpeechRouter`.

const IDLE_OPERATE: OperateTaskViewState = {phase: 'idle', steps: []};
const DICTATION_UNAVAILABLE = '听写组件不可用';

const isTerminalPhase = (phase: OperateTaskViewState['phase']): boolean =>
  phase === 'success' || phase === 'failed' || phase === 'cancelled';

export const HomeScreen: React.FC = () => {
  const {companion, operate} = useAppFacades();

  const [companionState, setCompanionState] = useState<CompanionViewState | null>(
    null,
  );
  const [operateState, setOperateState] =
    useState<OperateTaskViewState>(IDLE_OPERATE);
  const [stopConfirmVisible, setStopConfirmVisible] = useState(false);
  const [dictationNotice, setDictationNotice] = useState<string | null>(null);

  const unsubscribeRef = useRef<Unsubscribe | null>(null);

  const applyTaskUiEvent = useCallback((event: TaskUiEvent) => {
    setOperateState(prev => {
      switch (event.type) {
        case 'started':
          return {...prev, phase: 'running', maxSteps: event.maxSteps};
        case 'step_started':
          return {
            ...prev,
            phase: 'running',
            currentStep: event.step,
            maxSteps: event.maxSteps,
          };
        case 'step_completed':
          return {
            ...prev,
            steps: [
              ...prev.steps,
              {
                step: event.step,
                actionLabel: event.actionLabel,
                occurredAtMs: event.occurredAtMs,
              },
            ],
          };
        case 'completed':
          return {...prev, phase: 'success'};
        case 'failed':
          return {
            ...prev,
            phase: event.isCancelled ? 'cancelled' : 'failed',
            errorMessage: event.message,
          };
      }
    });
  }, []);

  // Load both Facade view states once on mount. Home has no navigation coupling:
  // it re-reads only what the Facades expose, never a repository or model store.
  useEffect(() => {
    let active = true;
    Promise.all([companion.getViewState(), operate.getViewState()])
      .then(([nextCompanion, nextOperate]) => {
        if (!active) {
          return;
        }
        setCompanionState(nextCompanion);
        setOperateState(nextOperate);
      })
      .catch(() => {
        // A rejected Facade read leaves Home in its loud idle state rather than
        // fabricating a success; there is no silent fallback graph.
      });
    return () => {
      active = false;
    };
  }, [companion, operate]);

  // Drop the task subscription as soon as the task reaches a terminal phase.
  useEffect(() => {
    if (isTerminalPhase(operateState.phase)) {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    }
  }, [operateState.phase]);

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, []);

  const handleStartOperate = useCallback(
    async (instruction: string) => {
      setDictationNotice(null);
      const result = await operate.start(instruction);
      if (result.kind === 'blocked') {
        setOperateState({phase: 'blocked', steps: [], blocker: result.blocker});
        return;
      }
      setOperateState({
        phase: 'running',
        taskId: result.taskId,
        sessionRevision: result.sessionRevision,
        instruction,
        steps: [],
      });
      unsubscribeRef.current?.();
      unsubscribeRef.current = operate.subscribeTask(
        result.taskId,
        result.sessionRevision,
        applyTaskUiEvent,
      );
    },
    [operate, applyTaskUiEvent],
  );

  const dismissTurn = useCallback(
    (turnId: string) => {
      setCompanionState(prev =>
        prev ? {...prev, turn: undefined} : prev,
      );
      void companion.dismissTurn(turnId);
    },
    [companion],
  );

  const confirmProposal = useCallback(
    (turnId: string) => {
      // One confirm call for both preference and errand proposals. The Companion
      // application port owns the atomic repository write; Home never mints ids,
      // timestamps, or calls `errands.createFromProposal`.
      setCompanionState(prev => (prev ? {...prev, turn: undefined} : prev));
      void companion.confirmProposal(turnId);
    },
    [companion],
  );

  const confirmStopTask = useCallback(async () => {
    setStopConfirmVisible(false);
    const {taskId} = operateState;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    if (taskId) {
      await operate.cancel(taskId);
    }
    setOperateState({phase: 'cancelled', steps: []});
  }, [operate, operateState]);

  const handleAvatarPress = useCallback(() => {
    // Before Task 10 there is no dictation runtime. Never invent a transcript
    // or start a listen timer: either prompt to configure the companion model
    // or show the fixed unavailable notice.
    if (companionState?.phase === 'error') {
      showCustomAlert('请先配置陪伴模型', '首页说话用设置里的对话模型。');
      return;
    }
    setDictationNotice(DICTATION_UNAVAILABLE);
  }, [companionState?.phase]);

  const isRunning =
    operateState.phase === 'running' || operateState.phase === 'starting';

  if (isRunning) {
    const total = Math.max(
      operateState.maxSteps ?? 0,
      operateState.steps.length,
      1,
    );
    const current = Math.min((operateState.currentStep ?? 0) + 1, total);
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
        <ScrollView contentContainerStyle={styles.console}>
          <Text style={styles.runKickerTop}>LIVE TASK</Text>
          <View style={styles.runCard}>
            <Text style={styles.runKicker}>RUNNING</Text>
            <Text style={styles.runTitle} numberOfLines={2}>
              {operateState.instruction || '正在执行'}
            </Text>
            <Text style={styles.runMeta}>
              步骤 {current} / {total}
            </Text>
          </View>
          <View style={styles.timeline}>
            {operateState.steps.map(step => (
              <View key={step.step} style={styles.timelineRow}>
                <Text style={styles.timelineIndex}>{step.step}</Text>
                <Text style={styles.timelineLabel}>{step.actionLabel}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={styles.stopBtn}
            onPress={() => setStopConfirmVisible(true)}>
            <Text style={styles.stopText}>终止</Text>
          </TouchableOpacity>
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
      </View>
    );
  }

  const turn = companionState?.turn;
  const mascotMood: NoNoMood =
    companionState?.phase === 'listening'
      ? 'listen'
      : companionState?.phase === 'thinking'
      ? 'thinking'
      : 'idle';

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
          陪伴 · {companionState?.modelLabel || '未配置陪伴模型'}
        </Text>
      </View>
      <View style={styles.avatarWrap}>
        <NonoAvatar3D mood={mascotMood} />
        <TouchableOpacity
          style={styles.avatarHit}
          activeOpacity={0.92}
          onPress={handleAvatarPress}
          accessibilityLabel="和 NoNo 说话"
        />
      </View>

      {operateState.phase === 'blocked' && operateState.blocker ? (
        <View style={[styles.bottomDock, styles.dockFloat]}>
          <Text style={styles.dockKicker}>暂时不能操作</Text>
          <Text style={styles.dockBody}>{operateState.blocker.message}</Text>
        </View>
      ) : turn ? (
        <View style={styles.heardStack}>
          <View style={[styles.bottomDock, styles.mintDock]}>
            <Text style={styles.dockKicker}>
              {turn.intent === 'preference'
                ? '要不要记住'
                : turn.intent === 'errand'
                ? '要不要交代'
                : '我听到了'}
            </Text>
            <Text style={styles.dockBody}>
              {turn.proposal?.title || turn.reply || turn.transcript}
            </Text>
          </View>
          <View style={styles.actions}>
            {turn.intent === 'operate' ? (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionMint]}
                  onPress={() => handleStartOperate(turn.transcript)}>
                  <Text style={styles.actionText}>开始操作</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => dismissTurn(turn.id)}>
                  <Text style={styles.actionText}>先不用</Text>
                </TouchableOpacity>
              </>
            ) : turn.intent === 'preference' || turn.intent === 'errand' ? (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionMint]}
                  onPress={() => confirmProposal(turn.id)}>
                  <Text style={styles.actionText}>
                    {turn.intent === 'errand' ? '记成交代' : '记住这条'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => dismissTurn(turn.id)}>
                  <Text style={styles.actionText}>不用</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => dismissTurn(turn.id)}>
                <Text style={styles.actionText}>知道了</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : dictationNotice ? (
        <View style={[styles.bottomDock, styles.dockFloat]}>
          <Text style={styles.dockKicker}>暂时不能听写</Text>
          <Text style={styles.dockBody}>{dictationNotice}</Text>
        </View>
      ) : (
        <View style={[styles.bottomDock, styles.dockFloat]}>
          <Text style={styles.dockKicker}>点角色开始说</Text>
          <Text style={styles.dockBody}>
            {companionState?.errorMessage || '说完我会自己停'}
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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 16 : 64,
    paddingBottom: 120,
  },
  runKickerTop: {
    color: COLORS.text.secondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  runCard: {
    marginTop: 10,
    padding: 19,
    borderRadius: 26,
    backgroundColor: '#1b1d30',
  },
  runKicker: {
    color: '#aaa5e9',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  runTitle: {
    marginTop: 7,
    marginBottom: 5,
    color: '#ffffff',
    fontSize: 20,
    lineHeight: 23,
    fontWeight: '800',
  },
  runMeta: {
    color: '#aeb0bc',
    fontSize: 10,
  },
  timeline: {
    marginTop: 18,
    gap: 9,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.84)',
  },
  timelineIndex: {
    minWidth: 24,
    color: COLORS.text.secondary,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  timelineLabel: {
    flex: 1,
    color: COLORS.text.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  stopBtn: {
    minHeight: 42,
    marginTop: 18,
    paddingHorizontal: 15,
    borderRadius: 999,
    alignSelf: 'flex-start',
    backgroundColor: '#fff0ec',
    justifyContent: 'center',
  },
  stopText: {
    color: COLORS.error,
    fontSize: 12,
    fontWeight: '700',
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
