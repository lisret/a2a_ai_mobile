import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@shared/types/navigation';
import { PageLayout } from '@shared/components/PageLayout';
import { HistoryPanel } from '../components/HistoryPanel';
import { taskHistoryService } from '../services/TaskHistoryService';
import { modelService } from '@features/model/services/ModelService';
import { COLORS, SHADOWS } from '@shared/constants';
import { AppIcon, IconNames } from '@shared/components/Icon';
import { ConfirmModal } from '@shared/components/ConfirmModal';
import { getTaskTitle } from '@shared/utils/taskHelpers';
import type { Task } from '@core/engine/taskEngine';
import type { AIModel } from '@shared/types/Model';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const TaskHistoryScreenTab: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [model, setModel] = useState<AIModel | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);

  // 加载当前选中的模型和任务
  const loadData = useCallback(async () => {
    try {
      const selectedModel = await modelService.getSelectedModel();
      setModel(selectedModel);
      
      if (selectedModel) {
        const taskList = await taskHistoryService.getTasksByModelId(selectedModel.id);
        setTasks(taskList);
      } else {
        // 如果没有选中模型，显示所有任务
        const allTasks = await taskHistoryService.getAllTasks();
        setTasks(allTasks);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleTaskPress = (task: Task) => {
    // 跳转到任务详情页面
    navigation.navigate('TaskDetail', { taskId: task.id });
  };

  const handleDelete = (task: Task) => {
    setDeleteTaskId(task.id);
  };

  const confirmDelete = async () => {
    if (!deleteTaskId) return;
    
    try {
      await taskHistoryService.deleteTask(deleteTaskId);
      setDeleteTaskId(null);
      await loadData();
    } catch (error) {
      console.error('删除任务失败:', error);
      Alert.alert('错误', '删除任务失败');
      setDeleteTaskId(null);
    }
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const taskDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (taskDate.getTime() === today.getTime()) {
      return '今天';
    } else if (taskDate.getTime() === today.getTime() - 86400000) {
      return '昨天';
    } else {
      if (date.getFullYear() === now.getFullYear()) {
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
      } else {
        return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
      }
    }
  };

  const groupTasksByDate = (tasks: Task[]) => {
    const groups: { [key: string]: Task[] } = {};
    tasks.forEach(task => {
      const dateKey = formatDate(task.createdAt);
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(task);
    });
    return groups;
  };

  const renderTaskItem = ({ item }: { item: Task }) => {
    const isSuccess = item.status === 'success';
    const isFailed = item.status === 'failed';
    
    return (
      <TouchableOpacity
        style={styles.taskItem}
        onPress={() => handleTaskPress(item)}
        activeOpacity={0.7}>
        <View style={[styles.iconBox, isFailed && styles.iconBoxFail]}>
          <AppIcon
            name={isFailed ? IconNames.error : IconNames.success}
            size={20}
            color={isFailed ? COLORS.error : COLORS.success}
          />
        </View>
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={2}>
            {getTaskTitle(item)}
          </Text>
          <Text style={styles.meta}>
            {new Date(item.createdAt).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {' • '}
            {isFailed
              ? item.error || '执行失败'
              : `${item.output?.steps?.length || 0} 步`}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <AppIcon name={IconNames.delete} size={20} color="#EF4444" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const groupedTasks = groupTasksByDate(tasks);
  const sections = Object.keys(groupedTasks).sort((a, b) => {
    // 今天 > 昨天 > 其他日期
    if (a === '今天') return -1;
    if (b === '今天') return 1;
    if (a === '昨天') return -1;
    if (b === '昨天') return 1;
    return b.localeCompare(a);
  });

  if (tasks.length === 0) {
    return (
      <PageLayout title="任务历史" backgroundColor={COLORS.background.default}>
        <View style={styles.emptyContainer}>
          <AppIcon name={IconNames.empty} size={48} color={COLORS.text.secondary} />
          <Text style={styles.emptyText}>暂无任务历史</Text>
          <Text style={styles.emptySubtext}>
            {model ? '开始执行任务后，历史记录会显示在这里' : '请先选择一个模型'}
          </Text>
        </View>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="任务历史" backgroundColor={COLORS.background.default}>
      <FlatList
        data={sections}
        keyExtractor={item => item}
        renderItem={({ item: dateKey }) => (
          <View>
            <Text style={styles.dateHeader}>{dateKey}</Text>
            {groupedTasks[dateKey].map(task => (
              <View key={task.id}>
                {renderTaskItem({ item: task })}
              </View>
            ))}
          </View>
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      />

      <ConfirmModal
        visible={deleteTaskId !== null}
        title="删除任务"
        message="确定要删除这条任务记录吗？删除后无法恢复。"
        confirmText="删除"
        cancelText="取消"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTaskId(null)}
      />
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
  },
  dateHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280', // var(--text-secondary)
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  taskItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, // var(--shadow-sm)
    shadowRadius: 2,
    elevation: 2, // Android shadow
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EFF6FF', // var(--primary-light)
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  iconBoxFail: {
    backgroundColor: '#FEF2F2', // fail bg
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
  title: {
    fontWeight: '600',
    fontSize: 15,
    color: '#111827', // var(--text-main)
    marginBottom: 4,
    lineHeight: 20,
  },
  meta: {
    fontSize: 12,
    color: '#6B7280', // var(--text-secondary)
  },
  deleteBtn: {
    padding: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});

