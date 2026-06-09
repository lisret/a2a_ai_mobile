/**
 * 模型列表服务
 * 用于从不同API提供商获取可用的模型列表
 * 通过调用各厂商的真实API接口获取模型列表
 */

import type { APIProvider } from '@shared/constants/apiProviders';

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}

/**
 * 处理 fetch 网络错误，提供友好的错误消息
 */
function handleFetchError(error: unknown, url: string): Error {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error('网络连接失败:', errorMessage, 'URL:', url);
  
  // 检查是否是 localhost/127.0.0.1 连接失败
  if (url.includes('127.0.0.1') || url.includes('localhost')) {
    return new Error(
      `无法连接到本地服务 ${url}。在 Android 设备上，127.0.0.1 指向设备本身，无法访问开发机器上的服务。请使用开发机器的实际 IP 地址。`
    );
  }
  
  // 检查是否是连接超时或网络错误
  if (errorMessage.includes('Network request failed') || 
      errorMessage.includes('Failed to connect') ||
      errorMessage.includes('Connection refused') ||
      errorMessage.includes('Cannot connect')) {
    return new Error(
      `无法连接到 API 服务器：${url}。请检查 API URL 配置和网络连接。`
    );
  }
  
  return new Error(`网络连接失败: ${errorMessage}`);
}

/**
 * 从API提供商获取模型列表
 * @param provider API提供商配置
 * @param apiKey API密钥（某些提供商需要）
 * @param apiUrl 自定义API地址（如果使用自定义提供商）
 * @returns 模型列表
 */
export async function fetchModelList(
  provider: APIProvider,
  apiKey?: string,
  apiUrl?: string
): Promise<ModelInfo[]> {
  const baseUrl = apiUrl || provider.baseUrl;
  
  // 如果API密钥为空，返回空列表
  if (!apiKey || !apiKey.trim()) {
    return [];
  }

  try {
    switch (provider.id) {
      case 'openai':
        return await fetchOpenAIModels(baseUrl, apiKey, 'openai');
      case 'deepseek':
        return await fetchDeepSeekModels(baseUrl, apiKey);
      case 'moonshot':
        return await fetchMoonshotModels(baseUrl, apiKey);
      case 'zhipu':
        return await fetchZhipuModels(baseUrl, apiKey);
      case 'modelscope':
        return await fetchModelScopeModels(baseUrl, apiKey);
      case 'anthropic':
        return await fetchAnthropicModels(baseUrl, apiKey);
      case 'custom':
        // 自定义提供商，尝试使用 OpenAI 兼容接口
        return await fetchOpenAIModels(baseUrl, apiKey, 'custom');
      default:
        return [];
    }
  } catch (error) {
    console.error(`获取 ${provider.name} 模型列表失败:`, error);
    // 返回空列表，允许用户手动输入
    return [];
  }
}

/**
 * 获取 OpenAI 模型列表
 * GET https://api.openai.com/v1/models
 * @param baseUrl API基础地址
 * @param apiKey API密钥
 * @param providerId 厂商ID（用于决定是否添加兜底模型）
 */
async function fetchOpenAIModels(baseUrl: string, apiKey: string, providerId: string = 'openai'): Promise<ModelInfo[]> {
  try {
    // 规范化 URL，确保以 /v1 结尾
    let url = baseUrl.trim().replace(/\/+$/, '');
    if (!url.endsWith('/v1')) {
      url = `${url}/v1`;
    }
    url = `${url}/models`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (fetchError) {
      throw handleFetchError(fetchError, url);
    }

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorText = await response.text();
        if (errorText) {
          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error?.message) {
              errorMessage = `${errorMessage} - ${errorJson.error.message}`;
            } else {
              errorMessage = `${errorMessage} - ${errorText}`;
            }
          } catch {
            errorMessage = `${errorMessage} - ${errorText}`;
          }
        }
      } catch {
        // 忽略读取错误响应的错误
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return parseModelListResponse(data, providerId);
  } catch (error) {
    console.error('获取 OpenAI 模型列表失败:', error);
    throw error;
  }
}

/**
 * 获取智谱AI模型列表
 * 智谱AI API: https://open.bigmodel.cn/api/paas/v4
 * 智谱AI 可能不支持 /models 端点，返回常用模型列表
 * 或者尝试调用 OpenAI 兼容接口
 */
