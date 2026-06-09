import type { TaskAction } from '../../taskEngine/types/Task';

/**
 * 对话解析器接口
 * 每个模型实现都需要提供自己的解析器
 */
export interface DialogueParser {
  /**
   * 解析模型响应中的操作指令
   * @param responseText 模型响应文本
   * @param getScreenSize 获取屏幕尺寸的函数
   * @returns 操作指令
   */
  parseAction(
    responseText: string,
    getScreenSize: () => Promise<{ width: number; height: number }>
  ): Promise<TaskAction>;

  /**
   * 处理流式响应（可选）
   * @param response HTTP响应对象
   * @param onStreamUpdate 流式更新回调
   * @returns 完整的响应文本
   */
  handleStreamingResponse?(
    response: Response,
    onStreamUpdate?: (content: string) => void
  ): Promise<string>;
}

