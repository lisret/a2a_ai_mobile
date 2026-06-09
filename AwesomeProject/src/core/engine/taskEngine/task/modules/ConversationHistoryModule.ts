/**
 * 对话历史管理模块
 * 负责维护和管理对话历史（上下文）
 */

import type { ConversationMessage } from './ModelInferenceModule';

/**
 * 对话历史管理模块
 */
export class ConversationHistoryModule {
  private history: ConversationMessage[] = [];

  /**
   * 获取对话历史
   */
  getHistory(): ConversationMessage[] {
    return [...this.history];
  }

  /**
   * 添加用户消息
   * @param content 消息内容
   * @param screenshotUri 截图 URI（可选）
   */
  addUserMessage(content: string, screenshotUri?: string): void {
    const message: ConversationMessage = {
      role: 'user',
      content: screenshotUri
        ? [
            { type: 'text', text: content },
            { type: 'image_url', image_url: { url: screenshotUri } },
          ]
        : content,
    };
    this.history.push(message);
  }

  /**
   * 添加助手消息（模型回复）
   * @param content 消息内容
   */
  addAssistantMessage(content: string): void {
    const message: ConversationMessage = {
      role: 'assistant',
      content,
    };
    this.history.push(message);
  }

  /**
   * 添加系统消息
   * @param content 消息内容
   */
  addSystemMessage(content: string): void {
    const message: ConversationMessage = {
      role: 'system',
      content,
    };
    this.history.push(message);
  }

  /**
   * 清除对话历史
   */
  clear(): void {
    this.history = [];
  }

  /**
   * 获取历史长度
   */
  getLength(): number {
    return this.history.length;
  }

  /**
   * 判断是否是第一次步骤
   */
  isFirstStep(): boolean {
    return (
      this.history.length === 0 ||
      (this.history.length === 1 && this.history[0].role === 'system')
    );
  }
}

