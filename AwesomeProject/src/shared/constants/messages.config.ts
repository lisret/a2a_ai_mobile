/**
 * 消息配置
 * 所有消息文本相关的常量配置（错误消息、UI消息等）
 */

// 错误消息
export const ERROR_MESSAGES = {
  /** 无障碍服务未启用 */
  ACCESSIBILITY_NOT_ENABLED: '无障碍服务未启用，请先到系统设置中启用无障碍服务',
  
  /** ADB模块不可用 */
  ADB_NOT_AVAILABLE: 'ADB模块不可用，请确保已正确注册Native Module。如果已启用ADB回退，请重新构建应用。',
  
  /** ADB模块不可用（截图） */
  ADB_NOT_AVAILABLE_SCREENSHOT: 'ADB模块不可用，无法执行截图',
  
  /** 任务数据为空 */
  TASK_DATA_EMPTY: '任务数据为空',
  
  /** 解析任务数据失败 */
  TASK_DATA_PARSE_FAILED: '解析任务数据失败',
} as const;

// UI消息
export const UI_MESSAGES = {
  /** 默认确认消息 */
  DEFAULT_CONFIRMATION_MESSAGE: '此操作涉及敏感信息（支付、隐私等），是否继续？',
} as const;

// 提示词配置
export const PROMPT_CONFIG = {
  /** 星期名称（中文） */
  WEEKDAY_NAMES: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] as const,
} as const;

