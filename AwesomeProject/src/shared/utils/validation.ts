/**
 * 验证URL格式
 * 使用正则表达式验证，兼容 React Native 环境（不使用 URL API）
 */
export function isValidUrl(url: string): boolean {
  try {
    // 去除首尾空格
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      return false;
    }
    
    // 使用正则表达式验证 URL 格式（兼容 React Native）
    // 匹配 http:// 或 https:// 开头的 URL，后面必须有内容
    const urlPattern = /^https?:\/\/.+/;
    
    if (!urlPattern.test(trimmedUrl)) {
      return false;
    }
    
    // 进一步验证：检查是否有有效的主机名
    // 格式：协议://主机名[:端口][/路径]
    const urlMatch = trimmedUrl.match(/^https?:\/\/([^\/\s:]+)(?::(\d+))?(\/.*)?$/);
    
    if (!urlMatch || !urlMatch[1]) {
      return false;
    }
    
    const hostname = urlMatch[1];
    
    // 检查主机名是否有效（不能为空）
    if (!hostname || hostname.length === 0) {
      return false;
    }
    
    // 基本的主机名格式验证
    // 允许：域名（如 example.com）、IP地址（如 192.168.1.1）、localhost
    const isValidHostname = 
      /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(hostname) || // 域名
      /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || // IP 地址
      hostname === 'localhost' || // localhost
      /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?$/.test(hostname); // 简单主机名
    
    return isValidHostname;
  } catch (error) {
    // URL 验证失败
    console.error('URL 验证失败:', error, 'URL:', url);
    return false;
  }
}

/**
 * 验证模型表单数据
 */
export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateModelForm(data: {
  name: string;
  apiUrl: string;
  apiKey: string;
  modelName?: string;
  maxSteps?: number;
}): ValidationResult {
  const errors: Record<string, string> = {};

  if (!data.name || data.name.trim().length === 0) {
    errors.name = '备注不能为空';
  }

  if (!data.apiUrl || data.apiUrl.trim().length === 0) {
    errors.apiUrl = 'API地址不能为空';
  } else if (!isValidUrl(data.apiUrl)) {
    errors.apiUrl = '请输入有效的URL地址';
  } else {
    // 检查是否使用了 localhost 或 127.0.0.1（在 Android 设备上通常有问题）
    const trimmedUrl = data.apiUrl.trim().toLowerCase();
    if (trimmedUrl.includes('127.0.0.1') || trimmedUrl.includes('localhost')) {
      // 只给出警告，不阻止保存（允许用户使用，但给出提示）
      // 注意：这里不设置 errors，只是记录警告
      console.warn('[验证] 检测到使用 localhost/127.0.0.1，在 Android 设备上可能无法访问开发机器上的服务');
    }
  }

  if (!data.apiKey || data.apiKey.trim().length === 0) {
    errors.apiKey = 'API密钥不能为空';
  }

  if (!data.modelName || data.modelName.trim().length === 0) {
    errors.modelName = '模型名称不能为空';
  }

  // 验证最大步骤数
  if (data.maxSteps !== undefined && data.maxSteps !== null) {
    if (isNaN(data.maxSteps) || data.maxSteps < 1 || data.maxSteps > 200) {
      errors.maxSteps = '最大运行步骤数必须在1-200之间';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

