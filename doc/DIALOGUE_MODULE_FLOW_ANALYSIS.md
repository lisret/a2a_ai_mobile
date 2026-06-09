# 对话模块流程分析与架构调整

## 🔍 用户提出的流程

```
1. 发起任务指令
   ↓
2. 根据参数选择模型
   ↓
3. 调用通用的调用模块（API调用，不依赖特定模型）
   ↓
4. 根据参数选择模型解析（可以存在多种不同的解析器）
   ↓
5. 执行通用解析完成的动作
   ↓
6. 任务流程
```

## ⚠️ 当前规划的问题

### 当前规划流程
```
ModelInferenceModule
  ↓
DialogueProvider.getAction()
  ├─→ getSystemPrompt() (提示词)
  ├─→ DialogueService.callAPI() (通用API调用)
  └─→ parseAction() (解析)
```

**问题**：
1. ❌ API调用和解析耦合在 `DialogueProvider.getAction()` 中
2. ❌ 提示词、API调用、解析都在一个方法里，不够清晰
3. ❌ 不符合用户提出的"先调用通用API，再选择解析器"的流程

## ✅ 调整后的架构

### 新流程设计

```
ModelInferenceModule
  ↓
1. 根据模型参数选择提示词提供者 (PromptProvider)
  ↓
2. 调用通用API服务 (DialogueService) - 不依赖特定模型
  ↓
3. 根据模型参数选择解析器 (Parser)
  ↓
4. 解析响应
  ↓
5. 返回 TaskAction
```

### 架构调整

#### 1. 分离提示词提供者

```typescript
// core/engine/dialogue/types/PromptProvider.ts

export interface PromptProvider {
  /**
   * 获取系统提示词
   */
  getSystemPrompt(): Promise<string>;
}

// core/engine/dialogue/openAutoGML/prompts/PromptProvider.ts
export class OpenAutoGLMPromptProvider implements PromptProvider {
  async getSystemPrompt(): Promise<string> {
    // 返回 Open-AutoGLM 的提示词
  }
}
```

#### 2. 通用API调用服务（完全独立）

```typescript
// core/engine/openAutoGML/services/DialogueService.ts

export interface DialogueAPICallRequest {
  screenshotUri: string;
  task: string;
  model: AIModel;
  systemPrompt: string;  // 由调用方提供
  conversationHistory?: DialogueMessage[];
  onStreamUpdate?: (content: string) => void;
}

export interface DialogueAPICallResponse {
  content: string;           // 模型返回的原始文本
  streamContent?: string;     // 流式内容（如果有）
}

/**
 * 通用API调用服务
 * 不依赖特定模型格式，只负责HTTP请求
 */
export class DialogueService {
  async callAPI(request: DialogueAPICallRequest): Promise<DialogueAPICallResponse> {
    // 通用API调用逻辑
    // 不包含任何模型特定的解析
  }
}
```

#### 3. 独立解析器

```typescript
// core/engine/dialogue/types/Parser.ts

export interface DialogueParser {
  /**
   * 解析模型响应中的操作指令
   */
  parseAction(
    responseText: string,
    getScreenSize: () => Promise<{ width: number; height: number }>
  ): Promise<TaskAction>;

  /**
   * 处理流式响应（可选）
   */
  handleStreamingResponse?(
    response: Response,
    onStreamUpdate?: (content: string) => void
  ): Promise<string>;
}

// core/engine/dialogue/openAutoGML/parsers/OpenAutoGLMParser.ts
export class OpenAutoGLMParser implements DialogueParser {
  async parseAction(...): Promise<TaskAction> {
    // Open-AutoGLM 特定的解析逻辑
  }
}
```

#### 4. 工厂类（选择提示词和解析器）

