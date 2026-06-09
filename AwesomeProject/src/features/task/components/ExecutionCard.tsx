import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS, SHADOWS } from '@shared/constants';
import { StepTimeline } from './StepTimeline';
import type { TaskStep } from '@core/engine/taskEngine';

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
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.statusTitle}>
          <ActivityIndicator size="small" color={COLORS.primary} style={styles.spinner} />
          <Text style={styles.statusText}>正在执行任务...</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.instruction}>{instruction}</Text>
        {steps.length > 0 && (
          <StepTimeline steps={steps} currentStep={currentStep} />
        )}
      </View>
      <View style={styles.footer}>
        <TouchableOpacity onPress={onStop} style={styles.stopBtn}>
          <Text style={styles.stopText}>停止任务</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.background.card,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    ...SHADOWS.default,
  },
  header: {
    padding: 16,
    paddingHorizontal: 20,
    backgroundColor: COLORS.background.blue,
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
  },
  statusTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  spinner: {
    marginRight: 0,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  body: {
    padding: 20,
  },
  instruction: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 16,
  },
  footer: {
    padding: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.medium,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  stopBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  stopText: {
    color: COLORS.error,
    fontSize: 14,
    fontWeight: '600',
  },
});

