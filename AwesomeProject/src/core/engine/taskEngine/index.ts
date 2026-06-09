/**
 * 任务执行引擎模块导出
 */

// 导出类型
export * from './types';

// 导出服务
export { dialogueService } from './services/DialogueService';
// 注意：autoGLMService 已废弃，请使用 ModelInferenceModule 和 DialogueService
// export { autoGLMService } from './services/AutoGLMService';

// 导出任务执行相关服务
export { TaskExecutionEngine, type TaskExecutionEngineConfig } from './task/TaskExecutionEngine';
export { executeAction, type ExecuteActionOptions, type ExecuteActionResult } from './task/TaskExecutionActions';
export { getActionDescription } from './task/TaskExecutionHelpers';

// 导出功能模块
export * from './task/modules';
