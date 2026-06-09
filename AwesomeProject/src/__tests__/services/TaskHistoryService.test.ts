/**
 * TaskHistoryService 单元测试
 */

import { taskHistoryService } from '../../features/task/services/TaskHistoryService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Task } from '../../core/engine/taskEngine';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('TaskHistoryService', () => {
  const mockModelId = 'model_123';
  const mockTask: Task = {
    id: 'task_1',
    modelId: mockModelId,
    instruction: '测试任务',
    status: 'success',
    createdAt: Date.now(),
    output: { steps: [] },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
  });

  describe('saveTask', () => {
    it('应该保存新任务', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify([]));

      await taskHistoryService.saveTask(mockTask);

      expect(mockAsyncStorage.setItem).toHaveBeenCalled();
      const setItemCalls = mockAsyncStorage.setItem.mock.calls;
      const savedTasks = JSON.parse(setItemCalls[0][1] as string);
      expect(savedTasks).toHaveLength(1);
      expect(savedTasks[0].id).toBe(mockTask.id);
    });

    it('应该更新已存在的任务', async () => {
      const existingTask = { ...mockTask, status: 'running' as const };
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify([existingTask]));

      const updatedTask = { ...mockTask, status: 'success' as const };
      await taskHistoryService.saveTask(updatedTask);

      const setItemCalls = mockAsyncStorage.setItem.mock.calls;
      const savedTasks = JSON.parse(setItemCalls[0][1] as string);
      expect(savedTasks).toHaveLength(1);
      expect(savedTasks[0].status).toBe('success');
    });

    it('应该自动删除超过50条的最早记录', async () => {
      const tasks: Task[] = Array.from({ length: 51 }, (_, i) => ({
        ...mockTask,
        id: `task_${i}`,
        createdAt: Date.now() - i * 1000, // 时间递增，最早的在前
      }));

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(tasks));

      const newTask: Task = {
        ...mockTask,
        id: 'task_new',
        createdAt: Date.now(),
      };

      await taskHistoryService.saveTask(newTask);

      const setItemCalls = mockAsyncStorage.setItem.mock.calls;
      const savedTasks = JSON.parse(setItemCalls[0][1] as string);
      expect(savedTasks).toHaveLength(51);
      // 最早的任务（task_0）应该被删除
      expect(savedTasks.find((t: Task) => t.id === 'task_0')).toBeUndefined();
      // 新任务应该存在
      expect(savedTasks.find((t: Task) => t.id === 'task_new')).toBeDefined();
    });
  });

  describe('getAllTasks', () => {
    it('应该返回所有任务', async () => {
      const tasks = [mockTask];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(tasks));

      const result = await taskHistoryService.getAllTasks();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockTask.id);
    });

    it('应该返回空数组如果没有任务', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await taskHistoryService.getAllTasks();

      expect(result).toEqual([]);
    });
  });

  describe('getTasksByModelId', () => {
    it('应该返回指定模型的任务列表', async () => {
      const tasks = [
        mockTask,
        { ...mockTask, id: 'task_2', modelId: 'model_456' },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(tasks));

      const result = await taskHistoryService.getTasksByModelId(mockModelId);

      expect(result).toHaveLength(1);
      expect(result[0].modelId).toBe(mockModelId);
    });

    it('应该按创建时间倒序排列', async () => {
      const tasks = [
        { ...mockTask, id: 'task_1', createdAt: Date.now() - 2000 },
        { ...mockTask, id: 'task_2', createdAt: Date.now() - 1000 },
        { ...mockTask, id: 'task_3', createdAt: Date.now() },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(tasks));

      const result = await taskHistoryService.getTasksByModelId(mockModelId);

      expect(result[0].id).toBe('task_3');
      expect(result[1].id).toBe('task_2');
      expect(result[2].id).toBe('task_1');
    });
  });

  describe('deleteTask', () => {
    it('应该删除指定任务', async () => {
      const tasks = [mockTask, { ...mockTask, id: 'task_2' }];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(tasks));

      await taskHistoryService.deleteTask('task_1');

      const setItemCalls = mockAsyncStorage.setItem.mock.calls;
      const savedTasks = JSON.parse(setItemCalls[0][1] as string);
      expect(savedTasks).toHaveLength(1);
      expect(savedTasks[0].id).toBe('task_2');
    });

    it('应该处理不存在的任务', async () => {
      const tasks = [mockTask];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(tasks));

      await taskHistoryService.deleteTask('non_existent');

      const setItemCalls = mockAsyncStorage.setItem.mock.calls;
      const savedTasks = JSON.parse(setItemCalls[0][1] as string);
      expect(savedTasks).toHaveLength(1);
    });
  });
});

