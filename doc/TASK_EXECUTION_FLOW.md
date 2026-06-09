# 任务执行流程文档

## 概述

本文档描述了 Open-AutoGLM 任务执行的完整流程，从任务启动到完成的所有步骤。

## 整体架构

```
用户指令
    ↓
TaskExecutionEngine (任务执行引擎)
    ↓
┌─────────────────────────────────────────┐
│  任务循环 (executeTaskLoop)              │
│  ┌───────────────────────────────────┐ │
│  │ 步骤1: 截图 (ScreenshotModule)     │ │
│  │ 步骤2: 模型推理 (ModelInference)   │ │
│  │ 步骤3: 执行操作 (ActionExecution) │ │
│  │ 步骤4: 等待UI更新                  │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
    ↓
任务完成/失败
```

## 详细流程

### 1. 任务启动阶段

```
用户发起任务
    ↓
TaskExecutionEngine.execute(config)
    ↓
初始化模块
  - TaskStateModule: 初始化任务状态
  - CancellationModule: 初始化取消机制
  - StepManagementModule: 清空步骤记录
  - ConversationHistoryModule: 清空对话历史
  - ErrorHandlingModule: 重置错误处理
    ↓
前置初始化 (preInitialize)
  - 检查无障碍服务
  - 初始化能力服务
  - 检查应用状态
    ↓
进入任务循环
```

### 2. 任务循环阶段 (executeTaskLoop)

每个步骤执行以下流程：

```
步骤开始
    ↓
检查取消状态
    ↓
增加步骤计数
    ↓
┌─────────────────────────────────────┐
│ executeStep (执行单个步骤)          │
│                                     │
│ 1. 截图                             │
│    ScreenshotModule.capture()      │
│    ↓                                │
│    capabilityService.captureScreen()│
│    ↓                                │
│    返回 screenshotUri               │
│                                     │
│ 2. 模型推理                         │
│    ModelInferenceModule.infer()    │
│    ↓                                │
│    ┌─────────────────────────────┐ │
│    │ 步骤2.1: 选择提示词提供者    │ │
│    │ DialogueFactory.getPrompt   │ │
│    │ Provider(model)              │ │
│    │ ↓                            │ │
│    │ promptProvider.getSystem     │ │
│    │ Prompt()                     │ │
│    └─────────────────────────────┘ │
│    ↓                                │
│    ┌─────────────────────────────┐ │
│    │ 步骤2.2: 调用API服务         │ │
│    │ DialogueService.callAPI()    │ │
│    │ ↓                            │ │
│    │ - 构建请求消息                │ │
│    │ - 发送HTTP请求                │ │
│    │ - 处理流式响应                │ │
│    │ - 返回响应内容                │ │
│    └─────────────────────────────┘ │
│    ↓                                │
│    ┌─────────────────────────────┐ │
│    │ 步骤2.3: 选择解析器           │ │
│    │ DialogueFactory.getParser   │ │
│    │ (model)                      │ │
│    └─────────────────────────────┘ │
│    ↓                                │
│    ┌─────────────────────────────┐ │
│    │ 步骤2.4: 解析响应             │ │
│    │ parser.parseAction()         │ │
│    │ ↓                            │ │
│    │ - 提取思考过程                │ │
│    │ - 输出思考过程日志            │ │
│    │ - 解析操作指令                │ │
│    │ - 输出执行动作日志            │ │
│    │ - 返回 TaskAction            │ │
│    └─────────────────────────────┘ │
│                                     │
│ 3. 更新对话历史                     │
│    ConversationHistoryModule       │
│    .addMessage()                    │
│                                     │
│ 4. 检查完成                         │
│    if (action.type === 'complete') │
│      → 任务完成，退出循环           │
│                                     │
│ 5. 执行操作                         │
│    ActionExecutionModule.execute() │
│    ↓                                │
│    capabilityService.performXXX()   │
│    (根据action.type执行相应操作)    │
│                                     │
│ 6. 记录步骤                         │
│    StepManagementModule.addStep()   │
│    TaskStateModule.emitStepUpdate() │
│                                     │
│ 7. 等待UI更新                       │
│    waitForUIUpdate(action)         │
│    (根据操作类型等待不同时间)        │
└─────────────────────────────────────┘
    ↓
检查是否达到最大步骤数
    ↓
继续下一步骤 或 任务完成
```

### 3. 模型推理详细流程

