/**
 * 任务历史侧边面板组件
 */

import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Animated } from 'react-native';
import { AppIcon, IconNames } from '@shared/components/Icon';
import { formatTime } from '@shared/utils/formatters';
import { getTaskTitle } from '@shared/utils/taskHelpers';
import { TaskStatusBadge } from './TaskStatusBadge';
import type { Task } from '@core/engine/taskEngine';

interface HistoryPanelProps {
  tasks: Task[];
  selectedTask: Task | null;
  refreshing: boolean;
  panelVisible: boolean;
  panelAnim: Animated.Value;
  panelWidth: number;
  onTaskPress: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onDeleteAll: () => void;
  onRefresh: () => void;
  onClose: () => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  tasks,
  selectedTask,
  refreshing,
  panelVisible,
  panelAnim,
  panelWidth,
  onTaskPress,
  onDeleteTask,
  onDeleteAll,
  onRefresh,
  onClose,
}) => {
  const maskOpacity = panelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.3],
  });

  const panelTranslateX = panelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [panelWidth, 0],
  });

  return (
    <>
      {panelVisible && (
        <Animated.View
          style={[
            styles.mask,
            {
              opacity: maskOpacity,
            },
          ]}
          onTouchEnd={onClose}
        />
      )}
      <Animated.View
        style={[
          styles.panel,
          {
            width: panelWidth,
            transform: [{ translateX: panelTranslateX }],
          },
        ]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>历史任务</Text>
          <View style={styles.headerRight}>
            {tasks.length > 0 && (
              <TouchableOpacity style={styles.deleteAllButton} onPress={onDeleteAll}>
                <AppIcon name={IconNames.delete} size={16} color="#dc2626" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <AppIcon name={IconNames.close} size={18} color="#165DFF" />
            </TouchableOpacity>
          </View>
        </View>
        <FlatList
          data={tasks}
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            const stepCount = item.output?.steps?.length || 0;
            const duration = item.completedAt && item.createdAt 
              ? Math.round((item.completedAt - item.createdAt) / 1000)
              : null;
            
            return (
              <View
                style={[
                  styles.item,
                  selectedTask?.id === item.id && styles.itemActive,
                ]}>
                <TouchableOpacity 
                  style={styles.itemContent} 
                  onPress={() => onTaskPress(item)}
                  activeOpacity={0.7}>
                  <View style={styles.itemHeader}>
                    <View style={styles.itemTitleRow}>
                      <Text style={styles.itemTitle} numberOfLines={2}>
                        {item.instruction}
                      </Text>
                    </View>
                    <View style={styles.badgeContainer}>
                      <TaskStatusBadge status={item.status} />
                    </View>
                  </View>
                  
                  <View style={styles.itemMeta}>
                    <View style={styles.metaItem}>
                      <AppIcon name={IconNames.clock} size={12} color="#86868b" />
                      <Text style={styles.metaText}>{formatTime(item.createdAt)}</Text>
                    </View>
                    {stepCount > 0 && (
                      <View style={styles.metaItem}>
                        <AppIcon name={IconNames.list} size={12} color="#86868b" />
                        <Text style={styles.metaText}>{stepCount} 步</Text>
                      </View>
                    )}
                    {duration !== null && duration > 0 && (
                      <View style={styles.metaItem}>
                        <AppIcon name={IconNames.timer} size={12} color="#86868b" />
                        <Text style={styles.metaText}>
                          {duration < 60 ? `${duration}秒` : `${Math.floor(duration / 60)}分${duration % 60}秒`}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => onDeleteTask(item)}
                  activeOpacity={0.6}>
                  <View style={styles.deleteButtonInner}>
                    <AppIcon name={IconNames.delete} size={16} color="#dc2626" />
                  </View>
                </TouchableOpacity>
              </View>
            );
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppIcon name={IconNames.folder} size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>暂无任务记录</Text>
              <Text style={styles.emptyHint}>开始执行任务后，历史记录将显示在这里</Text>
            </View>
          }
        />
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  mask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 15,
  },
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    height: '100%',
    backgroundColor: '#fff',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: 0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteAllButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#ffffff',
    minHeight: 88,
  },
  itemContent: {
    flex: 1,
    padding: 16,
    paddingRight: 8,
  },
  itemActive: {
    backgroundColor: '#f0f7ff',
    borderLeftWidth: 4,
    borderLeftColor: '#165DFF',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
  },
  itemTitleRow: {
    flex: 1,
    marginRight: 8,
    minHeight: 40,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1d1d1f',
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  badgeContainer: {
    marginTop: 2,
  },
  itemMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '400',
  },
  deleteButton: {
    paddingRight: 12,
    paddingLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 44,
  },
  deleteButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
});

