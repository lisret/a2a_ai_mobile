import type { AIModel } from '@shared/types/Model';
import { accessibilityService } from '@core/ability';
import { AUTOGLM_CONFIG } from '@shared/constants';
import type { AutoGLMRequest, AutoGLMResponse } from '../types/Task';
import { handleStreamingResponse, parseStreamingResponse } from '@core/engine/dialogue/openAutoGML/parsers/StreamParser';

/**
 * 对话消息
 */
export interface DialogueMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
  }>;
}

/**
 * API调用请求
 */
export interface DialogueAPICallRequest {
  screenshotUri: string;              // 截图URI
  task: string;                        // 任务指令（首次调用）
  model: AIModel;                     // 模型配置
  systemPrompt: string;               // 系统提示词（由调用方提供）
  conversationHistory?: DialogueMessage[];  // 对话历史
  onStreamUpdate?: (content: string) => void;  // 流式更新回调
}

/**
 * API调用响应
 */
export interface DialogueAPICallResponse {
  content: string;           // 模型返回的原始文本
  streamContent?: string;     // 流式内容（如果有）
}

/**
 * 通用API调用服务
 * 不依赖特定模型格式，只负责HTTP请求
 */
class DialogueService {
  // 缓存屏幕分辨率，避免每次都查询
  private cachedScreenSize: { width: number; height: number } | null = null;
  private cachedScreenSizeTimestamp: number = 0;
  private readonly SCREEN_SIZE_CACHE_TTL_MS = 60000; // 缓存有效期：60秒

  /**
   * 获取屏幕分辨率（带缓存和过期检查）
   */
  async getScreenSize(): Promise<{ width: number; height: number }> {
    const now = Date.now();
    
    // 检查缓存是否有效（60秒内有效）
    if (this.cachedScreenSize && (now - this.cachedScreenSizeTimestamp) < this.SCREEN_SIZE_CACHE_TTL_MS) {
      return this.cachedScreenSize;
    }

    try {
      const size = await accessibilityService.getScreenSize();
      this.cachedScreenSize = size;
      this.cachedScreenSizeTimestamp = now;
      console.info(`[DialogueService] 屏幕分辨率已更新: ${size.width}x${size.height}`);
      return size;
    } catch (error) {
      console.warn('[DialogueService] 获取屏幕分辨率失败，使用默认值:', error);
      const defaultSize = AUTOGLM_CONFIG.DEFAULT_SCREEN_SIZE;
      this.cachedScreenSize = defaultSize;
      this.cachedScreenSizeTimestamp = now;
      return defaultSize;
    }
  }

  /**
   * 清除屏幕分辨率缓存（用于屏幕方向改变等情况）
   */
  clearScreenSizeCache(): void {
    this.cachedScreenSize = null;
    this.cachedScreenSizeTimestamp = 0;
    console.info('[DialogueService] 屏幕分辨率缓存已清除');
  }

