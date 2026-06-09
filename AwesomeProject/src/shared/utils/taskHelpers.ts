/**
 * 任务相关的工具函数
 */

import type { Task, TaskAction, TaskStatus } from '@core/engine/taskEngine';
import { COLORS } from '@shared/constants';

/**
 * 获取操作描述
 */
export function getActionDescription(action: TaskAction): string {
  switch (action.type) {
    case 'click':
      return `点击 (${action.x}, ${action.y})${action.requiresConfirmation ? ' [需确认]' : ''}`;
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
    case 'longPress':
      return `长按 (${action.x}, ${action.y})${action.requiresConfirmation ? ' [需确认]' : ''}`;
    case 'doubleTap':
      return `双击 (${action.x}, ${action.y})${action.requiresConfirmation ? ' [需确认]' : ''}`;
    case 'take_over':
      return `用户接管: ${action.takeOverMessage || '需要用户协助'}`;
    case 'record_search_box':
      return `记录搜索框位置: ${action.searchBoxPosition || ''}`;
    case 'wait':
      return `等待 ${action.duration || 500}ms`;
    case 'complete':
      return '完成';
    default:
      return '未知操作';
  }
}

/**
 * 获取任务状态颜色
 */
export function getStatusColor(status: TaskStatus): string {
  switch (status) {
    case 'success':
      return COLORS.success;
    case 'failed':
      return COLORS.error;
    case 'running':
      return COLORS.primaryLight;
    default:
      return COLORS.text.secondary;
  }
}

/**
 * 获取任务状态文本
 */
export function getStatusText(status: TaskStatus): string {
  switch (status) {
    case 'success':
      return '成功';
    case 'failed':
      return '失败';
    case 'running':
      return '执行中';
    case 'waiting':
      return '等待中';
    default:
      return '未知';
  }
}

/**
 * 获取任务标题（用于显示）
 */
export function getTaskTitle(task: Task, maxLength: number = 15): string {
  if (task.instruction.length <= maxLength) {
    return task.instruction;
  }
  return task.instruction.substring(0, maxLength) + '...';
}

