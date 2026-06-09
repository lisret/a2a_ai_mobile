/**
 * 常用AI模型API提供商配置
 */
export interface APIProvider {
  id: string;
  name: string;
  baseUrl: string;
  description?: string;
  exampleApiKey?: string;
}

/**
 * 预定义的API提供商列表
 */
export const API_PROVIDERS: APIProvider[] = [
  {
    id: 'zhipu',
    name: '智谱AI (GLM)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    description: '智谱AI开放平台，支持GLM系列模型',
    exampleApiKey: 'your-api-key-here',
  },
  {
    id: 'modelscope',
    name: '魔塔社区 (ModelScope)',
    baseUrl: 'https://api-inference.modelscope.cn/v1',
    description: '阿里云魔塔社区，支持通义千问等模型',
    exampleApiKey: 'your-api-key-here',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    description: 'OpenAI官方API，支持GPT系列模型',
    exampleApiKey: 'sk-...',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com/v1',
    description: 'Anthropic Claude API',
    exampleApiKey: 'sk-ant-...',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    description: 'DeepSeek AI API',
    exampleApiKey: 'sk-...',
  },
  {
    id: 'moonshot',
    name: 'Moonshot AI',
    baseUrl: 'https://api.moonshot.cn/v1',
    description: 'Moonshot AI API',
    exampleApiKey: 'sk-...',
  },
  {
    id: 'custom',
    name: '自定义',
    baseUrl: '',
    description: '手动输入API地址',
  },
];

/**
 * 根据ID获取API提供商
 */
export function getProviderById(id: string): APIProvider | undefined {
  return API_PROVIDERS.find(provider => provider.id === id);
}

/**
 * 获取默认提供商（智谱AI）
 */
export function getDefaultProvider(): APIProvider {
  return API_PROVIDERS[0];
}

