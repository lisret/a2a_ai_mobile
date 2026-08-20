import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AIModel, ModelListKey } from '../types/Model';
import { STORAGE_KEYS } from '../constants/storage.config';

const MODELS_KEY = '@autoglm:models';
const SELECTED_MODEL_KEY = '@autoglm:selected_model';

function modelsKey(list: ModelListKey = 'unified') {
  return list === 'unified' ? MODELS_KEY : `${STORAGE_KEYS.MODEL_LIST_PREFIX}${list}`;
}

function selectedKey(list: ModelListKey = 'unified') {
  return list === 'unified'
    ? SELECTED_MODEL_KEY
    : `${STORAGE_KEYS.MODEL_SELECTED_PREFIX}${list}`;
}

/**
 * 存储模型列表
 */
export async function saveModels(
  models: AIModel[],
  list: ModelListKey = 'unified',
): Promise<void> {
  try {
    const jsonValue = JSON.stringify(models);
    await AsyncStorage.setItem(modelsKey(list), jsonValue);
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
export async function getModels(
  list: ModelListKey = 'unified',
): Promise<AIModel[]> {
  try {
    const jsonValue = await AsyncStorage.getItem(modelsKey(list));
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (error) {
    console.error('获取模型列表失败:', error);
    return [];
  }
}

/**
 * 保存选中的模型ID
 */
export async function saveSelectedModelId(
  modelId: string | null,
  list: ModelListKey = 'unified',
): Promise<void> {
  try {
    if (modelId) {
      await AsyncStorage.setItem(selectedKey(list), modelId);
    } else {
      await AsyncStorage.removeItem(selectedKey(list));
    }
  } catch (error) {
    console.error('保存选中模型失败:', error);
    throw error;
  }
}

/**
 * 获取选中的模型ID
 */
export async function getSelectedModelId(
  list: ModelListKey = 'unified',
): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(selectedKey(list));
  } catch (error) {
    console.error('获取选中模型失败:', error);
    return null;
  }
}

