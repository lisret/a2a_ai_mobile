/**
 * AI模型配置数据结构
 */
export interface AIModel {
  provider: string;
  id: string;                    // 唯一标识
  name: string;                  // 模型名称
  apiUrl: string;                // API 地址
  apiKey: string;                // API 密钥（加密存储）
  description?: string;           // 模型描述
  modelName?: string;             // 模型名称（如 "autoglm-phone-9b"）
  maxSteps?: number;              // 最大运行步骤数，默认99
  createdAt: number;             // 创建时间戳
  updatedAt: number;             // 更新时间戳
}

/**
 * 模型表单数据（用于新增/编辑）
 */
export interface AIModelFormData {
  name: string;
  provider: string;              // 服务提供商
  apiUrl: string;
  apiKey: string;
  description?: string;
  modelName?: string;
  maxSteps?: number;              // 最大运行步骤数，默认99
}

