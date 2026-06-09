/**
 * UI配置
 * 所有UI展示相关的常量配置
 */

// 颜色主题
export const COLORS = {
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primaryLight: '#EFF6FF',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  text: {
    primary: '#111827',
    secondary: '#6B7280',
    disabled: '#9CA3AF',
  },
  background: {
    default: '#F3F4F6',
    card: '#FFFFFF',
    light: '#F9FAFB',
    blue: '#EFF6FF',
    red: '#FEF2F2',
  },
  border: {
    light: '#eee',
    medium: '#E5E7EB',
    dark: '#D1D5DB',
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
  { label: '给我在美团点一份销量最高的汉堡', value: '给我在美团点一份销量最高的汉堡' },
  { label: '给妈妈发微信说晚上回家吃饭', value: '给妈妈发微信说晚上回家吃饭' },
  { label: '给我在天猫超市买一包薯片', value: '给我在天猫超市买一包薯片' },
] as const;

// 导出样式规范
export * from './styles';

