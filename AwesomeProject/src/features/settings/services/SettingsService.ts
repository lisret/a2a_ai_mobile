import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@shared/constants';

const ADB_FALLBACK_ENABLED_KEY = STORAGE_KEYS.SETTINGS_ADB_FALLBACK_ENABLED;
const BACKGROUND_RUN_ENABLED_KEY = STORAGE_KEYS.SETTINGS_BACKGROUND_RUN_ENABLED;
const TASK_COMPLETION_SOUND_ENABLED_KEY = STORAGE_KEYS.SETTINGS_TASK_COMPLETION_SOUND_ENABLED;

/**
 * 设置服务
 * 管理应用设置
 */
class SettingsService {
  /**
   * 获取 ADB 回退是否启用
   * 默认返回 false（不启用）
   */
  async getADBFallbackEnabled(): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(ADB_FALLBACK_ENABLED_KEY);
      const enabled = value === null ? false : value === 'true';
      return enabled;
    } catch (error) {
      console.error('获取ADB回退设置失败:', error);
      return false;
    }
  }

  /**
   * 设置 ADB 回退是否启用
   */
  async setADBFallbackEnabled(enabled: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(ADB_FALLBACK_ENABLED_KEY, enabled ? 'true' : 'false');
    } catch (error) {
      console.error('保存ADB回退设置失败:', error);
      throw error;
    }
  }

  /**
   * 获取后台运行是否启用
   * 现在强制返回 true（始终后台运行）
   */
  async getBackgroundRunEnabled(): Promise<boolean> {
    // 强制后台运行，不再需要开关
    return true;
  }

  /**
   * 设置后台运行是否启用（已废弃，始终返回 true）
   * 保留此方法以保持向后兼容
   */
  async setBackgroundRunEnabled(enabled: boolean): Promise<void> {
    // 已废弃，不再保存设置
  }

  /**
   * 获取任务完成提示音是否启用
   * 默认返回 true（启用）
   */
  async getTaskCompletionSoundEnabled(): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(TASK_COMPLETION_SOUND_ENABLED_KEY);
      // 默认启用
      return value === null ? true : value === 'true';
    } catch (error) {
      console.error('获取任务完成提示音设置失败:', error);
      return true; // 默认启用
    }
  }

  /**
   * 设置任务完成提示音是否启用
   */
  async setTaskCompletionSoundEnabled(enabled: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(TASK_COMPLETION_SOUND_ENABLED_KEY, enabled ? 'true' : 'false');
    } catch (error) {
      console.error('保存任务完成提示音设置失败:', error);
      throw error;
    }
  }
}

export const settingsService = new SettingsService();

