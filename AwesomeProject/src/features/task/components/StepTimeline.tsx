import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {COLORS} from '@shared/constants';
import type {TaskStep} from '@core/engine/taskEngine';

interface StepTimelineProps {
  steps: TaskStep[];
  currentStep?: number;
}

export const StepTimeline: React.FC<StepTimelineProps> = ({
  steps,
  currentStep,
}) => {
  if (steps.length === 0) {
    return (
      <View style={[styles.item, styles.itemCurrent]}>
        <View style={[styles.index, styles.indexCurrent]}>
          <Text style={styles.indexCurrentText}>1</Text>
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>正在准备</Text>
          <Text style={styles.desc}>正在处理</Text>
        </View>
        <Text style={styles.state}>NOW</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {steps.map(step => {
        const isActive = currentStep !== undefined && step.step === currentStep;
        const isDone = currentStep !== undefined && step.step < currentStep;
        return (
          <View
            key={step.step}
            style={[
              styles.item,
              isDone && styles.itemComplete,
              isActive && styles.itemCurrent,
            ]}>
            <View
              style={[
                styles.index,
                isDone && styles.indexComplete,
                isActive && styles.indexCurrent,
              ]}>
              <Text
                style={[
                  styles.indexText,
                  isDone && styles.indexCompleteText,
                  isActive && styles.indexCurrentText,
                ]}>
                {isDone ? '✓' : step.step}
              </Text>
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>{getStepTitle(step)}</Text>
              <Text style={styles.desc}>
                {isDone ? '已完成' : isActive ? '正在处理' : '等待中'}
              </Text>
            </View>
            <Text style={styles.state}>
              {isDone ? 'DONE' : isActive ? 'NOW' : 'NEXT'}
            </Text>
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

const styles = StyleSheet.create({
  container: {
    gap: 9,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  itemComplete: {},
  itemCurrent: {},
  index: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#efedf7',
  },
  indexComplete: {
    backgroundColor: '#dcf2ec',
  },
  indexCurrent: {
    backgroundColor: COLORS.violet,
  },
  indexText: {
    color: '#777a87',
    fontSize: 10,
    fontWeight: '800',
  },
  indexCompleteText: {
    color: COLORS.success,
  },
  indexCurrentText: {
    color: '#ffffff',
  },
  copy: {
    flex: 1,
  },
  title: {
    color: COLORS.text.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  desc: {
    marginTop: 3,
    color: COLORS.text.secondary,
    fontSize: 9,
  },
  state: {
    color: COLORS.text.secondary,
    fontSize: 9,
    fontWeight: '700',
  },
});