async function fetchZhipuModels(baseUrl: string, apiKey: string): Promise<ModelInfo[]> {
  // 默认模型列表，始终放在最前面
  const defaultModels: ModelInfo[] = [
    { id: 'autoglm-phone', name: 'autoglm-phone', description: '智谱AI AutoGLM-Phone-9B 手机自动化模型（收费）' },
    { id: 'glm-4.5-flash', name: 'glm-4.5-flash', description: '智谱AI glm-4.5-flash 手机自动化模型（免费）' },
  ];

  try {
    // 智谱AI 的 baseUrl 是 https://open.bigmodel.cn/api/paas/v4
    // 尝试使用 OpenAI 兼容的 /models 端点
    let url = baseUrl.trim().replace(/\/+$/, '');
    
    // 如果 URL 以 /v4 结尾，尝试添加 /models
    if (url.endsWith('/v4')) {
      url = `${url}/models`;
    } else if (!url.endsWith('/models')) {
      // 否则尝试添加 /v1/models
      url = `${url}/v1/models`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      const apiModels = parseModelListResponse(data, 'zhipu');
      if (apiModels.length > 0) {
        // 将默认模型放在最前面，然后追加API返回的模型
        // 过滤掉API返回中与默认模型重复的项
        const defaultModelIds = new Set(defaultModels.map(m => m.id));
        const uniqueApiModels = apiModels.filter(m => !defaultModelIds.has(m.id));
        return [...defaultModels, ...uniqueApiModels];
      }
    }

    // 如果 API 调用失败或返回空列表，只返回默认模型
    return defaultModels;
  } catch (error) {
    console.error('获取智谱AI模型列表失败，返回默认模型列表:', error);
    // 即使API调用失败，也返回默认模型
    return defaultModels;
  }
}

/**
 * 获取 ModelScope 模型列表
 * ModelScope API: https://api-inference.modelscope.cn/v1
 * 使用 OpenAI 兼容的 /models 端点
 */
async function fetchModelScopeModels(baseUrl: string, apiKey: string): Promise<ModelInfo[]> {
  // 默认模型列表，始终放在最前面
  const defaultModels: ModelInfo[] = [
    { id: 'ZhipuAI/AutoGLM-Phone-9B', name: 'AutoGLM-Phone-9B', description: '智谱AI AutoGLM-Phone-9B 手机自动化模型（免费）' },
  ];

  try {
    // ModelScope 使用 OpenAI 兼容接口
    // 规范化 URL，确保以 /v1 结尾
    let url = baseUrl.trim().replace(/\/+$/, '');
    if (!url.endsWith('/v1')) {
      url = `${url}/v1`;
    }
    url = `${url}/models`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (fetchError) {
      throw handleFetchError(fetchError, url);
    }

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorText = await response.text();
        if (errorText) {
          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error?.message) {
              errorMessage = `${errorMessage} - ${errorJson.error.message}`;
            } else {
              errorMessage = `${errorMessage} - ${errorText}`;
            }
          } catch {
            errorMessage = `${errorMessage} - ${errorText}`;
          }
        }
      } catch {
        // 忽略读取错误响应的错误
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const apiModels = parseModelListResponse(data, 'modelscope');
    // 将默认模型放在最前面，然后追加API返回的模型
    // 过滤掉API返回中与默认模型重复的项
    const defaultModelIds = new Set(defaultModels.map(m => m.id));
    const uniqueApiModels = apiModels.filter(m => !defaultModelIds.has(m.id));
    return [...defaultModels, ...uniqueApiModels];
  } catch (error) {
    console.error('获取 ModelScope 模型列表失败，返回默认模型列表:', error);
    // 如果 API 调用失败，只返回默认模型
    return defaultModels;
  }
}

/**
 * 获取 DeepSeek 模型列表
 * DeepSeek 使用 OpenAI 兼容接口
 */
async function fetchDeepSeekModels(baseUrl: string, apiKey: string): Promise<ModelInfo[]> {
  try {
    // DeepSeek 使用 OpenAI 兼容接口
    return await fetchOpenAIModels(baseUrl, apiKey, 'deepseek');
  } catch (error) {
    console.error('获取 DeepSeek 模型列表失败:', error);
    throw error;
  }
}

/**
 * 获取 Moonshot 模型列表
 * Moonshot 使用 OpenAI 兼容接口
 */
async function fetchMoonshotModels(baseUrl: string, apiKey: string): Promise<ModelInfo[]> {
  try {
    // Moonshot 使用 OpenAI 兼容接口
    return await fetchOpenAIModels(baseUrl, apiKey, 'moonshot');
  } catch (error) {
    console.error('获取 Moonshot 模型列表失败:', error);
    throw error;
  }
}

