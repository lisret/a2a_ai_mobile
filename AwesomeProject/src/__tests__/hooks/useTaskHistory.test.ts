/**
 * useTaskHistory Hook 单元测试
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useTaskHistory } from '../../features/task/hooks/useTaskHistory';
import { taskHistoryService } from '../../features/task/services/TaskHistoryService';
import type { Task } from '../../core/engine/taskEngine';

// Mock 服务
jest.mock('../../features/task/services/TaskHistoryService');

const mockTaskHistoryService = taskHistoryService as jest.Mocked<typeof taskHistoryService>;

describe('useTaskHistory', () => {
  const mockModelId = 'model_123';
  const mockTasks: Task[] = [
    {
      id: 'task_1',
      modelId: mockModelId,
      instruction: '测试任务1',
      status: 'success',
      createdAt: Date.now() - 1000,
      output: { steps: [] },
    },
    {
      id: 'task_2',
      modelId: mockModelId,
      instruction: '测试任务2',
      status: 'failed',
      createdAt: Date.now() - 2000,
      output: { steps: [] },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockTaskHistoryService.getTasksByModelId.mockResolvedValue(mockTasks);
    mockTaskHistoryService.deleteTask.mockResolvedValue(undefined);
  });

  it('应该加载任务列表', async () => {
    const { result } = renderHook(() =>
      useTaskHistory({ modelId: mockModelId, autoSelectLatest: false })
    );

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(2);
    });

    expect(mockTaskHistoryService.getTasksByModelId).toHaveBeenCalledWith(mockModelId);
  });

  it('应该自动选择最新任务', async () => {
    const { result } = renderHook(() =>
      useTaskHistory({ modelId: mockModelId, autoSelectLatest: true })
    );

    await waitFor(() => {
      expect(result.current.selectedTask).not.toBeNull();
    });

    expect(result.current.selectedTask?.id).toBe('task_1');
  });

  it('应该支持手动选择任务', async () => {
    const { result } = renderHook(() =>
      useTaskHistory({ modelId: mockModelId, autoSelectLatest: false })
    );

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(2);
    });

    act(() => {
      result.current.selectTask(mockTasks[1]);
    });

    expect(result.current.selectedTask?.id).toBe('task_2');
  });

  it('应该支持删除任务', async () => {
    const { result } = renderHook(() =>
      useTaskHistory({ modelId: mockModelId, autoSelectLatest: false })
    );

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(2);
    });

    act(() => {
      result.current.selectTask(mockTasks[0]);
    });

    // 更新 mock，删除后的任务列表
    mockTaskHistoryService.getTasksByModelId.mockResolvedValue([mockTasks[1]]);

    await act(async () => {
      await result.current.deleteTask('task_1');
    });

    expect(mockTaskHistoryService.deleteTask).toHaveBeenCalledWith('task_1');
    expect(result.current.selectedTask).toBeNull();
  });

  it('应该支持刷新任务列表', async () => {
    const { result } = renderHook(() =>
      useTaskHistory({ modelId: mockModelId, autoSelectLatest: false })
    );

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(2);
    });

    const newTasks = [...mockTasks, {
      id: 'task_3',
      modelId: mockModelId,
      instruction: '测试任务3',
      status: 'running',
      createdAt: Date.now(),
      output: { steps: [] },
    }];

    mockTaskHistoryService.getTasksByModelId.mockResolvedValue(newTasks);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.tasks).toHaveLength(3);
    expect(result.current.refreshing).toBe(false);
  });
});