```typescript
// core/engine/dialogue/factory.ts

export class DialogueFactory {
  /**
   * 根据模型参数获取提示词提供者
   */
  static getPromptProvider(model: AIModel): PromptProvider {
    const providerType = this.getProviderType(model);
    switch (providerType) {
      case 'openAutoGML':
        return new OpenAutoGLMPromptProvider();
      case 'claude':
        return new ClaudePromptProvider();
      default:
        return new OpenAutoGLMPromptProvider();
    }
  }

  /**
   * 根据模型参数获取解析器
   */
  static getParser(model: AIModel): DialogueParser {
    const providerType = this.getProviderType(model);
    switch (providerType) {
      case 'openAutoGML':
        return new OpenAutoGLMParser();
      case 'claude':
        return new ClaudeParser();
      default:
        return new OpenAutoGLMParser();
    }
  }

  private static getProviderType(model: AIModel): string {
    // 根据 model.provider 或 model.modelName 推断
    return model.provider || 'openAutoGML';
  }
}
```

#### 5. ModelInferenceModule 使用新流程

```typescript
// core/engine/openAutoGML/task/modules/ModelInferenceModule.ts

import { DialogueFactory } from '../../../dialogue/factory';
import { dialogueService } from '../../services/DialogueService';

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
      const apiResponse = await dialogueService.callAPI({
        screenshotUri,
        task: instruction,
        model,
        systemPrompt,
        conversationHistory,
        onStreamUpdate,
      });

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

## 📊 调整后的目录结构

```
core/engine/
├── dialogue/                          # 模型对话模块
│   ├── types/                         # 接口类型
│   │   ├── PromptProvider.ts          # 提示词提供者接口
│   │   ├── Parser.ts                  # 解析器接口
│   │   └── index.ts
│   │
│   ├── openAutoGML/                   # Open-AutoGLM 实现
│   │   ├── prompts/                   # 提示词
│   │   │   ├── prompts_zh.ts         # 提示词内容
│   │   │   ├── PromptProvider.ts     # 提示词提供者实现
│   │   │   └── index.ts
│   │   ├── parsers/                   # 解析器
│   │   │   ├── ActionParser.ts       # 动作解析
│   │   │   ├── StreamParser.ts       # 流式解析
│   │   │   ├── Parser.ts             # 解析器实现
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── claude/                        # Claude 实现（未来）
│   │   ├── prompts/
│   │   ├── parsers/
│   │   └── index.ts
│   │
│   ├── factory.ts                     # 工厂类（选择提示词和解析器）
│   └── index.ts
│
└── openAutoGML/                       # 任务执行引擎
    ├── services/
    │   └── DialogueService.ts        # 通用API调用服务（完全独立）
    └── task/
        └── modules/
            └── ModelInferenceModule.ts  # 使用新流程
```

## ✅ 调整后的优势

### 1. **流程清晰**
- 步骤明确：选择提示词 → API调用 → 选择解析器 → 解析
- 符合用户提出的流程

### 2. **职责分离**
- **PromptProvider**: 只负责提示词
- **DialogueService**: 只负责API调用（完全通用）
- **Parser**: 只负责解析（模型特定）

### 3. **易于扩展**
- 新增模型只需实现 `PromptProvider` 和 `Parser`
- 不需要修改 `DialogueService`（通用）

### 4. **灵活性**
- 可以混合使用不同模型的提示词和解析器（如果需要）
- 每个组件独立测试

## 🔄 对比总结

| 方面 | 原规划 | 调整后 |
|------|--------|--------|
| API调用 | 在 DialogueProvider 内部 | 独立的 DialogueService |
| 提示词 | 在 DialogueProvider 内部 | 独立的 PromptProvider |
| 解析器 | 在 DialogueProvider 内部 | 独立的 Parser |
| 流程 | 耦合在一个方法里 | 分步骤，清晰明确 |
| 符合用户流程 | ❌ | ✅ |

## 📝 迁移建议

1. **第一步**：创建独立的 `DialogueService`（通用API调用）
2. **第二步**：创建 `PromptProvider` 接口和实现
3. **第三步**：创建 `Parser` 接口和实现
4. **第四步**：创建 `DialogueFactory` 工厂类
5. **第五步**：更新 `ModelInferenceModule` 使用新流程

