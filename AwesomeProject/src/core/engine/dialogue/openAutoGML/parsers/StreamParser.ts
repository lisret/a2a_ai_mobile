/**
 * AutoGLM 流式响应解析器
 * 处理流式响应（Server-Sent Events 格式）的解析
 */

import type { AutoGLMResponse } from '../../../taskEngine/types/Task';

/**
 * 从 buffer 中提取完整的 JSON 对象
 * 处理多个 JSON 对象直接拼接的情况（没有分隔符）
 */
export function extractJsonObjects(buffer: string): { jsonObjects: string[]; remaining: string } {
  const jsonObjects: string[] = [];
  let remaining = buffer;
  let startIndex = 0;

  while (startIndex < remaining.length) {
    // 跳过空白字符
    while (startIndex < remaining.length && /\s/.test(remaining[startIndex])) {
      startIndex++;
    }

    if (startIndex >= remaining.length) break;

    // 查找第一个 '{'
    if (remaining[startIndex] !== '{') {
      // 如果不是 JSON 对象开始，尝试查找下一个
      const nextBrace = remaining.indexOf('{', startIndex + 1);
      if (nextBrace === -1) break;
      startIndex = nextBrace;
    }

    // 从当前位置开始，查找完整的 JSON 对象
    let braceCount = 0;
    let jsonStart = startIndex;
    let inString = false;
    let escapeNext = false;

    for (let i = startIndex; i < remaining.length; i++) {
      const char = remaining[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            // 找到完整的 JSON 对象
            const jsonStr = remaining.substring(jsonStart, i + 1);
            jsonObjects.push(jsonStr);
            startIndex = i + 1;
            break;
          }
        }
      }
    }

    // 如果没有找到完整的 JSON 对象，保留剩余部分
    if (braceCount !== 0) {
      remaining = remaining.substring(jsonStart);
      break;
    }
  }

  return { jsonObjects, remaining: startIndex < remaining.length ? remaining.substring(startIndex) : '' };
}

/**
 * 处理单个 chunk（JSON 对象）
 * @param jsonStr JSON 字符串
 * @param onDeltaContent 处理 delta content 的回调
 * @param onFinish 处理完成标记的回调
 */
export function processChunk(
  jsonStr: string,
  onDeltaContent: (content: string) => void,
  onFinish: (finishReason: string | null) => void
): void {
  try {
    const jsonData = JSON.parse(jsonStr);

    // 累积 content delta（流式响应中的增量内容）
    if (jsonData.choices?.[0]?.delta?.content !== undefined) {
      const deltaContent = jsonData.choices[0].delta.content || '';
      if (deltaContent) {
        onDeltaContent(deltaContent);
      }
    }

    // 检查是否完成（finish_reason 不为 null）
    const finishReason = jsonData.choices?.[0]?.finish_reason;
    if (finishReason) {
      onFinish(finishReason);
    }
  } catch (e) {
    // 忽略单个 JSON 解析错误，继续处理
  }
}

/**
 * 处理流式响应（Server-Sent Events 格式）
 * 参考：https://github.com/zai-org/Open-AutoGLM
 * 流式响应格式：
 * 1. SSE 格式：每行以 "data: " 开头，包含 JSON 对象，最后一行是 "[DONE]"
 * 2. 直接 JSON 拼接：多个 JSON 对象直接拼接在一起（没有分隔符）
 * @param onStreamUpdate 流式更新回调函数，实时更新 UI
 */
