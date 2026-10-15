import AsyncStorage from '@react-native-async-storage/async-storage';
import type {Task, TaskStep} from '@core/engine/taskEngine';
import type {TaskInstructionPort} from '@core/engine/operateRuntime/ports/TaskInstructionPort';
import {STORAGE_KEYS, TASK_CONFIG} from '@shared/constants';

const TASKS_KEY = STORAGE_KEYS.TASKS;

// Bounds a persisted output summary so it can never smuggle in an unbounded
// raw provider response; individual steps still drop screenshotUri/modelResponse below.
const MAX_OUTPUT_SUMMARY_LENGTH = 4000;

const TERMINAL_STATUSES: ReadonlySet<Task['status']> = new Set([
  'success',
  'failed',
]);
const NON_TERMINAL_STATUSES: ReadonlySet<Task['status']> = new Set([
  'idle',
  'waiting',
  'running',
]);

/** Stable, ref-free rejection carried on `.code`. */
export class TaskHistoryError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'TaskHistoryError';
    this.code = code;
  }
}

function assertNoTerminalRegression(previous: Task | undefined, next: Task): void {
  if (
    previous &&
    TERMINAL_STATUSES.has(previous.status) &&
    NON_TERMINAL_STATUSES.has(next.status)
  ) {
    throw new TaskHistoryError('task_terminal_transition_rejected');
  }
}

function projectStepForStorage(step: TaskStep): TaskStep {
  const {screenshotUri, modelResponse, ...safeStep} = step;
  return safeStep;
}

function projectTaskForStorage(task: Task): Task {
  if (!task.output) {
    return task;
  }
  const {finalScreenshot, ...safeOutput} = task.output;
  return {
    ...task,
    output: {
      ...safeOutput,
      steps: task.output.steps.map(projectStepForStorage),
      summary: task.output.summary?.slice(0, MAX_OUTPUT_SUMMARY_LENGTH),
    },
  };
}

/**
 * 任务历史服务
 */
class TaskHistoryService implements TaskInstructionPort {
  private mutationQueue: Promise<void> = Promise.resolve();

  private async readAllTasksStrict(): Promise<Task[]> {
    const jsonValue = await AsyncStorage.getItem(TASKS_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /**
   * 保存任务
   */
  async saveTask(task: Task): Promise<void> {
    return this.enqueueMutation(async () => {
      try {
        const allTasks = await this.readAllTasksStrict();
        const index = allTasks.findIndex(existing => existing.id === task.id);
        assertNoTerminalRegression(
          index >= 0 ? allTasks[index] : undefined,
          task,
        );

        const storedTask = projectTaskForStorage(task);
        if (index >= 0) {
          allTasks[index] = storedTask;
        } else {
          allTasks.push(storedTask);
        }

        if (allTasks.length > TASK_CONFIG.MAX_TASKS) {
          const oldestTask = [...allTasks].sort(
            (a, b) => a.createdAt - b.createdAt,
          )[0];
          const filteredTasks = allTasks.filter(
            existing => existing.id !== oldestTask.id,
          );
          allTasks.length = 0;
          allTasks.push(...filteredTasks);
          console.info(
            `任务总数超过${TASK_CONFIG.MAX_TASKS}条，已自动删除最早的任务: ${oldestTask.id}`,
          );
        }

        await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(allTasks));
        console.info('任务已保存:', task.id);
      } catch (error) {
        console.error('保存任务失败');
        throw error;
      }
    });
  }

  /**
   * 获取所有任务
   */
  async getAllTasks(): Promise<Task[]> {
    try {
      return await this.readAllTasksStrict();
    } catch {
      console.error('获取任务列表失败');
      return [];
    }
  }

  /**
   * 根据模型ID获取任务列表
   */
  async getTasksByModelId(modelId: string): Promise<Task[]> {
    try {
      const tasks = await this.getAllTasks();
      return tasks
        .filter(task => task.modelId === modelId)
        .sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      console.error('获取模型任务列表失败');
      return [];
    }
  }

  /**
   * 根据任务ID获取任务
   */
  async getTaskById(taskId: string): Promise<Task | null> {
    try {
      const allTasks = await this.getAllTasks();
      return allTasks.find(task => task.id === taskId) || null;
    } catch {
      console.error('获取任务失败');
      return null;
    }
  }

  /**
   * 获取模型的最新任务
   */
  async getLatestTaskByModelId(modelId: string): Promise<Task | null> {
    try {
      const tasks = await this.getTasksByModelId(modelId);
      return tasks.length > 0 ? tasks[0] : null;
    } catch {
      console.error('获取最新任务失败');
      return null;
    }
  }

  /**
   * TaskInstructionPort：仅返回去除首尾空白的指令文本，不暴露完整 Task。
   */
  async load(taskId: string): Promise<string | null> {
    try {
      const task = await this.getTaskById(taskId);
      return task ? task.instruction.trim() : null;
    } catch {
      console.error('获取任务指令失败');
      return null;
    }
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string): Promise<void> {
    return this.enqueueMutation(async () => {
      try {
        const allTasks = await this.readAllTasksStrict();
        if (!allTasks.some(task => task.id === taskId)) {
          return;
        }

        const filteredTasks = allTasks.filter(task => task.id !== taskId);
        await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(filteredTasks));
        console.info('任务已删除:', taskId);
      } catch (error) {
        console.error('删除任务失败');
        throw error;
      }
    });
  }

  /**
   * 删除模型的所有任务
   */
  async deleteTasksByModelId(modelId: string): Promise<void> {
    return this.enqueueMutation(async () => {
      try {
        const allTasks = await this.readAllTasksStrict();
        const filteredTasks = allTasks.filter(
          task => task.modelId !== modelId,
        );
        await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(filteredTasks));
      } catch (error) {
        console.error('删除模型任务失败');
        throw error;
      }
    });
  }
}

export const taskHistoryService = new TaskHistoryService();
