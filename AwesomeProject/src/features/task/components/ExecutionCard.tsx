import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {COLORS} from '@shared/constants';
import {NoNoMascot} from '@shared/components/NoNoMascot';
import {StepTimeline} from './StepTimeline';
import type {TaskStep} from '@core/engine/taskEngine';

interface ExecutionCardProps {
  instruction: string;
  steps: TaskStep[];
  currentStep?: number;
  onStop: () => void;
}

export const ExecutionCard: React.FC<ExecutionCardProps> = ({
  instruction,
  steps,
  currentStep,
  onStop,
}) => {
  const total = Math.max(steps.length, currentStep ?? 1, 1);
  const progress = Math.min(100, Math.round((((currentStep ?? 0) + 0.5) / total) * 100));

  return (
    <View>
      <View style={styles.card}>
        <View style={styles.stateRow}>
          <View style={styles.copy}>
            <Text style={styles.kicker}>RUNNING</Text>
            <Text style={styles.title}>NoNo 正在执行</Text>
            <Text style={styles.subtitle}>正在安全地完成当前步骤</Text>
          </View>
          <NoNoMascot size={66} mood="thinking" />
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, {width: `${progress}%`}]} />
        </View>
        <View style={styles.progressMeta}>
          <Text style={styles.metaText}>
            步骤 {Math.min((currentStep ?? 0) + 1, total)} / {total}
          </Text>
          <Text style={styles.metaText}>{progress}%</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity onPress={onStop} style={styles.stopBtn}>
          <Text style={styles.stopText}>终止</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>执行时间线</Text>
        <Text style={styles.sectionHint} numberOfLines={1}>
          {instruction}
        </Text>
      </View>
      <StepTimeline steps={steps} currentStep={currentStep} />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    padding: 19,
    borderRadius: 26,
    backgroundColor: '#1b1d30',
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  copy: {flex: 1},
  kicker: {
    color: '#aaa5e9',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  title: {
    marginTop: 7,
    marginBottom: 5,
    color: '#ffffff',
    fontSize: 20,
    lineHeight: 23,
    fontWeight: '800',
  },
  subtitle: {
    color: '#c4c6d1',
    fontSize: 11,
    lineHeight: 16,
  },
  progressTrack: {
    height: 7,
    marginTop: 18,
    overflow: 'hidden',
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: COLORS.violet,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  metaText: {
    color: '#aeb0bc',
    fontSize: 9,
  },
  actions: {
    marginTop: 14,
    alignItems: 'flex-start',
  },
  stopBtn: {
    minHeight: 42,
    paddingHorizontal: 15,
    borderRadius: 999,
    backgroundColor: '#fff0ec',
    justifyContent: 'center',
  },
  stopText: {
    color: COLORS.error,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHeading: {
    marginTop: 24,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    color: COLORS.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHint: {
    flex: 1,
    textAlign: 'right',
    color: COLORS.text.secondary,
    fontSize: 10,
  },
});
