/**
 * 模型推理模块
 * 负责意图解析（调用模型API）功能
 * 
 * 新流程：
 * 1. 根据模型参数选择提示词提供者
 * 2. 调用通用API服务
 * 3. 根据模型参数选择解析器
 * 4. 解析响应
 */

import { DialogueFactory } from '@core/engine/dialogue/factory';
import { dialogueService } from '@core/engine/taskEngine/services/DialogueService';
import type { AIModel } from '@shared/types/Model';
import type { TaskAction } from '../../types/Task';
import { TASK_CONFIG } from '@shared/constants';

export interface ModelInferenceResult {
  action: TaskAction;
  response: string;
  streamContent: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
  }>;
}

/**
 * 模型推理模块
 */
export class ModelInferenceModule {
  /**
   * 调用模型获取操作指令
   * @param screenshotUri 截图数据 URI
   * @param instruction 任务指令
   * @param model 模型配置
   * @param conversationHistory 对话历史
   * @param onStreamUpdate 流式更新回调
   * @param timeoutMs 超时时间（毫秒）
   * @returns 操作指令和模型回复
   */
  async infer(
    screenshotUri: string,
    instruction: string,
    model: AIModel,
    conversationHistory?: ConversationMessage[],
    onStreamUpdate?: (content: string) => void,
    timeoutMs: number = TASK_CONFIG.API_TIMEOUT_MS
  ): Promise<ModelInferenceResult> {
    try {
      // 步骤1: 根据模型参数选择提示词提供者
      const promptProvider = DialogueFactory.getPromptProvider(model);
      const systemPrompt = await promptProvider.getSystemPrompt();

      // 步骤2: 调用通用API服务（不依赖特定模型）
      const apiPromise = dialogueService.callAPI({
        screenshotUri,
        task: instruction,
        model,
        systemPrompt,
        conversationHistory,
        onStreamUpdate,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('API调用超时')), timeoutMs)
      );

      const apiResponse = await Promise.race([apiPromise, timeoutPromise]);

      // 步骤3: 根据模型参数选择解析器
      const parser = DialogueFactory.getParser(model);

      // 步骤4: 解析响应（解析器内部会提取并输出思考过程）
      const action = await parser.parseAction(
        apiResponse.content,
        () => dialogueService.getScreenSize()
      );

      // 步骤5: 返回结果
      return {
        action,
        response: apiResponse.content,
        streamContent: apiResponse.streamContent || '',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`模型推理失败: ${errorMessage}`);
    }
  }
}

export const modelInferenceModule = new ModelInferenceModule();

