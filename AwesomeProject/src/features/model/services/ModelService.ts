import { saveModels, getModels, saveSelectedModelId, getSelectedModelId } from '@shared/utils/storage';
import type { AIModel, AIModelFormData, ModelListKey } from '@shared/types/Model';

/**
 * 模型管理服务 (Model Service)
 *
 * 管理 AI 模型的 CRUD 操作与选中状态，数据持久化到 AsyncStorage。
 *
 * 验证规则：
 *   - name / modelName / apiUrl / apiKey 均为必填，空字符串会被拒绝
 *   - ID 生成格式：model_{timestamp}_{random9}
 *   - maxSteps 默认 99（与模型上下文窗口上限对应）
 *   - 删除已选中模型时，自动清除选中状态
 */
class ModelService {
  /**
   * 获取所有模型
   */
  async getAllModels(list: ModelListKey = 'unified'): Promise<AIModel[]> {
    return await getModels(list);
  }

  /**
   * 根据ID获取模型
   */
  async getModelById(
    id: string,
    list: ModelListKey = 'unified',
  ): Promise<AIModel | null> {
    const models = await this.getAllModels(list);
    return models.find(model => model.id === id) || null;
  }

  /**
   * 添加新模型
   */
  async addModel(
    formData: AIModelFormData,
    list: ModelListKey = 'unified',
  ): Promise<AIModel> {
    try {
      // 验证必填字段
      if (!formData.name || !formData.name.trim()) {
        throw new Error('模型名称不能为空');
      }
      if (!formData.modelName || !formData.modelName.trim()) {
        throw new Error('模型名称不能为空');
      }
      if (!formData.apiUrl || !formData.apiUrl.trim()) {
        throw new Error('API地址不能为空');
      }
      if (!formData.apiKey || !formData.apiKey.trim()) {
        throw new Error('API密钥不能为空');
      }

      console.info('开始添加模型:', formData.name, formData.apiUrl);
      
      const models = await this.getAllModels(list);
      const newModel: AIModel = {
        id: `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        provider: formData.provider || 'custom',
        name: formData.name.trim(),
        apiUrl: formData.apiUrl.trim(),
        apiKey: formData.apiKey.trim(),
        description: formData.description?.trim() || '',
        modelName: formData.modelName?.trim() || '',
        maxSteps: formData.maxSteps ?? 99, // 默认99步
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      models.push(newModel);
      await saveModels(models, list);
      const selectedId = await getSelectedModelId(list);
      if (!selectedId) {
        await saveSelectedModelId(newModel.id, list);
      }
      
      console.info('模型添加成功:', newModel.id);
      return newModel;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('添加模型失败:', errorMessage, error);
      throw new Error(`添加模型失败: ${errorMessage}`);
    }
  }

  /**
   * 更新模型
   */
  async updateModel(
    id: string,
    formData: AIModelFormData,
    list: ModelListKey = 'unified',
  ): Promise<AIModel> {
    const models = await this.getAllModels(list);
    const index = models.findIndex(model => model.id === id);
    if (index === -1) {
      throw new Error('模型不存在');
    }
    models[index] = {
      ...models[index],
      ...formData,
      updatedAt: Date.now(),
    };
    await saveModels(models, list);
    return models[index];
  }

  /**
   * 删除模型
   */
  async deleteModel(id: string, list: ModelListKey = 'unified'): Promise<void> {
    const models = await this.getAllModels(list);
    const filteredModels = models.filter(model => model.id !== id);
    await saveModels(filteredModels, list);
    
    const selectedId = await getSelectedModelId(list);
    if (selectedId === id) {
      await saveSelectedModelId(filteredModels[0]?.id || null, list);
    }
  }

  /**
   * 设置选中的模型
   */
  async setSelectedModel(
    id: string | null,
    list: ModelListKey = 'unified',
  ): Promise<void> {
    await saveSelectedModelId(id, list);
  }

  /**
   * 获取选中的模型
   */
  async getSelectedModel(list: ModelListKey = 'unified'): Promise<AIModel | null> {
    const selectedId = await getSelectedModelId(list);
    if (!selectedId) {
      return null;
    }
    return await this.getModelById(selectedId, list);
  }
}

export const modelService = new ModelService();

