import type { DialogueParser } from '../../types/Parser';
import type { TaskAction } from '@core/engine/taskEngine/types/Task';
import { parseDoAction } from './ActionParser';
import { handleStreamingResponse } from './StreamParser';
import { getActionDescription } from '@core/engine/taskEngine/task/TaskExecutionHelpers';

/**
 * 提取模型的思考过程
 * @param responseText 模型响应文本
 * @returns 思考过程文本，如果没有则返回 null
 */
export function extractReasoning(responseText: string): string | null {
  // Open-AutoGLM 标准格式: <think>...</think><answer>...</answer>
  // 尝试从 <think> 标签中提取
  const reasoningMatch = responseText.match(/<think>(.*?)<\/redacted_reasoning>/s) ||
    responseText.match(/<think>(.*?)(?=<answer>|$)/s);
  
  if (reasoningMatch && reasoningMatch[1]) {
    return reasoningMatch[1].trim();
  }
  
  return null;
}

/**
 * Open-AutoGLM 解析器
 */
export class OpenAutoGLMParser implements DialogueParser {
  async parseAction(
    responseText: string,
    getScreenSize: () => Promise<{ width: number; height: number }>
  ): Promise<TaskAction> {
    // 解析动作
    const action = await parseDoAction(responseText, getScreenSize);
    return action;
  }

  async handleStreamingResponse(
    response: Response,
    onStreamUpdate?: (content: string) => void
  ): Promise<string> {
    return await handleStreamingResponse(response, onStreamUpdate);
  }
}

