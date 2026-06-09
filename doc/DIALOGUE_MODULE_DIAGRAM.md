# 模型对话模块架构抽象图

## 🏗️ 整体架构层次

```
┌─────────────────────────────────────────────────────────────────┐
│                    任务执行引擎层                                │
│              (TaskExecutionEngine)                              │
│                   使用 DialogueProvider                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  对话提供者工厂层                                │
│            (DialogueProviderFactory)                            │
│              根据模型类型创建提供者                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  对话提供者接口层                                │
│            (DialogueProvider Interface)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  getSystemPrompt()                                        │  │
│  │  getAction(request)                                       │  │
│  │  parseAction(responseText, getScreenSize)                 │  │
│  │  handleStreamingResponse?(response, onStreamUpdate)       │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ openAutoGML  │   │   Claude     │   │    GPT-4    │
│  Provider    │   │   Provider   │   │   Provider  │
│              │   │   (未来)     │   │   (未来)    │
└──────┬───────┘   └──────────────┘   └──────────────┘
       │
       ├─→ prompts/
       │   └─→ prompts_zh.ts
       │
       ├─→ parsers/
       │   ├─→ ActionParser.ts
       │   └─→ StreamParser.ts
       │
       └─→ OpenAutoGLMDialogueProvider.ts
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   通用API服务层                                 │
│              (DialogueService)                                  │
│           负责HTTP请求、流式处理等通用逻辑                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 模块详细结构

### Dialogue 模块结构

```
core/engine/dialogue/
│
├── types/                              # 接口定义
│   ├── DialogueProvider.ts            # 提供者接口
│   ├── DialogueRequest.ts             # 请求类型
│   ├── DialogueResponse.ts            # 响应类型
│   └── index.ts
│
├── openAutoGML/                        # Open-AutoGLM 实现
│   ├── prompts/                        # 提示词模块
│   │   ├── prompts_zh.ts              # 中文提示词
│   │   └── index.ts
│   │
│   ├── parsers/                        # 解析器模块
│   │   ├── ActionParser.ts            # 动作解析器
│   │   │   ├── parseDoAction()        # 解析 do() 指令
│   │   │   └── parseMessageParam()    # 解析消息参数
│   │   │
│   │   ├── StreamParser.ts            # 流式解析器
│   │   │   ├── handleStreamingResponse()  # 处理流式响应
│   │   │   ├── parseStreamingResponse()    # 解析流式响应
│   │   │   └── extractJsonObjects()       # 提取JSON对象
│   │   │
│   │   └── index.ts
│   │
│   ├── OpenAutoGLMDialogueProvider.ts  # 提供者实现
│   │   ├── getSystemPrompt()          # 获取提示词
│   │   ├── getAction()                # 获取操作指令
│   │   ├── parseAction()              # 解析动作
│   │   └── handleStreamingResponse()  # 处理流式响应
│   │
│   └── index.ts
│
├── claude/                             # Claude 实现（未来）
│   ├── prompts/
│   ├── parsers/
│   ├── ClaudeDialogueProvider.ts
│   └── index.ts
│
├── factory.ts                          # 工厂类
│   ├── getProvider(type)              # 根据类型获取
│   └── getProviderByModel(model)      # 根据模型获取
│
└── index.ts                            # 统一导出
```

---

## 🔄 数据流图

### 调用流程

```
┌─────────────────┐
│ ModelInference  │
│    Module       │
└────────┬────────┘
         │
         │ 1. 调用 getAction()
         ▼
┌─────────────────┐
│ DialogueProvider│
│    Factory      │
└────────┬────────┘
         │
         │ 2. 根据类型创建提供者
         ▼
┌─────────────────────────┐
│ OpenAutoGLMDialogue     │
│      Provider           │
└────────┬────────────────┘
         │
         ├─→ 3. getSystemPrompt()
         │       └─→ prompts/prompts_zh.ts
         │
         ├─→ 4. DialogueService.callAPI()
         │       └─→ HTTP请求
         │
         └─→ 5. parseAction()
                 └─→ parsers/ActionParser.ts
```

### 响应解析流程

```
API Response (流式/非流式)
    │
    ▼
┌─────────────────────┐
│ DialogueService     │
│  (通用API调用)      │
└──────────┬──────────┘
           │
           │ 返回原始响应文本
           ▼
┌─────────────────────┐
│ OpenAutoGLM         │
│ DialogueProvider    │
└──────────┬──────────┘
           │
           │ parseAction()
           ▼
