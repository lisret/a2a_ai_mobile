/**
 * 任务步骤项组件
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AppIcon, IconNames } from '@shared/components/Icon';
import type { TaskStep } from '@core/engine/taskEngine';

interface TaskStepItemProps {
  step: TaskStep;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export const TaskStepItem: React.FC<TaskStepItemProps> = ({
  step,
  isExpanded,
  onToggleExpand,
}) => {
  const actionText = !step.actionDetails && step.modelResponse ? '思考中' : step.action;

  return (
    <View style={styles.container}>
      <View style={styles.stepItem}>
        <View style={styles.stepHeader}>
          <Text style={styles.stepNumber}>步骤 {step.step}</Text>
          {step.modelResponse && (
            <TouchableOpacity style={styles.expandButton} onPress={onToggleExpand}>
              <AppIcon
                name={IconNames.arrowRight}
                size={12}
                color="#86868b"
                style={{
                  transform: [{ rotate: isExpanded ? '-90deg' : '90deg' }],
                }}
              />
              <Text style={styles.expandButtonText}>
                {isExpanded ? '收起思考' : '展开思考'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.stepAction}>{actionText}</Text>
      </View>
      {step.modelResponse && isExpanded && (
        <View style={styles.modelResponseBox}>
          <Text style={styles.modelResponseText}>{step.modelResponse}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 6,
  },
  stepItem: {
    padding: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepNumber: {
    fontSize: 11,
    fontWeight: '600',
    color: '#165DFF',
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  expandButtonText: {
    fontSize: 11,
    color: '#86868b',
  },
  stepAction: {
    fontSize: 13,
    color: '#1d1d1f',
    lineHeight: 18,
  },
  modelResponseBox: {
    padding: 12,
    backgroundColor: '#f0f7ff',
    borderRadius: 8,
    marginTop: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#165DFF',
  },
  modelResponseText: {
    fontSize: 13,
    color: '#1d1d1f',
    lineHeight: 18,
  },
});

