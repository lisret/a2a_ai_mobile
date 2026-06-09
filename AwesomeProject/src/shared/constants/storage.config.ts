/**
 * 存储配置
 * 所有存储相关的常量配置（AsyncStorage键名等）
 */

// 存储键名
export const STORAGE_KEYS = {
  /** 模型列表存储键 */
  MODELS: '@autoglm:models',
  
  /** 选中的模型存储键 */
  SELECTED_MODEL: '@autoglm:selectedModel',
  
  /** 任务列表存储键 */
  TASKS: '@autoglm:tasks',
  
  /** 按模型分组的任务存储键前缀 */
  TASKS_BY_MODEL_PREFIX: '@autoglm:tasks:model:',
  
  /** ADB回退启用状态存储键 */
  ADB_FALLBACK_ENABLED: '@autoglm:adbFallbackEnabled',
  
  /** 后台运行启用状态存储键 */
  BACKGROUND_RUN_ENABLED: '@autoglm:backgroundRunEnabled',
  
  /** 任务完成提示音启用状态存储键 */
  TASK_COMPLETION_SOUND_ENABLED: '@autoglm:task_completion_sound_enabled',
  
  /** 调试日志存储键 */
  DEBUG_LOG: '@autoglm:debug_logs',
  
  /** 设置相关存储键前缀 */
  SETTINGS_PREFIX: '@autoglm:settings:',
  
  /** ADB回退启用设置键 */
  SETTINGS_ADB_FALLBACK_ENABLED: '@autoglm:settings:adb_fallback_enabled',
  
  /** 后台运行启用设置键 */
  SETTINGS_BACKGROUND_RUN_ENABLED: '@autoglm:settings:background_run_enabled',
  
  /** 任务完成提示音启用设置键 */
  SETTINGS_TASK_COMPLETION_SOUND_ENABLED: '@autoglm:settings:task_completion_sound_enabled',
  
  /** 权限状态存储键前缀 */
  PERMISSION_STATUS_PREFIX: '@autoglm:permission_status:',
  
  /** 无障碍服务权限状态存储键 */
  PERMISSION_ACCESSIBILITY_STATUS: '@autoglm:permission_status:accessibility',
  
  /** 通知权限状态存储键 */
  PERMISSION_NOTIFICATION_STATUS: '@autoglm:permission_status:notification',
  
  /** 权限最后检查时间存储键前缀 */
  PERMISSION_LAST_CHECK_PREFIX: '@autoglm:permission_last_check:',
  
  /** 无障碍服务权限最后检查时间存储键 */
  PERMISSION_ACCESSIBILITY_LAST_CHECK: '@autoglm:permission_last_check:accessibility',
} as const;

