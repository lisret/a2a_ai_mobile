import { saveModels, getModels, saveSelectedModelId, getSelectedModelId } from '@shared/utils/storage';
import type { AIModel, AIModelFormData } from '@shared/types/Model';

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
  async getAllModels(): Promise<AIModel[]> {
    return await getModels();
  }

  /**
   * 根据ID获取模型
   */
  async getModelById(id: string): Promise<AIModel | null> {
    const models = await this.getAllModels();
    return models.find(model => model.id === id) || null;
  }

  /**
   * 添加新模型
   */
  async addModel(formData: AIModelFormData): Promise<AIModel> {
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
      
      const models = await this.getAllModels();
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
      await saveModels(models);
      
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
  async updateModel(id: string, formData: AIModelFormData): Promise<AIModel> {
    const models = await this.getAllModels();
    const index = models.findIndex(model => model.id === id);
    if (index === -1) {
      throw new Error('模型不存在');
    }
    models[index] = {
      ...models[index],
      ...formData,
      updatedAt: Date.now(),
    };
    await saveModels(models);
    return models[index];
  }

  /**
   * 删除模型
   */
  async deleteModel(id: string): Promise<void> {
    const models = await this.getAllModels();
    const filteredModels = models.filter(model => model.id !== id);
    await saveModels(filteredModels);
    
    // 如果删除的是当前选中的模型，清除选中状态
    const selectedId = await getSelectedModelId();
    if (selectedId === id) {
      await saveSelectedModelId(null);
    }
  }

  /**
   * 设置选中的模型
   */
  async setSelectedModel(id: string | null): Promise<void> {
    await saveSelectedModelId(id);
  }

  /**
   * 获取选中的模型
   */
  async getSelectedModel(): Promise<AIModel | null> {
    const selectedId = await getSelectedModelId();
    if (!selectedId) {
      return null;
    }
    return await this.getModelById(selectedId);
  }
}

export const modelService = new ModelService();

