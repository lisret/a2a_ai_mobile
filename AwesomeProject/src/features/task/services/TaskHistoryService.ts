import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Task } from '@core/engine/taskEngine';
import { STORAGE_KEYS, TASK_CONFIG } from '@shared/constants';

const TASKS_KEY = STORAGE_KEYS.TASKS;
const TASKS_BY_MODEL_KEY_PREFIX = STORAGE_KEYS.TASKS_BY_MODEL_PREFIX;

/**
 * 任务历史服务
 */
class TaskHistoryService {
  /**
   * 保存任务
   */
  async saveTask(task: Task): Promise<void> {
    try {
      // 获取所有任务
      const allTasks = await this.getAllTasks();
      
      // 更新或添加任务
      const index = allTasks.findIndex(t => t.id === task.id);
      if (index >= 0) {
        allTasks[index] = task;
      } else {
        allTasks.push(task);
      }
      
      // 如果总数超过最大任务数，删除最早的那条记录
      if (allTasks.length > TASK_CONFIG.MAX_TASKS) {
        // 按创建时间排序，找到最早的任务
        const sortedTasks = [...allTasks].sort((a, b) => a.createdAt - b.createdAt);
        const oldestTask = sortedTasks[0];
        
        // 删除最早的任务
        const filteredTasks = allTasks.filter(t => t.id !== oldestTask.id);
        console.info(`任务总数超过${TASK_CONFIG.MAX_TASKS}条，已自动删除最早的任务: ${oldestTask.id}`);
        
        // 更新 allTasks 数组
        allTasks.length = 0;
        allTasks.push(...filteredTasks);
        
        // 更新被删除任务所属模型的任务列表
        await this.saveTasksByModel(oldestTask.modelId, filteredTasks.filter(t => t.modelId === oldestTask.modelId));
      }
      
      // 保存所有任务
      const jsonValue = JSON.stringify(allTasks);
      await AsyncStorage.setItem(TASKS_KEY, jsonValue);
      
      // 按模型ID保存任务列表
      await this.saveTasksByModel(task.modelId, allTasks.filter(t => t.modelId === task.modelId));
      
      console.info('任务已保存:', task.id);
    } catch (error) {
      console.error('保存任务失败:', error);
      throw error;
    }
  }

  /**
   * 获取所有任务
   */
  async getAllTasks(): Promise<Task[]> {
    try {
      const jsonValue = await AsyncStorage.getItem(TASKS_KEY);
      return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (error) {
      console.error('获取任务列表失败:', error);
      return [];
    }
  }

  /**
   * 根据模型ID获取任务列表
   */
  async getTasksByModelId(modelId: string): Promise<Task[]> {
    try {
      const key = `${TASKS_BY_MODEL_KEY_PREFIX}${modelId}`;
      const jsonValue = await AsyncStorage.getItem(key);
      const tasks: Task[] = jsonValue != null ? JSON.parse(jsonValue) : [];
      
      // 按创建时间倒序排列（最新的在前）
      return tasks.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error('获取模型任务列表失败:', error);
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
    } catch (error) {
      console.error('获取任务失败:', error);
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
    } catch (error) {
      console.error('获取最新任务失败:', error);
      return null;
    }
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string): Promise<void> {
    try {
      const allTasks = await this.getAllTasks();
      const task = allTasks.find(t => t.id === taskId);
      
      if (!task) {
        return;
      }
      
      const filteredTasks = allTasks.filter(t => t.id !== taskId);
      await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(filteredTasks));
      
      // 更新模型的任务列表
      await this.saveTasksByModel(task.modelId, filteredTasks.filter(t => t.modelId === task.modelId));
      
      console.info('任务已删除:', taskId);
    } catch (error) {
      console.error('删除任务失败:', error);
      throw error;
    }
  }

  /**
   * 按模型ID保存任务列表（内部方法）
   */
  private async saveTasksByModel(modelId: string, tasks: Task[]): Promise<void> {
    try {
      const key = `${TASKS_BY_MODEL_KEY_PREFIX}${modelId}`;
      const jsonValue = JSON.stringify(tasks);
      await AsyncStorage.setItem(key, jsonValue);
    } catch (error) {
      console.error('保存模型任务列表失败:', error);
    }
  }

  /**
   * 删除模型的所有任务
   */
  async deleteTasksByModelId(modelId: string): Promise<void> {
    try {
      const allTasks = await this.getAllTasks();
      const filteredTasks = allTasks.filter(t => t.modelId !== modelId);
      await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(filteredTasks));
      
      // 删除模型的任务列表
      const key = `${TASKS_BY_MODEL_KEY_PREFIX}${modelId}`;
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('删除模型任务失败:', error);
      throw error;
    }
  }
}

export const taskHistoryService = new TaskHistoryService();

