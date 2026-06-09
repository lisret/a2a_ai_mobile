import React from 'react';
import Icon from 'react-native-vector-icons/FontAwesome';
import type { IconProps } from 'react-native-vector-icons/Icon';

interface CustomIconProps extends Omit<IconProps, 'name'> {
  name: string;
  size?: number;
  color?: string;
}

/**
 * 统一的图标组件
 * 使用 FontAwesome 图标库
 */
export const AppIcon: React.FC<CustomIconProps> = ({
  name,
  size = 20,
  color = '#165DFF',
  ...props
}) => {
  return <Icon name={name} size={size} color={color} {...props} />;
};

/**
 * 常用图标名称常量
 */
export const IconNames = {
  // 导航
  arrowLeft: 'arrow-left',
  arrowRight: 'arrow-right',
  close: 'times',
  menu: 'bars',
  plus: 'plus',
  chevronDown: 'chevron-down',
  chevronUp: 'chevron-up',
  
  // 操作
  edit: 'edit',
  delete: 'trash',
  save: 'save',
  cancel: 'times',
  check: 'check',
  send: 'paper-plane',
  
  // 状态
  success: 'check-circle',
  error: 'exclamation-circle',
  warning: 'exclamation-triangle',
  info: 'info-circle',
  
  // 功能
  robot: 'android', // 使用 android 图标作为机器人图标
  user: 'user-circle',
  settings: 'cog',
  list: 'list',
  history: 'history',
  chat: 'comments',
  task: 'tasks',
  model: 'microchip',
  clock: 'clock-o',
  timer: 'hourglass',
  folder: 'folder',
  home: 'home',
  
  // 其他
  empty: 'inbox',
  refresh: 'refresh',
  search: 'search',
  filter: 'filter',
  more: 'ellipsis-h',
  share: 'share-alt',
} as const;

