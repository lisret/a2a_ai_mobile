import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '@shared/constants';

const SEARCH_BOX_POSITION_KEY = `${STORAGE_KEYS.SETTINGS_PREFIX}search_box_position`;

/**
 * 搜索框位置服务
 * 管理系统搜索框位置的文本描述，用于在提示词中提供位置信息
 */
class SearchBoxPositionService {
  /**
   * 保存搜索框位置描述
   * @param description 搜索框位置描述文本，例如："搜索框在首页左侧页面的顶部"
   */
  async saveSearchBoxPosition(description: string): Promise<void> {
    try {
      if (!description || description.trim().length === 0) {
        throw new Error('搜索框位置描述不能为空');
      }
      
      await AsyncStorage.setItem(SEARCH_BOX_POSITION_KEY, description.trim());
      console.info(`[搜索框位置] 保存成功: ${description.trim()}`);
    } catch (error) {
      console.error('[搜索框位置] 保存失败:', error);
      throw error;
    }
  }

  /**
   * 获取搜索框位置描述
   * @returns 搜索框位置描述文本，如果不存在则返回 null
   */
  async getSearchBoxPosition(): Promise<string | null> {
    try {
      const description = await AsyncStorage.getItem(SEARCH_BOX_POSITION_KEY);
      if (description) {
        console.info(`[搜索框位置] 读取成功: ${description}`);
      } else {
        console.info('[搜索框位置] 未找到记录');
      }
      return description;
    } catch (error) {
      console.error('[搜索框位置] 读取失败:', error);
      return null;
    }
  }

  /**
   * 删除搜索框位置描述
   */
  async deleteSearchBoxPosition(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SEARCH_BOX_POSITION_KEY);
      console.info('[搜索框位置] 已删除');
    } catch (error) {
      console.error('[搜索框位置] 删除失败:', error);
      throw error;
    }
  }

  /**
   * 检查是否存在搜索框位置记录
   */
  async hasSearchBoxPosition(): Promise<boolean> {
    try {
      const description = await this.getSearchBoxPosition();
      return description !== null && description.length > 0;
    } catch (error) {
      console.error('[搜索框位置] 检查失败:', error);
      return false;
    }
  }
}

export const searchBoxPositionService = new SearchBoxPositionService();

