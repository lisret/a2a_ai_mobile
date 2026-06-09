/**
 * 统一的样式规范
 * 所有组件应使用此文件中的样式常量，确保应用样式统一
 */

// 颜色主题（从 index.ts 复制以避免循环依赖）
const COLORS = {
  primary: '#165DFF',
  primaryLight: '#2563eb',
  success: '#10b981',
  error: '#dc2626',
  warning: '#f59e0b',
  text: {
    primary: '#1d1d1f',
    secondary: '#86868b',
    disabled: '#9ca3af',
  },
  background: {
    default: '#f5f5f5',
    white: '#ffffff',
    card: '#ffffff',
    light: '#f9fafb',
    blue: '#f0f7ff',
    red: '#fef2f2',
  },
  border: {
    light: '#eee',
    medium: '#e5e7eb',
    dark: '#d1d5db',
  },
} as const;

/**
 * 字体大小规范
 */
export const FONT_SIZES = {
  xs: 10,
  sm: 12,
  base: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
} as const;

/**
 * 字体粗细规范
 */
export const FONT_WEIGHTS = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
} as const;

/**
 * 间距规范（基于 4px 网格系统）
 */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
} as const;

/**
 * 圆角规范
 */
export const BORDER_RADIUS = {
  none: 0,
  sm: 4,
  base: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

/**
 * 图标大小规范
 */
export const ICON_SIZES = {
  xs: 12,
  sm: 14,
  base: 16,
  md: 18,
  lg: 20,
  xl: 24,
  '2xl': 32,
} as const;

/**
 * 按钮高度规范
 */
export const BUTTON_HEIGHTS = {
  sm: 32,
  base: 40,
  md: 44,
  lg: 48,
} as const;

/**
 * 输入框高度规范
 */
export const INPUT_HEIGHTS = {
  sm: 32,
  base: 40,
  md: 44,
  lg: 48,
} as const;

/**
 * 阴影规范
 */
export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  base: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;

/**
 * 常用样式组合
 */
export const COMMON_STYLES = {
  // 容器
  container: {
    flex: 1,
    backgroundColor: COLORS.background.default,
  },
  
  // 卡片
  card: {
    backgroundColor: COLORS.background.card,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.base,
    ...SHADOWS.base,
  },
  
  // 按钮基础样式
  buttonBase: {
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: BUTTON_HEIGHTS.base,
    paddingHorizontal: SPACING.base,
  },
  
  // 主要按钮
  buttonPrimary: {
    backgroundColor: COLORS.primary,
  },
  
  // 次要按钮
  buttonSecondary: {
    backgroundColor: COLORS.background.light,
  },
  
  // 危险按钮
  buttonDanger: {
    backgroundColor: COLORS.error,
  },
  
  // 输入框基础样式
  inputBase: {
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.base,
    color: COLORS.text.primary,
    backgroundColor: COLORS.background.card,
  },
  
  // 文本样式
  textPrimary: {
    fontSize: FONT_SIZES.base,
    color: COLORS.text.primary,
  },
  
  textSecondary: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.secondary,
  },
  
  textDisabled: {
    fontSize: FONT_SIZES.base,
    color: COLORS.text.disabled,
  },
  
  // 标题样式
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text.primary,
  },
  
  subtitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.text.primary,
  },
} as const;

