/**
 * 错误处理模块
 * 负责错误处理和重试逻辑
 */

export interface ErrorHandlingOptions {
  maxConsecutiveErrors?: number;
  retryDelay?: number;
  onError?: (error: Error, context: any) => void;
}

/**
 * 错误处理模块
 */
export class ErrorHandlingModule {
  private consecutiveErrors = 0;
  private maxConsecutiveErrors: number;
  private retryDelay: number;
  private onErrorCallback?: (error: Error, context: any) => void;

  constructor(options: ErrorHandlingOptions = {}) {
    this.maxConsecutiveErrors = options.maxConsecutiveErrors ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
    this.onErrorCallback = options.onError;
  }

  /**
   * 处理错误
   * @param error 错误对象
   * @param context 上下文信息
   * @returns 是否应该继续执行
   */
  async handleError(error: Error, context: any = {}): Promise<boolean> {
    this.consecutiveErrors++;
    const errorMessage = error.message || String(error);

    console.error(`[错误处理] 错误 (连续 ${this.consecutiveErrors}/${this.maxConsecutiveErrors}):`, errorMessage);

    // 调用错误回调
    if (this.onErrorCallback) {
      try {
        this.onErrorCallback(error, context);
      } catch (callbackError) {
        console.error('[错误处理] 错误回调执行失败:', callbackError);
      }
    }

    // 检查是否超过最大连续错误数
    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      console.error(`[错误处理] 连续错误次数超过限制 (${this.maxConsecutiveErrors})，停止执行`);
      return false;
    }

    // 等待后重试
    await this.waitBeforeRetry();
    return true;
  }

  /**
   * 重置错误计数
   */
  reset(): void {
    this.consecutiveErrors = 0;
  }

  /**
   * 获取连续错误数
   */
  getConsecutiveErrors(): number {
    return this.consecutiveErrors;
  }

  /**
   * 等待重试
   */
  private async waitBeforeRetry(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
  }
}

