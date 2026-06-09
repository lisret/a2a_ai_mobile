/**
 * 任务状态徽章组件
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getStatusColor, getStatusText } from '@shared/utils/taskHelpers';
import type { TaskStatus } from '@core/engine/taskEngine';

interface TaskStatusBadgeProps {
  status: TaskStatus;
}

export const TaskStatusBadge: React.FC<TaskStatusBadgeProps> = ({ status }) => {
  return (
    <View style={[styles.badge, { backgroundColor: getStatusColor(status) }]}>
      <Text style={styles.badgeText}>{getStatusText(status)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fff',
  },
});

