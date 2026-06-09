/**
 * 任务执行辅助函数
 */

import type { TaskAction } from '../types/Task';

/**
 * 获取操作描述
 */
export function getActionDescription(action: TaskAction): string {
  switch (action.type) {
    case 'click':
      return `点击 (${action.x}, ${action.y})`;
    case 'longPress':
      return `长按 (${action.x}, ${action.y})`;
    case 'doubleTap':
      return `双击 (${action.x}, ${action.y})`;
    case 'swipe':
      return `滑动 (${action.startX}, ${action.startY}) -> (${action.endX}, ${action.endY})`;
    case 'input':
      return `输入: ${action.text}`;
    case 'back':
      return '返回';
    case 'home':
      return '回到桌面';
    case 'launch':
      return `启动应用: ${action.app}`;
    case 'wait':
      return `等待 ${action.duration || 500}ms`;
    case 'take_over':
      return '用户接管';
    case 'record_search_box':
      return `记录搜索框位置: ${action.searchBoxPosition || ''}`;
    case 'complete':
      return `完成: ${action.message || '任务完成'}`;
    default:
      return '未知操作';
  }
}

