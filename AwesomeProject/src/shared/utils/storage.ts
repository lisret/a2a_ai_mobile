import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AIModel } from '../types/Model';

const MODELS_KEY = '@autoglm:models';
const SELECTED_MODEL_KEY = '@autoglm:selected_model';

/**
 * 存储模型列表
 */
export async function saveModels(models: AIModel[]): Promise<void> {
  try {
    const jsonValue = JSON.stringify(models);
    await AsyncStorage.setItem(MODELS_KEY, jsonValue);
    console.info('模型列表保存成功，共', models.length, '个模型');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('保存模型列表失败:', errorMessage, error);
    throw new Error(`保存模型失败: ${errorMessage}`);
  }
}

/**
 * 获取模型列表
 */
export async function getModels(): Promise<AIModel[]> {
  try {
    const jsonValue = await AsyncStorage.getItem(MODELS_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (error) {
    console.error('获取模型列表失败:', error);
    return [];
  }
}

/**
 * 保存选中的模型ID
 */
export async function saveSelectedModelId(modelId: string | null): Promise<void> {
  try {
    if (modelId) {
      await AsyncStorage.setItem(SELECTED_MODEL_KEY, modelId);
    } else {
      await AsyncStorage.removeItem(SELECTED_MODEL_KEY);
    }
  } catch (error) {
    console.error('保存选中模型失败:', error);
    throw error;
  }
}

/**
 * 获取选中的模型ID
 */
export async function getSelectedModelId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SELECTED_MODEL_KEY);
  } catch (error) {
    console.error('获取选中模型失败:', error);
    return null;
  }
}