export async function handleStreamingResponse(
  response: Response,
  onStreamUpdate?: (content: string) => void
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法获取响应流读取器');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let lastCompleteJson = '';
  let isFinished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // 解码数据块
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // 首先尝试按行处理（SSE 格式）
      const lines = buffer.split('\n');
      const hasNewlines = lines.length > 1;

      if (hasNewlines) {
        // 有换行符，按 SSE 格式处理
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          // 跳过注释行
          if (trimmedLine.startsWith(':')) continue;

          // 检查是否是结束标记
          if (trimmedLine === 'data: [DONE]') {
            isFinished = true;
            continue;
          }

          // 提取 data: 后的内容
          if (trimmedLine.startsWith('data: ')) {
            const jsonStr = trimmedLine.substring(6); // 跳过 "data: "
            processChunk(jsonStr, (deltaContent) => {
              fullContent += deltaContent;
              if (onStreamUpdate) {
                onStreamUpdate(fullContent);
              }
            }, (finishReason) => {
              if (finishReason) {
                isFinished = true;
                console.info('[AutoGLM服务] 流式响应完成，原因:', finishReason);
              }
            });
          } else {
            // 直接 JSON 行
            processChunk(trimmedLine, (deltaContent) => {
              fullContent += deltaContent;
              if (onStreamUpdate) {
                onStreamUpdate(fullContent);
              }
            }, (finishReason) => {
              if (finishReason) {
                isFinished = true;
                console.info('[AutoGLM服务] 流式响应完成，原因:', finishReason);
              }
            });
          }
        }
      } else {
        // 没有换行符，可能是多个 JSON 对象直接拼接
        const { jsonObjects, remaining } = extractJsonObjects(buffer);
        buffer = remaining;

        for (const jsonStr of jsonObjects) {
          processChunk(jsonStr, (deltaContent) => {
            fullContent += deltaContent;
            if (onStreamUpdate) {
              onStreamUpdate(fullContent);
            }
          }, (finishReason) => {
            if (finishReason) {
              isFinished = true;
              console.info('[AutoGLM服务] 流式响应完成，原因:', finishReason);
            }
          });
        }
      }

      // 如果已经完成，可以提前退出
      if (isFinished) {
        break;
      }
    }

    // 处理剩余的 buffer（可能还有未完成的 JSON 对象）
    if (buffer.trim() && !isFinished) {
      const { jsonObjects } = extractJsonObjects(buffer);
      for (const jsonStr of jsonObjects) {
        processChunk(jsonStr, (deltaContent) => {
          fullContent += deltaContent;
          if (onStreamUpdate) {
            onStreamUpdate(fullContent);
          }
        }, (finishReason) => {
          if (finishReason) {
            isFinished = true;
          }
        });
      }
    }

    // 如果有累积的内容，构建完整的响应对象
    if (fullContent) {
      const completeResponse: AutoGLMResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: fullContent,
          },
        }],
      };
      return JSON.stringify(completeResponse);
    }

    // 如果有最后一个完整的 JSON，使用它
    if (lastCompleteJson) {
      return lastCompleteJson;
    }

    throw new Error('流式响应中没有找到有效的内容');
  } finally {
    reader.releaseLock();
  }
}

/**
 * 解析流式响应文本（如果响应已经是完整文本但包含多个 JSON 对象或单个 chunk）
 * 支持格式：
 * 1. 多个 JSON 对象，每行一个
 * 2. SSE 格式（data: {...}）
 * 3. 多个 JSON 对象直接拼接（没有分隔符）
 * 4. 单个 chunk 对象
 */
export function parseStreamingResponse(responseText: string): AutoGLMResponse {
  let accumulatedContent = '';
  let lastValidJson: AutoGLMResponse | null = null;

  // 首先尝试按行分割（SSE 格式或每行一个 JSON）
  const lines = responseText.split('\n');
  const hasNewlines = lines.length > 1;

  if (hasNewlines) {
    // 有换行符，按行处理
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith(':')) continue;

      if (trimmedLine === 'data: [DONE]') {
        continue;
      }

      let jsonStr = trimmedLine;
      if (trimmedLine.startsWith('data: ')) {
        jsonStr = trimmedLine.substring(6);
      }

      processChunk(jsonStr, (deltaContent) => {
        accumulatedContent += deltaContent;
      }, () => { });
    }
  } else {
    // 没有换行符，可能是多个 JSON 对象直接拼接
    const { jsonObjects } = extractJsonObjects(responseText);

    for (const jsonStr of jsonObjects) {
      processChunk(jsonStr, (deltaContent) => {
        accumulatedContent += deltaContent;
      }, () => { });
    }
  }

  // 如果有累积的内容，使用它（优先）
  if (accumulatedContent) {
    return {
      choices: [{
        message: {
          role: 'assistant',
          content: accumulatedContent,
        },
      }],
    };
  }

  // 否则使用最后一个有效的 JSON
  if (lastValidJson) {
    return lastValidJson;
  }

  throw new Error('无法从流式响应中解析出有效数据');
}

