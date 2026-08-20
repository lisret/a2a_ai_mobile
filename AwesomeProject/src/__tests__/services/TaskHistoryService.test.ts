/**
 * TaskHistoryService 单元测试
 */

import {taskHistoryService} from '../../features/task/services/TaskHistoryService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {Task} from '@core/engine/taskEngine';
import {STORAGE_KEYS, TASK_CONFIG} from '@shared/constants';

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
    output: {steps: []},
  };

  // In-memory backing store so mutation-queue/serialization tests observe
  // real read-after-write behaviour instead of a single canned response.
  let store: Record<string, string> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    store = {};
    mockAsyncStorage.getItem.mockImplementation(
      async key => store[key] ?? null,
    );
    mockAsyncStorage.setItem.mockImplementation(async (key, value) => {
      store[key] = value;
    });
    mockAsyncStorage.removeItem.mockImplementation(async key => {
      delete store[key];
    });
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
      const existingTask = {...mockTask, status: 'running' as const};
      mockAsyncStorage.getItem.mockResolvedValue(
        JSON.stringify([existingTask]),
      );

      const updatedTask = {...mockTask, status: 'success' as const};
      await taskHistoryService.saveTask(updatedTask);

      const setItemCalls = mockAsyncStorage.setItem.mock.calls;
      const savedTasks = JSON.parse(setItemCalls[0][1] as string);
      expect(savedTasks).toHaveLength(1);
      expect(savedTasks[0].status).toBe('success');
    });

    it('应该自动删除超过配置上限的最早记录', async () => {
      const tasks = Array.from({length: TASK_CONFIG.MAX_TASKS}, (_, index) => ({
        ...mockTask,
        id: `task_${index}`,
        createdAt: index,
      }));
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(tasks));

      const newTask: Task = {
        ...mockTask,
        id: 'task_new',
        createdAt: TASK_CONFIG.MAX_TASKS + 1,
      };

      await taskHistoryService.saveTask(newTask);

      const globalWrite = mockAsyncStorage.setItem.mock.calls.find(
        ([key]) => key === STORAGE_KEYS.TASKS,
      );
      expect(globalWrite).toBeDefined();
      const savedTasks = JSON.parse(globalWrite![1] as string) as Task[];
      expect(savedTasks).toHaveLength(TASK_CONFIG.MAX_TASKS);
    });

    it('deterministically trims the earliest-inserted task when createdAt ties', async () => {
      for (let index = 0; index < TASK_CONFIG.MAX_TASKS; index += 1) {
        await taskHistoryService.saveTask({
          ...mockTask,
          id: `task_${index}`,
          // task_0 and task_1 tie at createdAt 0; task_0 was inserted first.
          createdAt: index < 2 ? 0 : index,
        });
      }

      await taskHistoryService.saveTask({
        ...mockTask,
        id: 'task_overflow',
        createdAt: TASK_CONFIG.MAX_TASKS,
      });

      const allTasks = await taskHistoryService.getAllTasks();
      expect(allTasks.find(task => task.id === 'task_0')).toBeUndefined();
      expect(allTasks.find(task => task.id === 'task_1')).toBeDefined();
      expect(allTasks).toHaveLength(TASK_CONFIG.MAX_TASKS);
    });

    it('is idempotent when saving the same task twice', async () => {
      await taskHistoryService.saveTask(mockTask);
      await taskHistoryService.saveTask(mockTask);

      const allTasks = await taskHistoryService.getAllTasks();
      expect(allTasks).toHaveLength(1);
    });

    it('does not lose either task across concurrent read-modify-write calls', async () => {
      const taskA: Task = {...mockTask, id: 'task_a', createdAt: 1};
      const taskB: Task = {...mockTask, id: 'task_b', createdAt: 2};

      await Promise.all([
        taskHistoryService.saveTask(taskA),
        taskHistoryService.saveTask(taskB),
      ]);

      const allTasks = await taskHistoryService.getAllTasks();
      expect(allTasks).toEqual(expect.arrayContaining([taskA, taskB]));
      expect(allTasks).toHaveLength(2);
    });

    it('keeps the queue usable after a failed write', async () => {
      mockAsyncStorage.setItem.mockRejectedValueOnce(new Error('write failed'));
      const taskA: Task = {...mockTask, id: 'task_a'};
      const taskB: Task = {...mockTask, id: 'task_b'};

      await expect(taskHistoryService.saveTask(taskA)).rejects.toThrow(
        'write failed',
      );
      await expect(taskHistoryService.saveTask(taskB)).resolves.toBeUndefined();
    });

    it('rejects a terminal task transition back to running', async () => {
      const successTask: Task = {
        ...mockTask,
        id: 'task_terminal',
        status: 'success',
      };
      await taskHistoryService.saveTask(successTask);

      await expect(
        taskHistoryService.saveTask({...successTask, status: 'running'}),
      ).rejects.toMatchObject({code: 'task_terminal_transition_rejected'});

      const stored = await taskHistoryService.getTaskById('task_terminal');
      expect(stored?.status).toBe('success');
    });

    it('never writes or removes a per-model index key', async () => {
      await taskHistoryService.saveTask(mockTask);
      await taskHistoryService.deleteTask(mockTask.id);
      await taskHistoryService.saveTask(mockTask);
      await taskHistoryService.deleteTasksByModelId(mockModelId);

      const prefixCalls = [
        ...mockAsyncStorage.setItem.mock.calls,
        ...mockAsyncStorage.removeItem.mock.calls,
      ].filter(([key]) =>
        key.startsWith(STORAGE_KEYS.TASKS_BY_MODEL_PREFIX),
      );
      expect(prefixCalls).toHaveLength(0);
    });

    it('never persists apiKey, secretRef, screenshot data URIs, or raw model responses', async () => {
      const sensitiveTask: Task = {
        ...mockTask,
        id: 'task_sensitive',
        output: {
          steps: [
            {
              step: 1,
              action: '点击登录按钮',
              timestamp: 1_700_000_000_000,
              screenshotUri: 'data:image/png;base64,AAAA',
              modelResponse: 'apiKey=secret-123 secretRef=vault://token',
              actionDetails: {type: 'click', x: 10, y: 20},
            },
          ],
          summary: '任务完成',
        },
      };

      await taskHistoryService.saveTask(sensitiveTask);

      const rawStoredJson = store[STORAGE_KEYS.TASKS];
      expect(rawStoredJson).toBeDefined();
      expect(rawStoredJson).not.toMatch(/apiKey|secretRef|data:image/);

      const stored = await taskHistoryService.getTaskById('task_sensitive');
      expect(stored?.output?.steps[0]).toEqual({
        step: 1,
        action: '点击登录按钮',
        timestamp: 1_700_000_000_000,
        actionDetails: {type: 'click', x: 10, y: 20},
      });
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
        {...mockTask, id: 'task_2', modelId: 'model_456'},
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(tasks));

      const result = await taskHistoryService.getTasksByModelId(mockModelId);

      expect(result).toHaveLength(1);
      expect(result[0].modelId).toBe(mockModelId);
    });

    it('应该按创建时间倒序排列', async () => {
      const tasks = [
        {...mockTask, id: 'task_1', createdAt: Date.now() - 2000},
        {...mockTask, id: 'task_2', createdAt: Date.now() - 1000},
        {...mockTask, id: 'task_3', createdAt: Date.now()},
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(tasks));

      const result = await taskHistoryService.getTasksByModelId(mockModelId);

      expect(result[0].id).toBe('task_3');
      expect(result[1].id).toBe('task_2');
      expect(result[2].id).toBe('task_1');
    });

    it('derives model results from the primary list, never a per-model key', async () => {
      await taskHistoryService.saveTask(mockTask);

      const perModelRead = mockAsyncStorage.getItem.mock.calls.find(
        ([key]) => key === `${STORAGE_KEYS.TASKS_BY_MODEL_PREFIX}${mockModelId}`,
      );
      expect(perModelRead).toBeUndefined();

      const result = await taskHistoryService.getTasksByModelId(mockModelId);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockTask.id);
    });
  });

  describe('deleteTask', () => {
    it('应该删除指定任务', async () => {
      const tasks = [mockTask, {...mockTask, id: 'task_2'}];
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
      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('load (TaskInstructionPort)', () => {
    it('returns the trimmed instruction for an existing task', async () => {
      await taskHistoryService.saveTask({
        ...mockTask,
        id: 'task_instruction',
        instruction: '  执行任务  ',
      });

      await expect(
        taskHistoryService.load('task_instruction'),
      ).resolves.toBe('执行任务');
    });

    it('returns null when the task does not exist', async () => {
      await expect(taskHistoryService.load('missing_task')).resolves.toBeNull();
    });
  });
});
