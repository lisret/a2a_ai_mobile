import React, {useState, useCallback, useMemo} from 'react';
import {Alert} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';
import {taskHistoryService} from '../services/TaskHistoryService';
import {modelService} from '@features/model/services/ModelService';
import {getTaskTitle} from '@shared/utils/taskHelpers';
import {
  NoNoActivityView,
  type ActivityFilter,
  type ActivityItemViewModel,
} from '../components/NoNoActivityView';
import type {Task} from '@core/engine/taskEngine';
import type {AIModel} from '@shared/types/Model';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const TaskHistoryScreenTab: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [model, setModel] = useState<AIModel | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const loadData = useCallback(async () => {
    try {
      const selectedModel = await modelService.getSelectedModel();
      setModel(selectedModel);
      if (selectedModel) {
        setTasks(await taskHistoryService.getTasksByModelId(selectedModel.id));
      } else {
        setTasks(await taskHistoryService.getAllTasks());
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

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

  const formatDemoTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const items = useMemo<ActivityItemViewModel[]>(() => {
    return tasks
      .filter(task => filter === 'all' || task.status === filter)
      .map(task => ({
        id: task.id,
        title: getTaskTitle(task, 40),
        timeLabel: formatDemoTime(task.createdAt),
        stepsLabel: `${task.output?.steps?.length || 0} 个步骤`,
        status:
          task.status === 'failed'
            ? 'failed'
            : task.status === 'success'
              ? 'success'
              : 'running',
        statusLabel:
          task.status === 'failed' ? '失败' : task.status === 'success' ? '已完成' : '执行中',
      }));
  }, [filter, tasks]);

  return (
    <NoNoActivityView
      filter={filter}
      items={items}
      emptyTitle="暂无匹配记录"
      emptyMessage={model ? '完成一个任务后会出现在这里。' : '请先选择一个模型。'}
      refreshing={refreshing}
      pendingDeleteId={deleteTaskId}
      onFilterChange={setFilter}
      onRefresh={handleRefresh}
      onOpen={id => navigation.navigate('TaskDetail', {taskId: id})}
      onRequestDelete={setDeleteTaskId}
      onConfirmDelete={confirmDelete}
      onCancelDelete={() => setDeleteTaskId(null)}
    />
  );
};
