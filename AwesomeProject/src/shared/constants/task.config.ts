/**
 * 任务执行配置
 * 所有任务执行相关的常量配置
 */

// 任务执行基础配置
export const TASK_CONFIG = {
  /** 最大执行步数 */
  MAX_STEPS: 50,
  
  /** 最大连续错误次数 */
  MAX_CONSECUTIVE_ERRORS: 3,
  
  /** API请求超时时间（毫秒） */
  API_TIMEOUT_MS: 60000,
  
  /** 第一次API请求超时时间（毫秒） */
  FIRST_API_TIMEOUT_MS: 60000,
  
  /** 截图超时时间（毫秒） */
  SCREENSHOT_TIMEOUT_MS: 5000,
  
  /** 操作后等待时间（毫秒） */
  ACTION_WAIT_DURATION: 300,
  
  /** 切换到后台后的延迟时间（毫秒） */
  BACKGROUND_DELAY_MS: 500,
  
  /** 最大任务记录数 */
  MAX_TASKS: 100,
} as const;

// 任务执行超时配置
export const TASK_TIMEOUT_CONFIG = {
  /** 用户确认超时时间（毫秒） */
  CONFIRMATION_TIMEOUT_MS: 30000, // 30秒

  /** 用户选择超时时间（毫秒） */
  INTERACT_TIMEOUT_MS: 60000, // 60秒

  /** 用户接管超时时间（毫秒） */
  TAKE_OVER_TIMEOUT_MS: 300000, // 5分钟

  /** 错误后等待时间（毫秒） */
  ERROR_RETRY_DELAY_MS: 500,

  /** 界面更新等待时间（毫秒） */
  UI_UPDATE_DELAY_MS: 300,
} as const;

// 任务重试配置
export const TASK_RETRY_CONFIG = {
  /** 最大重试次数 */
  MAX_RETRIES: 3,
  
  /** 重试延迟时间（毫秒） */
  RETRY_DELAY_MS: 500,
} as const;

