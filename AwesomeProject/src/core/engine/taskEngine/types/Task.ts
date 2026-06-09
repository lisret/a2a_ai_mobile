/**
 * 任务执行状态
 */
export type TaskStatus = 'idle' | 'waiting' | 'running' | 'success' | 'failed';

/**
 * 任务执行动作类型
 * 只保留以下动作：Launch, Tap, Type, Swipe, Back, Home, Long Press, Double Tap, Wait, Take_over, Record_Search_Box
 */
export type ActionType = 'click' | 'longPress' | 'doubleTap' | 'swipe' | 'input' | 'back' | 'home' | 'wait' | 'launch' | 'take_over' | 'complete' | 'record_search_box';

/**
 * 任务执行动作
 */
export interface TaskAction {
  type: ActionType;
  x?: number;                    // 点击坐标
  y?: number;
  startX?: number;               // 滑动起始坐标
  startY?: number;
  endX?: number;                 // 滑动结束坐标
  endY?: number;
  text?: string;                 // 输入文本
  duration?: number;             // 等待时长（毫秒）
  app?: string;                  // Launch操作：app包名或名称
  requiresConfirmation?: boolean; // 是否需要用户确认（敏感操作）
  confirmationMessage?: string;   // 确认消息
  takeOverMessage?: string;      // Take_over操作：接管消息
  message?: string;              // Complete操作：完成消息（模型返回的完成信息）
  searchBoxPosition?: string;    // Record_Search_Box操作：搜索框位置描述
}

/**
 * 任务执行步骤
 */
export interface TaskStep {
  step: number;                  // 步骤序号
  action: string;                 // 操作描述
  timestamp: number;              // 时间戳
  screenshotUri?: string;         // 截图路径（可选）
  actionDetails?: TaskAction;     // 操作详情
  modelResponse?: string;         // 模型的完整回复（包括思考过程）
}

/**
 * 任务完整输出
 */
export interface TaskOutput {
  steps: TaskStep[];              // 执行步骤列表
  finalScreenshot?: string;      // 最终截图
  summary?: string;               // 任务摘要
}

/**
 * 任务信息
 */
export interface Task {
  id: string;                    // 任务ID
  modelId: string;               // 关联的模型ID
  instruction: string;           // 任务指令
  status: TaskStatus;            // 任务状态
  currentAction?: string;        // 当前操作描述
  error?: string;                // 错误信息
  output?: TaskOutput;           // 完整输出（包含所有步骤）
  createdAt: number;             // 创建时间戳
  completedAt?: number;          // 完成时间戳
}

/**
 * Open-AutoGLM API 请求格式
 * 参考：Open-AutoGLM 框架 ModelConfig
 */
export interface AutoGLMRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string | Array<{
      type: 'text' | 'image_url';
      text?: string;
      image_url?: { url: string };
    }>;
  }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  extra_body?: Record<string, any>;
}

/**
 * Open-AutoGLM API 响应格式
 */
export interface AutoGLMResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
}

