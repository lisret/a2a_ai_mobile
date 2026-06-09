import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@shared/constants';
import { AppIcon, IconNames } from '@shared/components/Icon';
import type { TaskStep } from '@core/engine/taskEngine';

interface StepTimelineProps {
  steps: TaskStep[];
  currentStep?: number;
}

export const StepTimeline: React.FC<StepTimelineProps> = ({ steps, currentStep }) => {
  return (
    <View style={styles.container}>
      {steps.map((step, index) => {
        const isActive = currentStep !== undefined && step.step === currentStep;
        const isDone = currentStep !== undefined && step.step < currentStep;
        const isLast = index === steps.length - 1;

        return (
          <View key={step.step} style={styles.item}>
            <View style={[styles.line, isLast && styles.lineHidden]} />
            <View style={[styles.dot, isDone && styles.dotDone, isActive && styles.dotActive]}>
              {isDone && <AppIcon name={IconNames.check} size={10} color="#FFFFFF" />}
            </View>
            <View style={styles.content}>
              <Text style={styles.title}>{getStepTitle(step)}</Text>
              {step.actionDetails && (
                <Text style={styles.desc}>{getActionDescription(step.actionDetails)}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
};

function getStepTitle(step: TaskStep): string {
  if (step.actionDetails) {
    switch (step.actionDetails.type) {
      case 'click':
        return '点击操作';
      case 'swipe':
        return '滑动操作';
      case 'input':
        return '输入文本';
      case 'launch':
        return '启动应用';
      case 'complete':
        return '任务完成';
      default:
        return `步骤 ${step.step}`;
    }
  }
  return `步骤 ${step.step}`;
}

function getActionDescription(action: TaskStep['actionDetails']): string {
  if (!action) return '';
  
  switch (action.type) {
    case 'click':
      return `坐标 (${action.x}, ${action.y})`;
    case 'swipe':
      return `从 (${action.startX}, ${action.startY}) 到 (${action.endX}, ${action.endY})`;
    case 'input':
      return `输入: ${action.text?.substring(0, 20)}${action.text && action.text.length > 20 ? '...' : ''}`;
    case 'launch':
      return `应用: ${action.app || '未知'}`;
    case 'complete':
      return action.message || '任务执行完毕';
    default:
      return '';
  }
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    paddingLeft: 16,
  },
  item: {
    position: 'relative',
    paddingBottom: 20,
    paddingLeft: 20,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.border.medium,
  },
  line: {
    position: 'absolute',
    left: -1,
    top: 12,
    bottom: -8,
    width: 2,
    backgroundColor: COLORS.border.medium,
  },
  lineHidden: {
    display: 'none',
  },
  dot: {
    position: 'absolute',
    left: -7,
    top: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.background.card,
    borderWidth: 2,
    borderColor: COLORS.border.dark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  dotDone: {
    borderColor: COLORS.success,
    backgroundColor: COLORS.success,
  },
  content: {
    marginTop: -4,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text.primary,
  },
  desc: {
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
});

