/**
 * 任务历史相关的 Hook
 */

import { useState, useCallback, useEffect } from 'react';
import { taskHistoryService } from '../services/TaskHistoryService';
import type { Task } from '@core/engine/taskEngine';

interface UseTaskHistoryOptions {
  modelId: string;
  autoSelectLatest?: boolean;
}

export function useTaskHistory(options: UseTaskHistoryOptions) {
  const { modelId, autoSelectLatest = true } = options;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      const taskList = await taskHistoryService.getTasksByModelId(modelId);
      setTasks(taskList);

      // 自动选择最新任务
      if (autoSelectLatest && taskList.length > 0 && !selectedTask) {
        setSelectedTask(taskList[0]);
      }
    } catch (error) {
      console.error('加载任务列表失败:', error);
    }
  }, [modelId, autoSelectLatest, selectedTask]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadTasks();
    setRefreshing(false);
  }, [loadTasks]);

  const selectTask = useCallback((task: Task | null) => {
    setSelectedTask(task);
  }, []);

  const deleteTask = useCallback(async (taskId: string) => {
    try {
      await taskHistoryService.deleteTask(taskId);
      if (selectedTask?.id === taskId) {
        setSelectedTask(null);
      }
      await loadTasks();
    } catch (error) {
      console.error('删除任务失败:', error);
      throw error;
    }
  }, [selectedTask, loadTasks]);

  const deleteAllTasks = useCallback(async () => {
    try {
      await taskHistoryService.deleteTasksByModelId(modelId);
      setSelectedTask(null);
      await loadTasks();
    } catch (error) {
      console.error('删除所有任务失败:', error);
      throw error;
    }
  }, [modelId, loadTasks]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  return {
    tasks,
    selectedTask,
    refreshing,
    deleteTaskId,
    setDeleteTaskId,
    loadTasks,
    refresh,
    selectTask,
    deleteTask,
    deleteAllTasks,
  };
}

