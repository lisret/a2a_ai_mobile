/**
 * API配置
 * 所有API调用相关的常量配置
 */

// API请求配置
export const API_REQUEST_CONFIG = {
  /** 默认温度参数 */
  TEMPERATURE: 0.0,
  
  /** 最大token数 */
  MAX_TOKENS: 6000,
  
  /** Top-p参数 */
  TOP_P: 0.85,
  
  /** 频率惩罚参数 */
  FREQUENCY_PENALTY: 0.5,
} as const;

// API超时配置
export const API_TIMEOUT_CONFIG = {
  /** 默认API超时时间（毫秒） */
  DEFAULT_TIMEOUT_MS: 60000, // 60秒
  
  /** 第一次请求超时时间（毫秒） */
  FIRST_REQUEST_TIMEOUT_MS: 60000, // 60秒
} as const;

// 导出API提供商配置
export * from './apiProviders';

