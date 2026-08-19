/**
 * NoNo 设计系统 token。
 * 与当前原型色板一致，但不替换全局 COLORS。
 */
export const NONO_COLORS = {
  ink: '#1B1D30',
  pearl: '#F8F7F3',
  cloud: '#F1EFFA',
  violet: '#756BF0',
  mint: '#8DF4E2',
  coral: '#FF9B79',
  white: '#FFFFFF',
  muted: '#77798A',
  danger: '#9D4C43',
} as const;

export const NONO_SPACING = {xs: 4, sm: 8, md: 16, lg: 24, xl: 32} as const;

export const NONO_RADII = {sm: 16, md: 20, lg: 24, pill: 999} as const;

export const NONO_MOTION = {pressMs: 160, tabMs: 280, stackMs: 320} as const;
