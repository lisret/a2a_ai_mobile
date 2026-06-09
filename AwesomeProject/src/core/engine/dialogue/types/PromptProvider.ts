/**
 * 提示词提供者接口
 * 每个模型实现都需要提供自己的提示词
 */
export interface PromptProvider {
  /**
   * 获取系统提示词
   * @returns 系统提示词字符串
   */
  getSystemPrompt(): Promise<string>;
}

