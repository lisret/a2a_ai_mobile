# 模型对话模块重构方案

## 📊 当前结构分析

### 当前相关文件位置
```
src/functionalModule/openAutoGML/
├── services/
│   ├── AutoGLMService.ts        # 模型API调用服务
│   └── prompts_zh.ts            # 提示词（需要拆分）
├── modelDialogue/               # 解析模块（需要拆分）
│   ├── AutoGLMActionParser.ts   # 动作解析器
│   └── AutoGLMStreamParser.ts   # 流式解析器
└── task/
    └── modules/
        └── ModelInferenceModule.ts  # 使用 AutoGLMService
```

### 问题
1. **提示词和解析器耦合**：提示词和解析逻辑与 AutoGLM 实现紧密耦合
2. **难以扩展**：如果要支持其他模型（如 Claude、GPT-4），需要重复实现
3. **职责不清**：AutoGLMService 既负责API调用，又包含特定格式的解析逻辑

---

## 🎯 重构目标

1. **独立对话模块**：将提示词和解析逻辑独立为可插拔的对话提供者
2. **支持多模型**：架构支持多种模型对话实现（openAutoGML、Claude、GPT等）
3. **统一接口**：定义统一的对话提供者接口，便于切换和扩展
4. **职责分离**：API调用服务与对话格式解析分离

---

## 🏗️ 新架构设计

### 目录结构

```
src/core/engine/
├── dialogue/                          # 模型对话模块（新增）
│   ├── types/                         # 对话接口类型
│   │   ├── DialogueProvider.ts        # 对话提供者接口定义
│   │   ├── DialogueRequest.ts         # 对话请求类型
│   │   ├── DialogueResponse.ts        # 对话响应类型
│   │   └── index.ts
│   │
│   ├── openAutoGML/                   # Open-AutoGLM 实现
│   │   ├── prompts/                   # 提示词
│   │   │   ├── prompts_zh.ts         # 中文提示词内容
│   │   │   ├── PromptProvider.ts     # 提示词提供者实现
│   │   │   └── index.ts
│   │   ├── parsers/                   # 解析器
│   │   │   ├── ActionParser.ts       # 动作解析器（原 AutoGLMActionParser）
│   │   │   ├── StreamParser.ts       # 流式解析器（原 AutoGLMStreamParser）
│   │   │   ├── Parser.ts             # 解析器实现
│   │   │   └── index.ts
│   │   └── index.ts                   # 导出
│   │
│   ├── claude/                        # Claude 实现（未来扩展）
│   │   ├── prompts/
│   │   │   ├── prompts_en.ts
│   │   │   ├── PromptProvider.ts
│   │   │   └── index.ts
│   │   ├── parsers/
│   │   │   ├── Parser.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── factory.ts                     # 工厂类（选择提示词和解析器）
│   └── index.ts                       # 统一导出
│
└── openAutoGML/                       # 任务执行引擎
    ├── services/
    │   └── DialogueService.ts        # 通用API调用服务（完全独立）
    ├── task/                          # 任务执行相关
    └── types/                         # 类型定义
```

---

## 📐 接口设计

### 核心流程

根据用户提出的流程，架构设计如下：

```
1. 发起任务指令
   ↓
2. 根据参数选择模型
   ↓
3. 调用通用的调用模块（DialogueService - 不依赖特定模型）
   ↓
4. 根据参数选择模型解析（Parser - 可以存在多种不同的）
   ↓
5. 执行通用解析完成的动作（TaskAction）
   ↓
6. 任务流程
```

### 接口设计（分离式）

#### 1. PromptProvider 接口（提示词提供者）

```typescript
// core/engine/dialogue/types/PromptProvider.ts

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
```

#### 2. DialogueParser 接口（解析器）

```typescript
// core/engine/dialogue/types/Parser.ts

import type { TaskAction } from '@/core/engine/openAutoGML/types/Task';

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
```

#### 3. DialogueService 接口（通用API调用服务）

```typescript
// core/engine/openAutoGML/services/DialogueService.ts

import type { AIModel } from '@/types/Model';

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
export interface DialogueService {
  /**
   * 调用模型API
   * @param request API调用请求
   * @returns API调用响应
   */
  callAPI(request: DialogueAPICallRequest): Promise<DialogueAPICallResponse>;

  /**
   * 获取屏幕尺寸
   */
  getScreenSize(): Promise<{ width: number; height: number }>;
}
```

---

## 🔧 实现示例

### 1. OpenAutoGLM 提示词提供者

```typescript
// core/engine/dialogue/openAutoGML/prompts/PromptProvider.ts

import type { PromptProvider } from '../../types/PromptProvider';
import { getSystemPrompt as getOpenAutoGLMPrompt } from './prompts_zh';

export class OpenAutoGLMPromptProvider implements PromptProvider {
  async getSystemPrompt(): Promise<string> {
    return await getOpenAutoGLMPrompt();
  }
}
```

### 2. OpenAutoGLM 解析器