/**
 * 获取 Anthropic 模型列表
 * Anthropic API: https://api.anthropic.com/v1
 * Anthropic 可能不支持 /models 端点，返回常用模型列表
 */
async function fetchAnthropicModels(baseUrl: string, apiKey: string): Promise<ModelInfo[]> {
  try {
    // 尝试调用 Anthropic 的模型列表接口
    let url = baseUrl.trim().replace(/\/+$/, '');
    if (!url.endsWith('/v1')) {
      url = `${url}/v1`;
    }
    url = `${url}/models`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      const models = parseModelListResponse(data, 'anthropic');
      if (models.length > 0) {
        return models;
      }
    }

    // 如果 API 调用失败或返回空列表，返回 Anthropic 常用模型
    return [];
  } catch (error) {
    console.error('获取 Anthropic 模型列表失败，返回默认模型列表:', error);
    // 即使API调用失败，也返回常用模型列表
    return [];
  }
}

/**
 * 将 ZhipuAI/AutoGLM-Phone-9B 模型放在列表第一位并标记为推荐
 * 只在智谱AI和ModelScope厂商时添加兜底模型
 * @param models 模型列表
 * @param providerId 厂商ID（'zhipu' | 'modelscope' | 其他）
 * @returns 排序后的模型列表（AutoGLM-Phone-9B 在第一位，如果支持）
 */
function prioritizeAutoGLM(models: ModelInfo[], providerId: string): ModelInfo[] {
  const autoGLMId = 'ZhipuAI/AutoGLM-Phone-9B';
  const autoGLMIndex = models.findIndex(model => model.id === autoGLMId);
  
  // 只在智谱AI和ModelScope时添加兜底模型
  const shouldAddFallback = providerId === 'zhipu' || providerId === 'modelscope';
  
  // 推荐的描述文本
  const recommendedDescription = '智谱AI AutoGLM-Phone-9B 手机自动化模型（推荐）';
  
  if (autoGLMIndex === -1) {
    // 如果列表中没有 AutoGLM-Phone-9B
    if (shouldAddFallback) {
      // 只在支持的厂商中添加兜底模型，并标记为推荐
      return [
        { id: autoGLMId, name: 'AutoGLM-Phone-9B', description: recommendedDescription },
        ...models,
      ];
    }
    // 其他厂商不添加兜底模型
    return models;
  }
  
  // 如果列表中已经有 AutoGLM-Phone-9B
  const autoGLMModel = models[autoGLMIndex];
  // 确保描述包含"（推荐）"标识
  const updatedAutoGLMModel: ModelInfo = {
    ...autoGLMModel,
    description: recommendedDescription,
  };
  
  // 移除原位置的模型
  const otherModels = models.filter((_, index) => index !== autoGLMIndex);
  
  // 放在第一位
  return [updatedAutoGLMModel, ...otherModels];
}

/**
 * 解析模型列表响应
 * 支持 OpenAI 兼容格式: { data: [{ id: "...", ... }, ...] }
 * 只在智谱AI和ModelScope时自动将 ZhipuAI/AutoGLM-Phone-9B 放在第一位
 * @param data API响应数据
 * @param providerId 厂商ID（'zhipu' | 'modelscope' | 其他）
 */
function parseModelListResponse(data: any, providerId: string): ModelInfo[] {
  let models: ModelInfo[] = [];
  
  if (data.data && Array.isArray(data.data)) {
    models = data.data
      .filter((model: any) => model.id && !model.id.includes('search') && !model.id.includes('similarity'))
      .map((model: any) => ({
        id: model.id,
        name: model.id,
        description: model.owned_by || model.organization || model.description || undefined,
      }))
      .sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
  } else if (Array.isArray(data)) {
    // 如果直接是数组
    models = data
      .filter((model: any) => model.id || model.name)
      .map((model: any) => ({
        id: model.id || model.name,
        name: model.name || model.id,
        description: model.description || model.owned_by || model.organization || undefined,
      }))
      .sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
  } else if (data.models && Array.isArray(data.models)) {
    // 如果响应格式是 { models: [...] }
    models = data.models
      .filter((model: any) => model.id || model.name)
      .map((model: any) => ({
        id: model.id || model.name,
        name: model.name || model.id,
        description: model.description || undefined,
      }))
      .sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
  }

  // 只在智谱AI和ModelScope时将 AutoGLM-Phone-9B 放在第一位
  return prioritizeAutoGLM(models, providerId);
}