  /**
   * 验证截图是否有效（不是 1x1 占位符）
   */
  private isValidScreenshot(imageUri: string): boolean {
    // 检查是否是已知的 1x1 占位符
    const placeholder1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    
    if (imageUri === placeholder1x1) {
      return false;
    }
    
    // 检查 base64 字符串长度（1x1 透明 PNG 的 base64 长度很短）
    if (imageUri.startsWith('data:image/')) {
      const base64Index = imageUri.indexOf('base64,');
      if (base64Index !== -1) {
        const base64Data = imageUri.substring(base64Index + 7);
        // 1x1 透明 PNG 的 base64 长度约为 68 字符
        // 正常的截图 base64 长度应该远大于这个值（至少几千字符）
        if (base64Data.length < 100) {
          return false;
        }
      }
    } else {
      // 如果不是 data URI，检查原始 base64 长度
      if (imageUri.length < 100) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * 将截图转换为base64
   */
  private async imageToBase64(imageUri: string): Promise<string> {
    // 先验证截图是否有效
    if (!this.isValidScreenshot(imageUri)) {
      throw new Error('截图无效：截图失败或返回了占位符图像。请检查无障碍服务或 ADB 权限是否已正确配置。');
    }
    
    if (imageUri.startsWith('data:image/')) {
      const base64Index = imageUri.indexOf('base64,');
      if (base64Index !== -1) {
        return imageUri.substring(base64Index + 7);
      }
    }
    return imageUri;
  }

  /**
   * 规范化 API URL
   */
  private normalizeApiUrl(apiUrl: string): string {
    let url = apiUrl.trim();
    url = url.replace(/\/+$/, '');

    if (url.endsWith('/v1')) {
      return url;
    }

    if (url.endsWith('/v4') || url.includes('bigmodel.cn')) {
      return url;
    }

    if (url.includes('/api')) {
      return url;
    }

    return `${url}/v1`;
  }

  /**
   * 调用模型API
   * @param request API调用请求
   * @returns API调用响应
   */
  async callAPI(request: DialogueAPICallRequest): Promise<DialogueAPICallResponse> {
    try {
      const imageBase64 = await this.imageToBase64(request.screenshotUri);
      const apiUrl = this.normalizeApiUrl(request.model.apiUrl);
      
      if (!request.model.modelName || !request.model.modelName.trim()) {
        throw new Error('模型名称不能为空，请填写ModelScope Model-Id（如：ZhipuAI/AutoGLM-Phone-9B）');
      }
      const modelName = request.model.modelName.trim();

      // 判断是否是第一次步骤
      const isFirstStep = !request.conversationHistory || request.conversationHistory.length === 0 || 
        (request.conversationHistory.length === 1 && request.conversationHistory[0].role === 'system');

      // 构建消息列表
      const messages: AutoGLMRequest['messages'] = [];

      // 添加系统提示词（每一步都需要，确保模型始终记住规则）
      // 注意：虽然对话历史中可能包含系统消息，但为了确保系统提示词始终在消息列表的第一位，
      // 并且是最新的（可能包含动态内容如搜索框位置），我们在每一步都添加系统提示词
      if (request.systemPrompt) {
        messages.push({
          role: 'system',
          content: request.systemPrompt,
        });
      }

      // 添加对话历史（过滤掉系统消息，因为我们已经在上方添加了最新的系统提示词）
      if (request.conversationHistory && request.conversationHistory.length > 0) {
        const historyMessages = request.conversationHistory.filter(msg => msg.role !== 'system');
        messages.push(...historyMessages);
      }

      // 构建当前步骤的用户消息
      const screenInfo = '';
      const currentStepText = isFirstStep
        ? `${request.task}${screenInfo ? `\n\n${screenInfo}` : ''}`
        : `** Screen Info **${screenInfo ? `\n\n${screenInfo}` : ''}`;

      const currentUserMessage = {
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: currentStepText,
          },
          {
            type: 'image_url' as const,
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
            },
          },
        ],
      };
      
      messages.push(currentUserMessage);

      // 构建请求参数
      const apiRequest: AutoGLMRequest = {
        model: modelName,
        messages,
        temperature: AUTOGLM_CONFIG.API_REQUEST.TEMPERATURE,
        max_tokens: AUTOGLM_CONFIG.API_REQUEST.MAX_TOKENS,
        top_p: AUTOGLM_CONFIG.API_REQUEST.TOP_P,
        frequency_penalty: AUTOGLM_CONFIG.API_REQUEST.FREQUENCY_PENALTY,
      };

      // 调用API
      const requestBody = JSON.stringify(apiRequest);
      const startTime = Date.now();
      
      let response: Response;
      try {
        response = await fetch(`${apiUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${request.model.apiKey}`,
          },
          body: requestBody,
        });
      } catch (fetchError) {
        const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
        console.error('[DialogueService] 网络连接失败:', errorMessage, 'API URL:', apiUrl);
        
        if (apiUrl.includes('127.0.0.1') || apiUrl.includes('localhost')) {
          throw new Error(
            `无法连接到本地服务 ${apiUrl}。\n` +
            `在 Android 设备上，127.0.0.1 指向设备本身，无法访问开发机器上的服务。\n` +
            `解决方案：\n` +
            `1. 如果使用本地服务，请使用开发机器的实际 IP 地址（如 http://192.168.1.100:11434/v1）\n` +
            `2. 如果使用云端服务，请检查 API URL 配置是否正确`
          );
        }
        
        if (errorMessage.includes('Network request failed') || 
            errorMessage.includes('Failed to connect') ||
            errorMessage.includes('Connection refused') ||
            errorMessage.includes('Cannot connect')) {
          throw new Error(
            `无法连接到 API 服务器：${apiUrl}\n` +
            `可能原因：\n` +
            `1. API 服务器未运行或无法访问\n` +
            `2. 网络连接问题\n` +
            `3. API URL 配置错误\n` +
            `请检查 API URL 配置和网络连接`
          );
        }
        
        throw new Error(`网络连接失败: ${errorMessage}`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      if (!response.ok) {
        let errorMessage = `API调用失败: ${response.status} ${response.statusText}`;
        
        try {
          const errorText = await response.text();
          if (errorText) {
            try {
              const errorJson = JSON.parse(errorText);
              if (errorJson.error) {
                const errorDetail = errorJson.error;
                const errorCode = errorDetail.code || '';
                const errorMsg = errorDetail.message || errorText;
                errorMessage = `API调用失败: ${response.status} - ${errorCode ? `[${errorCode}] ` : ''}${errorMsg}`;
                
                if (errorMsg.includes('Cannot connect') || errorMsg.includes('Connection failed')) {
                  if (apiUrl.includes('127.0.0.1') || apiUrl.includes('localhost')) {
                    errorMessage = `无法连接到本地服务 ${apiUrl}。\n` +
                      `在 Android 设备上，127.0.0.1 指向设备本身，无法访问开发机器上的服务。\n` +
                      `请使用开发机器的实际 IP 地址（如 http://192.168.1.100:11434/v1）`;
                  } else {
                    errorMessage = `无法连接到 API 服务器：${apiUrl}\n` +
                      `错误详情：${errorMsg}\n` +
                      `请检查 API URL 配置和网络连接`;
                  }
                }
              } else {
                errorMessage = `API调用失败: ${response.status} - ${errorText}`;
              }
            } catch {
              errorMessage = `API调用失败: ${response.status} - ${errorText}`;
            }
          }
        } catch (textError) {
          console.error('[DialogueService] 读取错误响应失败:', textError);
        }
        
        console.error('[DialogueService] API调用失败:', response.status, response.statusText, errorMessage);
        throw new Error(errorMessage);
      }

      // 检查响应类型（流式或非流式）
      const contentType = response.headers.get('content-type') || '';
      const isStreaming = contentType.includes('text/event-stream') ||
        contentType.includes('text/plain');

      let responseText: string;
      let streamContent = '';

      if (isStreaming || contentType.includes('text/event-stream')) {
        // 流式响应处理（使用 StreamParser）
        responseText = await handleStreamingResponse(response, (content) => {
          streamContent = content;
          request.onStreamUpdate?.(content);
        });
      } else {
        // 非流式响应
        responseText = await response.text();
      }

      // 解析响应（通用逻辑，不包含模型特定的解析）
      let data: AutoGLMResponse;
      try {
        data = JSON.parse(responseText);
      } catch (jsonError) {
        // 尝试解析流式格式（响应可能不是 text/event-stream 但内容是流式格式）
        const isStreamingContent = responseText.includes('chat.completion.chunk') ||
          responseText.includes('"delta"') ||
          (responseText.split('\n').length > 1 && responseText.split('\n').some(line => {
            const trimmed = line.trim();
            if (!trimmed) return false;
            try {
              const json = JSON.parse(trimmed);
              return json.object === 'chat.completion.chunk' ||
                json.choices?.[0]?.delta;
            } catch {
              return false;
            }
          }));
        
        if (isStreamingContent) {
          // 使用 StreamParser 解析流式响应
          try {
            data = parseStreamingResponse(responseText);
            // 从解析后的数据中提取内容
            streamContent = data.choices[0]?.message?.content || '';
            if (streamContent && request.onStreamUpdate) {
              request.onStreamUpdate(streamContent);
            }
          } catch (streamError) {
            console.error('[DialogueService] 流式响应解析失败:', streamError);
            throw new Error(`流式响应解析失败: ${streamError instanceof Error ? streamError.message : String(streamError)}`);
          }
        } else {
          throw new Error(`API 响应不是有效的 JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
        }
      }

      const content = data.choices[0]?.message?.content || '';

      if (!content) {
        console.error('[DialogueService] API 返回的内容为空');
        throw new Error('API 返回的内容为空');
      }

      return {
        content,
        streamContent: streamContent || content,
      };
    } catch (error) {
      console.error('[DialogueService] API调用失败:', error);
      throw error;
    }
  }
}

export const dialogueService = new DialogueService();