```typescript
// core/engine/dialogue/openAutoGML/parsers/Parser.ts

import type { DialogueParser } from '../../types/Parser';
import type { TaskAction } from '@/core/engine/openAutoGML/types/Task';
import { parseDoAction } from './ActionParser';
import { handleStreamingResponse } from './StreamParser';

export class OpenAutoGLMParser implements DialogueParser {
  async parseAction(
    responseText: string,
    getScreenSize: () => Promise<{ width: number; height: number }>
  ): Promise<TaskAction> {
    return await parseDoAction(responseText, getScreenSize);
  }

  async handleStreamingResponse(
    response: Response,
    onStreamUpdate?: (content: string) => void
  ): Promise<string> {
    return await handleStreamingResponse(response, onStreamUpdate);
  }
}
```

### 3. 通用API调用服务

```typescript
// core/engine/openAutoGML/services/DialogueService.ts

import type { DialogueService, DialogueAPICallRequest, DialogueAPICallResponse } from './DialogueService';
import { accessibilityService } from '@/core/ability';
import { AUTOGLM_CONFIG } from '@/constants';

export class DialogueServiceImpl implements DialogueService {
  private cachedScreenSize: { width: number; height: number } | null = null;

  async getScreenSize(): Promise<{ width: number; height: number }> {
    if (this.cachedScreenSize) {
      return this.cachedScreenSize;
    }
    try {
      const size = await accessibilityService.getScreenSize();
      this.cachedScreenSize = size;
      return size;
    } catch (error) {
      console.warn('[DialogueService] 获取屏幕分辨率失败，使用默认值:', error);
      this.cachedScreenSize = AUTOGLM_CONFIG.DEFAULT_SCREEN_SIZE;
      return this.cachedScreenSize;
    }
  }

  async callAPI(request: DialogueAPICallRequest): Promise<DialogueAPICallResponse> {
    // 通用API调用逻辑
    // 不包含任何模型特定的解析
    // 只负责HTTP请求和响应处理
    
    const imageBase64 = await this.imageToBase64(request.screenshotUri);
    const apiUrl = this.normalizeApiUrl(request.model.apiUrl);
    
    // 构建请求消息
    const messages = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    if (request.conversationHistory) {
      messages.push(...request.conversationHistory);
    }
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: request.task },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
      ],
    });

    // 调用API
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${request.model.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model.modelName,
        messages,
        temperature: AUTOGLM_CONFIG.API_REQUEST.TEMPERATURE,
        max_tokens: AUTOGLM_CONFIG.API_REQUEST.MAX_TOKENS,
      }),
    });

    if (!response.ok) {
      throw new Error(`API调用失败: ${response.status}`);
    }

    // 处理响应（通用逻辑，不包含解析）
    const responseText = await response.text();
    const data = JSON.parse(responseText);
    const content = data.choices[0]?.message?.content || '';

    return {
      content,
      streamContent: content, // 如果是流式，需要特殊处理
    };
  }

  private async imageToBase64(imageUri: string): Promise<string> {
    // 转换逻辑
    return imageUri;
  }

  private normalizeApiUrl(apiUrl: string): string {
    // URL规范化逻辑
    return apiUrl;
  }
}

export const dialogueService = new DialogueServiceImpl();
```

### 4. ModelInferenceModule 使用新流程

```typescript
// core/engine/openAutoGML/task/modules/ModelInferenceModule.ts

import { DialogueFactory } from '../../../dialogue/factory';
import { dialogueService } from '../../services/DialogueService';
import type { AIModel } from '@/types/Model';
import type { TaskAction } from '../../types/Task';
import { TASK_CONFIG } from '@/constants';

export interface ModelInferenceResult {
  action: TaskAction;
  response: string;
  streamContent: string;
}

export class ModelInferenceModule {
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

      // 步骤4: 解析响应
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
```

---

## 🏭 工厂模式

### DialogueFactory

