/**
 * taskHelpers 工具函数单元测试
 */

import { getActionDescription, getStatusColor, getStatusText, getTaskTitle } from '../../utils/taskHelpers';
import type { TaskAction, TaskStatus, Task } from '../../core/engine/taskEngine';

describe('taskHelpers', () => {
  describe('getActionDescription', () => {
    it('应该正确描述点击操作', () => {
      const action: TaskAction = { type: 'click', x: 100, y: 200 };
      expect(getActionDescription(action)).toBe('点击 (100, 200)');
    });

    it('应该正确描述滑动操作', () => {
      const action: TaskAction = {
        type: 'swipe',
        startX: 100,
        startY: 200,
        endX: 300,
        endY: 400,
      };
      expect(getActionDescription(action)).toBe('滑动 (100, 200) -> (300, 400)');
    });

    it('应该正确描述输入操作', () => {
      const action: TaskAction = { type: 'input', text: '测试文本' };
      expect(getActionDescription(action)).toBe('输入: 测试文本');
    });

    it('应该正确描述返回操作', () => {
      const action: TaskAction = { type: 'back' };
      expect(getActionDescription(action)).toBe('返回');
    });

    it('应该正确描述等待操作', () => {
      const action: TaskAction = { type: 'wait', duration: 1000 };
      expect(getActionDescription(action)).toBe('等待 1000ms');
    });

    it('应该正确描述完成操作', () => {
      const action: TaskAction = { type: 'complete' };
      expect(getActionDescription(action)).toBe('完成');
    });
  });

  describe('getStatusColor', () => {
    it('应该返回成功状态的颜色', () => {
      expect(getStatusColor('success')).toBe('#10b981');
    });

    it('应该返回失败状态的颜色', () => {
      expect(getStatusColor('failed')).toBe('#dc2626');
    });

    it('应该返回运行中状态的颜色', () => {
      expect(getStatusColor('running')).toBe('#2563eb');
    });

    it('应该返回默认颜色', () => {
      expect(getStatusColor('waiting')).toBe('#86868b');
    });
  });

  describe('getStatusText', () => {
    it('应该返回成功状态的文本', () => {
      expect(getStatusText('success')).toBe('成功');
    });

    it('应该返回失败状态的文本', () => {
      expect(getStatusText('failed')).toBe('失败');
    });

    it('应该返回运行中状态的文本', () => {
      expect(getStatusText('running')).toBe('执行中');
    });

    it('应该返回等待状态的文本', () => {
      expect(getStatusText('waiting')).toBe('等待中');
    });
  });

  describe('getTaskTitle', () => {
    it('应该返回完整的短标题', () => {
      const task: Task = {
        id: 'task_1',
        modelId: 'model_1',
        instruction: '短标题',
        status: 'success',
        createdAt: Date.now(),
        output: { steps: [] },
      };
      expect(getTaskTitle(task, 15)).toBe('短标题');
    });

    it('应该截断长标题', () => {
      const task: Task = {
        id: 'task_1',
        modelId: 'model_1',
        instruction: '这是一个非常长的任务标题，应该被截断',
        status: 'success',
        createdAt: Date.now(),
        output: { steps: [] },
      };
      const title = getTaskTitle(task, 15);
      expect(title.length).toBe(18); // 15 + '...'
      expect(title).toContain('...');
    });
  });
});