┌─────────────────────┐
│ ActionParser        │
│  - parseDoAction()   │
│  - 提取 do() 指令   │
└──────────┬──────────┘
           │
           │ 返回 TaskAction
           ▼
┌─────────────────────┐
│ TaskExecutionEngine │
│  (执行操作)         │
└─────────────────────┘
```

---

## 🎯 接口交互图

```
┌─────────────────────────────────────────────────────────────┐
│                    DialogueProvider                        │
│                    (接口定义)                               │
├─────────────────────────────────────────────────────────────┤
│ + getSystemPrompt(): Promise<string>                        │
│ + getAction(request): Promise<DialogueResponse>             │
│ + parseAction(text, getScreenSize): Promise<TaskAction>     │
│ + handleStreamingResponse?(response, callback): Promise     │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ implements
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
┌───────┴────────┐                    ┌────────┴────────┐
│ OpenAutoGLM    │                    │    Claude      │
│ Provider       │                    │    Provider    │
├────────────────┤                    ├────────────────┤
│ - prompts/     │                    │ - prompts/     │
│ - parsers/     │                    │ - parsers/     │
│                │                    │                │
│ + getSystem    │                    │ + getSystem    │
│   Prompt()     │                    │   Prompt()     │
│ + getAction()  │                    │ + getAction()  │
│ + parseAction()│                    │ + parseAction()│
└────────────────┘                    └────────────────┘
```

---

## 📊 文件迁移映射

### 当前 → 新位置

```
functionalModule/openAutoGML/
│
├── services/
│   └── prompts_zh.ts
│       └─→ core/engine/dialogue/openAutoGML/prompts/prompts_zh.ts
│
└── modelDialogue/
    ├── AutoGLMActionParser.ts
    │   └─→ core/engine/dialogue/openAutoGML/parsers/ActionParser.ts
    │
    └── AutoGLMStreamParser.ts
        └─→ core/engine/dialogue/openAutoGML/parsers/StreamParser.ts
```

### 新增文件

```
core/engine/dialogue/
│
├── types/
│   ├── DialogueProvider.ts          # 新增：接口定义
│   ├── DialogueRequest.ts           # 新增：请求类型
│   └── DialogueResponse.ts         # 新增：响应类型
│
├── openAutoGML/
│   └── OpenAutoGLMDialogueProvider.ts  # 新增：提供者实现
│
└── factory.ts                       # 新增：工厂类
```

---

## 🔗 依赖关系图

```
┌─────────────────────────────────────────────────────────────┐
│                    TaskExecutionEngine                      │
│                  (任务执行引擎)                              │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ uses
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              DialogueProviderFactory                         │
│                    (工厂)                                    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ creates
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              DialogueProvider (Interface)                    │
│                    (接口)                                    │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ openAutoGML  │ │   Claude     │ │    GPT-4    │
│  Provider    │ │   Provider   │ │   Provider  │
└──────┬───────┘ └──────────────┘ └──────────────┘
       │
       ├─→ prompts/prompts_zh.ts
       │       └─→ SettingsService (依赖)
       │
       ├─→ parsers/ActionParser.ts
       │       └─→ TaskAction (类型)
       │
       └─→ parsers/StreamParser.ts
               └─→ AutoGLMResponse (类型)
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  DialogueService                            │
│              (通用API调用服务)                               │
│  - callAPI()                                                 │
│  - normalizeApiUrl()                                         │
│  - imageToBase64()                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 扩展示例

### 添加 Claude 支持

```
dialogue/
├── claude/
│   ├── prompts/
│   │   └── prompts_en.ts        # Claude 使用英文提示词
│   │
│   ├── parsers/
│   │   ├── ActionParser.ts      # Claude 特定的动作解析
│   │   └── StreamParser.ts      # Claude 流式响应解析
│   │
│   ├── ClaudeDialogueProvider.ts
│   │   └─→ implements DialogueProvider
│   │
│   └── index.ts
│
└── factory.ts
    └─→ case 'claude': return new ClaudeDialogueProvider()
```

### 使用方式

```typescript
// 在 ModelInferenceModule 中
const provider = DialogueProviderFactory.getProviderByModel(model);
const result = await provider.getAction({
  screenshotUri,
  task,
  model,
  conversationHistory,
  onStreamUpdate,
});
```

---

## 📈 优势总结

### 1. **模块化**
- 每个模型实现独立目录
- 提示词、解析器、提供者分离

### 2. **可扩展**
- 新增模型只需实现接口
- 不影响现有代码

### 3. **可测试**
- 接口可Mock
- 各组件独立测试

### 4. **易维护**
- 职责清晰
- 代码组织合理

