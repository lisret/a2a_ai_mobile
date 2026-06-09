# 对话模块流程总结

## ✅ 调整后的架构完全符合用户提出的流程

### 用户提出的流程

```
1. 发起任务指令
   ↓
2. 根据参数选择模型
   ↓
3. 调用通用的调用模块（不依赖特定模型）
   ↓
4. 根据参数选择模型解析（可以存在多种不同的）
   ↓
5. 执行通用解析完成的动作
   ↓
6. 任务流程
```

### 架构实现对应关系

| 用户流程步骤 | 架构实现 | 代码位置 |
|------------|---------|---------|
| 1. 发起任务指令 | `TaskExecutionEngine` 发起任务 | `core/engine/openAutoGML/task/TaskExecutionEngine.ts` |
| 2. 根据参数选择模型 | `ModelInferenceModule` 接收模型参数 | `core/engine/openAutoGML/task/modules/ModelInferenceModule.ts` |
| 3. 调用通用的调用模块 | `DialogueService.callAPI()` - 完全通用的API调用 | `core/engine/openAutoGML/services/DialogueService.ts` |
| 4. 根据参数选择模型解析 | `DialogueFactory.getParser()` - 根据模型选择解析器 | `core/engine/dialogue/factory.ts` |
| 5. 执行通用解析完成的动作 | `Parser.parseAction()` - 返回 `TaskAction` | `core/engine/dialogue/openAutoGML/parsers/Parser.ts` |
| 6. 任务流程 | `TaskExecutionEngine` 执行动作 | `core/engine/openAutoGML/task/TaskExecutionEngine.ts` |

## 📊 完整调用链

```
TaskExecutionEngine
  │
  └─→ ModelInferenceModule.infer()
       │
       ├─→ 步骤1: DialogueFactory.getPromptProvider(model)
       │       └─→ 根据模型参数选择提示词提供者
       │           (OpenAutoGLMPromptProvider / ClaudePromptProvider / ...)
       │
       ├─→ 步骤2: promptProvider.getSystemPrompt()
       │       └─→ 获取模型特定的提示词
       │
       ├─→ 步骤3: dialogueService.callAPI()
       │       └─→ 通用API调用（不依赖特定模型）
       │           - HTTP请求
       │           - 流式处理
       │           - 返回原始响应文本
       │
       ├─→ 步骤4: DialogueFactory.getParser(model)
       │       └─→ 根据模型参数选择解析器
       │           (OpenAutoGLMParser / ClaudeParser / ...)
       │
       ├─→ 步骤5: parser.parseAction(responseText)
       │       └─→ 解析模型响应，返回 TaskAction
       │
       └─→ 返回 ModelInferenceResult { action, response, streamContent }
            │
            └─→ TaskExecutionEngine 执行 action
```

## 🎯 关键设计点

### 1. **通用API调用服务（DialogueService）**

```typescript
// 完全独立，不依赖任何模型特定的逻辑
class DialogueService {
  async callAPI(request: DialogueAPICallRequest): Promise<DialogueAPICallResponse> {
    // 只负责：
    // - HTTP请求
    // - 请求构建（使用传入的 systemPrompt）
    // - 响应处理（返回原始文本）
    // 不包含任何解析逻辑
  }
}
```

**特点**：
- ✅ 不依赖特定模型格式
- ✅ 可以用于任何模型（Open-AutoGLM、Claude、GPT等）
- ✅ 只负责网络通信

### 2. **模型特定的提示词提供者（PromptProvider）**

```typescript
// 每个模型实现自己的提示词
class OpenAutoGLMPromptProvider implements PromptProvider {
  async getSystemPrompt(): Promise<string> {
    // 返回 Open-AutoGLM 特定的提示词
  }
}
```

**特点**：
- ✅ 模型特定的提示词逻辑
- ✅ 可以根据模型参数动态生成提示词
- ✅ 独立于API调用和解析

### 3. **模型特定的解析器（DialogueParser）**

