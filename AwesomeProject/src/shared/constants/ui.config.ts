/**
 * UI配置
 * 所有UI展示相关的常量配置
 */

// 颜色主题（对齐 NoNo 原型）
export const COLORS = {
  primary: '#756bf0',
  primaryDark: '#1b1d30',
  primaryLight: '#ebe8ff',
  ink: '#1b1d30',
  pearl: '#f8f7f3',
  cloud: '#f1effa',
  violet: '#756bf0',
  mint: '#8df4e2',
  coral: '#ff9b79',
  success: '#267568',
  warning: '#ff9b79',
  error: '#a94e40',
  text: {
    primary: '#202231',
    secondary: '#777a88',
    disabled: '#a2a4ad',
  },
  background: {
    default: '#f8f7f3',
    card: '#ffffff',
    light: '#f1effa',
    blue: '#ebe8ff',
    red: '#fff0ec',
  },
  border: {
    light: '#f1effa',
    medium: '#e8e7ed',
    dark: '#d8d7df',
  },
} as const;

// 阴影样式
export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 3,
  },
  default: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
} as const;

// UI尺寸常量
export const UI_DIMENSIONS = {
  /** 历史面板宽度 */
  HISTORY_PANEL_WIDTH: 280,
  
  /** 导航栏高度 */
  NAVBAR_HEIGHT: 48,
  
  /** 输入框最大长度 */
  INPUT_MAX_LENGTH: 500,
  
  /** 聊天消息最大宽度 */
  CHAT_MESSAGE_MAX_WIDTH: '80%',
  
  /** 任务标题最大长度 */
  TASK_TITLE_MAX_LENGTH: 15,
} as const;

// 兼容旧代码：UI_CONFIG 作为 UI_DIMENSIONS 的别名
export const UI_CONFIG = UI_DIMENSIONS;

// UI动画配置
export const UI_ANIMATIONS = {
  /** 默认动画时长（毫秒） */
  DEFAULT_DURATION_MS: 300,
  
  /** 快速动画时长（毫秒） */
  FAST_DURATION_MS: 150,
  
  /** 慢速动画时长（毫秒） */
  SLOW_DURATION_MS: 500,
} as const;

// 首页快捷指令配置
export interface SuggestionItem {
  label: string;
  value: string;
}

export const HOME_SUGGESTIONS: readonly SuggestionItem[] = [
  { label: '帮我查找附近评分高的咖啡店', value: '帮我查找附近评分高的咖啡店' },
  { label: '整理今天收到的重要通知', value: '整理今天收到的重要通知' },
  { label: '比较三个购物平台的耳机价格', value: '比较三个购物平台的耳机价格' },
] as const;

export const HOME_QUICK_TASKS: readonly SuggestionItem[] = [
  { label: '智能比价', value: '智能比价：跨应用查找更合适的价格' },
  { label: '行程助手', value: '行程助手：规划路线并在关键步骤确认' },
  { label: '信息整理', value: '信息整理：读取页面并提取重点' },
  { label: '重复操作', value: '重复操作：把固定流程交给 NoNo' },
] as const;

// 导出样式规范
export * from './styles';

