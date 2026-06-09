/**
 * formatters 工具函数单元测试
 */

import { formatTime, truncateText } from '../../utils/formatters';

describe('formatters', () => {
  describe('formatTime', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-01T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('应该返回"刚刚"对于1分钟内的时间', () => {
      const timestamp = new Date('2024-01-01T11:59:30Z').getTime();
      expect(formatTime(timestamp)).toBe('刚刚');
    });

    it('应该返回分钟前', () => {
      const timestamp = new Date('2024-01-01T11:50:00Z').getTime();
      expect(formatTime(timestamp)).toContain('分钟前');
    });

    it('应该返回今天的时间', () => {
      const timestamp = new Date('2024-01-01T10:00:00Z').getTime();
      expect(formatTime(timestamp)).toContain('今天');
    });

    it('应该返回昨天的时间', () => {
      const timestamp = new Date('2023-12-31T10:00:00Z').getTime();
      expect(formatTime(timestamp)).toContain('昨天');
    });

    it('应该返回天数前', () => {
      const timestamp = new Date('2023-12-30T10:00:00Z').getTime();
      expect(formatTime(timestamp)).toContain('天前');
    });

    it('应该返回完整日期格式', () => {
      const timestamp = new Date('2023-12-20T10:00:00Z').getTime();
      const formatted = formatTime(timestamp);
      expect(formatted).toMatch(/\d{2}\/\d{2}/);
    });
  });

  describe('truncateText', () => {
    it('应该返回完整文本如果长度未超过限制', () => {
      const text = '短文本';
      expect(truncateText(text, 10)).toBe('短文本');
    });

    it('应该截断长文本', () => {
      const text = '这是一个非常长的文本，应该被截断';
      const truncated = truncateText(text, 10);
      expect(truncated.length).toBe(13); // 10 + '...'
      expect(truncated).toContain('...');
      expect(truncated.substring(0, 10)).toBe('这是一个非常长的文本，应该被');
    });

    it('应该处理空字符串', () => {
      expect(truncateText('', 10)).toBe('');
    });

    it('应该处理等于限制长度的文本', () => {
      const text = '1234567890';
      expect(truncateText(text, 10)).toBe('1234567890');
    });
  });
});