```typescript
// core/engine/dialogue/factory.ts

import type { PromptProvider } from './types/PromptProvider';
import type { DialogueParser } from './types/Parser';
import type { AIModel } from '@/types/Model';
import { OpenAutoGLMPromptProvider } from './openAutoGML/prompts';
import { OpenAutoGLMParser } from './openAutoGML/parsers';
// import { ClaudePromptProvider } from './claude/prompts';  // 未来扩展
// import { ClaudeParser } from './claude/parsers';  // 未来扩展

export type DialogueProviderType = 'openAutoGML' | 'claude' | 'gpt4';

/**
 * 对话工厂
 * 根据模型类型创建对应的提示词提供者和解析器
 */
export class DialogueFactory {
  private static promptProviders: Map<DialogueProviderType, PromptProvider> = new Map();
  private static parsers: Map<DialogueProviderType, DialogueParser> = new Map();

  /**
   * 根据模型参数获取提示词提供者
   * @param model 模型配置
   * @returns 提示词提供者实例
   */
  static getPromptProvider(model: AIModel): PromptProvider {
    const providerType = this.getProviderType(model);
    
    if (!this.promptProviders.has(providerType)) {
      switch (providerType) {
        case 'openAutoGML':
          this.promptProviders.set(providerType, new OpenAutoGLMPromptProvider());
          break;
        // case 'claude':
        //   this.promptProviders.set(providerType, new ClaudePromptProvider());
        //   break;
        default:
          this.promptProviders.set(providerType, new OpenAutoGLMPromptProvider());
      }
    }
    return this.promptProviders.get(providerType)!;
  }

  /**
   * 根据模型参数获取解析器
   * @param model 模型配置
   * @returns 解析器实例
   */
  static getParser(model: AIModel): DialogueParser {
    const providerType = this.getProviderType(model);
    
    if (!this.parsers.has(providerType)) {
      switch (providerType) {
        case 'openAutoGML':
          this.parsers.set(providerType, new OpenAutoGLMParser());
          break;
        // case 'claude':
        //   this.parsers.set(providerType, new ClaudeParser());
        //   break;
        default:
          this.parsers.set(providerType, new OpenAutoGLMParser());
      }
    }
    return this.parsers.get(providerType)!;
  }

  /**
   * 根据模型配置推断提供者类型
   */
  private static getProviderType(model: AIModel): DialogueProviderType {
    // 优先使用 model.provider
    if (model.provider) {
      return model.provider as DialogueProviderType;
    }
    
    // 根据 modelName 推断
    if (model.modelName?.includes('AutoGLM') || model.modelName?.includes('ZhipuAI')) {
      return 'openAutoGML';
    }
    if (model.modelName?.includes('Claude')) {
      return 'claude';
    }
    
    // 默认使用 openAutoGML
    return 'openAutoGML';
  }
}
```

---

## 🔄 迁移步骤

### 第一阶段：创建新目录结构
1. 创建 `core/engine/dialogue/` 目录
2. 创建 `dialogue/types/` 定义接口
3. 创建 `dialogue/openAutoGML/` 目录

### 第二阶段：拆分提示词和解析器
1. 移动 `prompts_zh.ts` → `dialogue/openAutoGML/prompts/prompts_zh.ts`
2. 移动 `AutoGLMActionParser.ts` → `dialogue/openAutoGML/parsers/ActionParser.ts`
3. 移动 `AutoGLMStreamParser.ts` → `dialogue/openAutoGML/parsers/StreamParser.ts`
4. 更新所有导入路径

### 第三阶段：实现分离的组件
1. 创建 `PromptProvider` 接口和 `OpenAutoGLMPromptProvider` 实现
2. 创建 `DialogueParser` 接口和 `OpenAutoGLMParser` 实现
3. 重构 `AutoGLMService` 为通用的 `DialogueService`（只负责API调用，不包含解析）

### 第四阶段：实现工厂和更新调用方
1. 创建 `DialogueFactory` 工厂类（选择提示词和解析器）
2. 更新 `ModelInferenceModule` 使用新流程：
   - 选择提示词提供者 → 调用通用API → 选择解析器 → 解析响应
3. 测试验证

### 第五阶段：扩展支持（可选）
1. 添加其他模型实现（Claude、GPT等）
2. 在模型配置中添加 `provider` 字段
3. 根据配置自动选择提供者

---

## 📊 架构优势

### 1. **流程清晰**
- 符合用户提出的流程：选择模型 → 调用通用API → 选择解析器 → 执行动作
- 步骤明确，易于理解和维护

### 2. **职责分离**
- **PromptProvider**：只负责提示词生成（模型特定）
- **DialogueService**：只负责API调用（完全通用，不依赖特定模型）
- **DialogueParser**：只负责响应解析（模型特定）
- **TaskExecutionEngine**：负责任务执行流程（业务逻辑）

### 3. **可扩展性**
- 新增模型只需实现 `PromptProvider` 和 `DialogueParser`
- 提示词和解析逻辑完全独立，便于定制
- 不需要修改 `DialogueService`（通用）

### 4. **易于测试**
- 每个组件可独立测试
- 可以Mock任意组件进行单元测试
- API调用和解析分离，便于测试

### 5. **向后兼容**
- 保持现有功能不变
- 逐步迁移，不影响现有代码

---

## 🔍 依赖关系

```
TaskExecutionEngine
    │
    ├─→ DialogueProviderFactory
    │       │
    │       └─→ DialogueProvider (接口)
    │               │
    │               ├─→ OpenAutoGLMDialogueProvider
    │               │       ├─→ prompts/
    │               │       └─→ parsers/
    │               │
    │               └─→ ClaudeDialogueProvider (未来)
    │
    └─→ DialogueService (通用API调用)
```

---

## 📝 注意事项

1. **类型兼容**：确保 `TaskAction` 类型在所有实现中保持一致
2. **错误处理**：每个提供者需要处理自己的解析错误
3. **配置管理**：模型配置需要包含 `provider` 字段以选择正确的提供者
4. **向后兼容**：保持现有API不变，内部使用新架构

