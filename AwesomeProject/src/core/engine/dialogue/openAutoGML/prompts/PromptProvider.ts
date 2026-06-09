import type { PromptProvider } from '../../types/PromptProvider';
import { getSystemPrompt as getOpenAutoGLMPrompt } from './prompts_zh';

/**
 * Open-AutoGLM 提示词提供者
 */
export class OpenAutoGLMPromptProvider implements PromptProvider {
  async getSystemPrompt(): Promise<string> {
    return await getOpenAutoGLMPrompt();
  }
}