```typescript
// 每个模型实现自己的解析器
class OpenAutoGLMParser implements DialogueParser {
  async parseAction(responseText: string, getScreenSize: Function): Promise<TaskAction> {
    // 解析 Open-AutoGLM 特定的响应格式
    // 例如：<answer>do(action="Tap", element=[100,200])</answer>
  }
}
```

**特点**：
- ✅ 模型特定的解析逻辑
- ✅ 可以支持多种不同的响应格式
- ✅ 独立于API调用

### 4. **工厂类（DialogueFactory）**

```typescript
// 根据模型参数选择对应的提示词和解析器
class DialogueFactory {
  static getPromptProvider(model: AIModel): PromptProvider {
    // 根据 model.provider 或 model.modelName 选择
  }
  
  static getParser(model: AIModel): DialogueParser {
    // 根据 model.provider 或 model.modelName 选择
  }
}
```

**特点**：
- ✅ 统一的选择逻辑
- ✅ 支持根据模型参数自动选择
- ✅ 易于扩展新模型

## 🔄 流程对比

### ❌ 原规划（不符合用户流程）

```
ModelInferenceModule
  └─→ DialogueProvider.getAction()
       ├─→ getSystemPrompt()      (提示词)
       ├─→ DialogueService.callAPI()  (API调用)
       └─→ parseAction()          (解析)
       
问题：API调用和解析耦合在一个方法里
```

### ✅ 调整后（完全符合用户流程）

```
ModelInferenceModule
  ├─→ DialogueFactory.getPromptProvider(model)  // 步骤1: 选择提示词
  ├─→ promptProvider.getSystemPrompt()          // 步骤2: 获取提示词
  ├─→ dialogueService.callAPI()                 // 步骤3: 通用API调用
  ├─→ DialogueFactory.getParser(model)         // 步骤4: 选择解析器
  └─→ parser.parseAction()                       // 步骤5: 解析响应
      
优势：步骤清晰，职责分离
```

## 📝 使用示例

```typescript
// ModelInferenceModule.infer()

// 步骤1: 根据模型参数选择提示词提供者
const promptProvider = DialogueFactory.getPromptProvider(model);

// 步骤2: 获取系统提示词
const systemPrompt = await promptProvider.getSystemPrompt();

// 步骤3: 调用通用API服务（不依赖特定模型）
const apiResponse = await dialogueService.callAPI({
  screenshotUri,
  task: instruction,
  model,
  systemPrompt,  // 使用模型特定的提示词
  conversationHistory,
  onStreamUpdate,
});

// 步骤4: 根据模型参数选择解析器
const parser = DialogueFactory.getParser(model);

// 步骤5: 解析响应（模型特定的解析逻辑）
const action = await parser.parseAction(
  apiResponse.content,
  () => dialogueService.getScreenSize()
);

// 返回结果，继续任务流程
return { action, response: apiResponse.content, streamContent: apiResponse.streamContent };
```

## ✅ 验证清单

- [x] 步骤1: 发起任务指令 → `TaskExecutionEngine`
- [x] 步骤2: 根据参数选择模型 → `ModelInferenceModule` 接收 `model` 参数
- [x] 步骤3: 调用通用的调用模块 → `DialogueService.callAPI()` (完全通用)
- [x] 步骤4: 根据参数选择模型解析 → `DialogueFactory.getParser(model)`
- [x] 步骤5: 执行通用解析完成的动作 → `Parser.parseAction()` 返回 `TaskAction`
- [x] 步骤6: 任务流程 → `TaskExecutionEngine` 执行动作

## 🎉 总结

调整后的架构**完全符合**用户提出的流程：

1. ✅ **通用API调用**：`DialogueService` 完全独立，不依赖特定模型
2. ✅ **模型特定解析**：`DialogueParser` 可以根据模型参数选择不同的实现
3. ✅ **流程清晰**：步骤明确，职责分离
4. ✅ **易于扩展**：新增模型只需实现 `PromptProvider` 和 `Parser`