```
ModelInferenceModule.infer()
    ↓
┌──────────────────────────────────────┐
│ 步骤1: 选择提示词提供者              │
│ DialogueFactory.getPromptProvider() │
│ ↓                                    │
│ 根据 model 参数选择                  │
│ - OpenAutoGLMPromptProvider         │
│ - (未来可扩展其他模型)               │
│ ↓                                    │
│ promptProvider.getSystemPrompt()     │
│ - 获取系统提示词                     │
│ - 包含操作说明、规则等               │
└──────────────────────────────────────┘
    ↓
┌──────────────────────────────────────┐
│ 步骤2: 调用通用API服务               │
│ DialogueService.callAPI()            │
│ ↓                                    │
│ 构建请求:                             │
│ - 系统提示词                          │
│ - 对话历史                            │
│ - 当前截图 (base64)                   │
│ - 任务指令 (首次)                     │
│ ↓                                    │
│ 发送HTTP请求:                         │
│ POST /chat/completions               │
│ ↓                                    │
│ 处理响应:                             │
│ - 流式响应 → handleStreamingResponse │
│ - 非流式响应 → 直接解析               │
│ ↓                                    │
│ 返回响应内容                          │
└──────────────────────────────────────┘
    ↓
┌──────────────────────────────────────┐
│ 步骤3: 选择解析器                     │
│ DialogueFactory.getParser()          │
│ ↓                                    │
│ 根据 model 参数选择                  │
│ - OpenAutoGLMParser                  │
│ - (未来可扩展其他解析器)              │
└──────────────────────────────────────┘
    ↓
┌──────────────────────────────────────┐
│ 步骤4: 解析响应                       │
│ parser.parseAction()                 │
│ ↓                                    │
│ 1. 提取思考过程                        │
│    extractReasoning()                 │
│    - 匹配 <think>...</think>          │
│    - 输出思考过程日志                  │
│ ↓                                    │
│ 2. 解析操作指令                        │
│    parseDoAction()                    │
│    - 匹配 do(action="...")            │
│    - 或 finish(message="...")         │
│    - 解析参数                          │
│    - 坐标映射 (0-999 → 实际分辨率)    │
│ ↓                                    │
│ 3. 输出执行动作                        │
│    getActionDescription()             │
│    - 格式化动作描述                    │
│    - 输出动作日志                      │
│ ↓                                    │
│ 返回 TaskAction                       │
└──────────────────────────────────────┘
```

### 4. 操作执行流程

```
ActionExecutionModule.execute(action)
    ↓
根据 action.type 执行相应操作:
    ↓
┌─────────────────────────────────────┐
│ click → capabilityService           │
│         .performClick(x, y)          │
│                                     │
│ swipe → capabilityService            │
│         .performSwipe(start, end)    │
│                                     │
│ input → capabilityService            │
│         .performTextInput(text)      │
│                                     │
│ back → capabilityService             │
│        .performBack()               │
│                                     │
│ home → capabilityService            │
│        .performHome()               │
│                                     │
│ launch → capabilityService           │
│          .launchApp(app)            │
│                                     │
│ wait → setTimeout(duration)         │
│                                     │
│ (其他操作...)                        │
└─────────────────────────────────────┘
    ↓
操作完成
```

### 5. 错误处理流程

```
步骤执行中发生错误
    ↓
ErrorHandlingModule.handleError()
    ↓
检查连续错误次数
    ↓
┌─────────────────────────────────────┐
│ 如果连续错误 < maxConsecutiveErrors: │
│ - 记录错误                           │
│ - 返回 shouldContinue = true         │
│ - 继续执行下一步骤                   │
│                                     │
│ 如果连续错误 >= maxConsecutiveErrors:│
│ - 记录错误                           │
│ - 返回 shouldContinue = false        │
│ - 抛出错误，终止任务                 │
└─────────────────────────────────────┘
```

### 6. 任务完成阶段

```
任务循环结束
    ↓
┌─────────────────────────────────────┐
│ 构建完成的任务                        │
│ buildCompletedTask()                 │
│ - 收集所有步骤                        │
│ - 设置状态为 'success'               │
│ - 保存到历史记录                      │
└─────────────────────────────────────┘
    ↓
TaskStateModule.emitTaskComplete()
    ↓
清理资源 (cleanup)
    ↓
返回完成的任务
```

## 关键模块说明

### TaskExecutionEngine
- **职责**: 任务执行的主控制器
- **功能**: 协调各个模块，管理任务生命周期

### ScreenshotModule
- **职责**: 屏幕截图
- **功能**: 捕获当前屏幕状态，用于模型分析

### ModelInferenceModule
- **职责**: 模型推理
- **功能**: 调用AI模型，获取操作指令

### ActionExecutionModule
- **职责**: 操作执行
- **功能**: 执行模型返回的操作指令

### ConversationHistoryModule
- **职责**: 对话历史管理
- **功能**: 维护用户指令和模型响应的历史记录

### StepManagementModule
- **职责**: 步骤管理
- **功能**: 记录和管理任务执行步骤

### ErrorHandlingModule
- **职责**: 错误处理
- **功能**: 处理执行过程中的错误，决定是否继续

### TaskStateModule
- **职责**: 任务状态管理
- **功能**: 管理任务状态，发送状态更新事件

### CancellationModule
- **职责**: 取消机制
- **功能**: 处理任务取消请求

## 数据流

```
用户指令 (instruction)
    ↓
任务循环
    ↓
截图 (screenshotUri)
    ↓
模型推理
    ↓
思考过程 (reasoning) + 操作指令 (action)
    ↓
执行操作
    ↓
等待UI更新
    ↓
下一步骤 (重复)
```

## 事件流

```
TaskStarted → 任务开始
    ↓
StepStarted → 步骤开始
    ↓
StreamUpdate → 流式更新 (模型响应)
    ↓
StepUpdate → 步骤更新 (操作执行)
    ↓
TaskCompleted → 任务完成
    ↓
或
    ↓
TaskFailed → 任务失败
```

## 关键配置

- `maxSteps`: 最大步骤数（默认99）
- `maxConsecutiveErrors`: 最大连续错误数（默认3）
- `SCREENSHOT_TIMEOUT_MS`: 截图超时时间
- `API_TIMEOUT_MS`: API调用超时时间
- `ACTION_TIMEOUT_MS`: 操作执行超时时间

## 扩展点

1. **提示词提供者**: 通过 `DialogueFactory` 可以添加新的模型提示词
2. **解析器**: 通过 `DialogueFactory` 可以添加新的响应解析器
3. **能力服务**: 通过 `CapabilityService` 可以添加新的设备能力
4. **操作类型**: 在 `ActionParser` 中可以添加新的操作类型

