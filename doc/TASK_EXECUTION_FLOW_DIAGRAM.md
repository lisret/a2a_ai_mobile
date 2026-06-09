# 任务执行流程抽象图

## 主流程图

```mermaid
graph TD
    A[用户发起任务] --> B[TaskExecutionEngine.execute]
    B --> C[初始化模块]
    C --> D[前置初始化]
    D --> E[进入任务循环]
    
    E --> F{检查取消}
    F -->|已取消| Z[任务中断]
    F -->|继续| G[增加步骤计数]
    
    G --> H[执行步骤 executeStep]
    
    H --> I[1. 截图]
    I --> J[2. 模型推理]
    J --> K[3. 更新对话历史]
    K --> L{检查完成}
    
    L -->|完成| Y[任务完成]
    L -->|继续| M[4. 执行操作]
    M --> N[5. 记录步骤]
    N --> O[6. 等待UI更新]
    
    O --> P{达到最大步骤?}
    P -->|否| E
    P -->|是| X[任务失败: 达到最大步骤数]
    
    Y --> AA[构建完成任务]
    X --> BB[构建失败任务]
    AA --> CC[清理资源]
    BB --> CC
    CC --> DD[返回结果]
```

## 模型推理详细流程

```mermaid
graph TD
    A[ModelInferenceModule.infer] --> B[选择提示词提供者]
    B --> C[获取系统提示词]
    C --> D[调用API服务]
    
    D --> E[构建请求消息]
    E --> F[发送HTTP请求]
    F --> G{响应类型}
    
    G -->|流式| H[处理流式响应]
    G -->|非流式| I[解析JSON响应]
    
    H --> J[累积内容]
    I --> J
    
    J --> K[选择解析器]
    K --> L[解析响应]
    
    L --> M[提取思考过程]
    M --> N[输出思考过程日志]
    N --> O[解析操作指令]
    O --> P[输出执行动作日志]
    P --> Q[返回TaskAction]
```

## 操作执行流程

```mermaid
graph TD
    A[ActionExecutionModule.execute] --> B{操作类型}
    
    B -->|click| C[performClick]
    B -->|swipe| D[performSwipe]
    B -->|input| E[performTextInput]
    B -->|back| F[performBack]
    B -->|home| G[performHome]
    B -->|launch| H[launchApp]
    B -->|wait| I[setTimeout]
    B -->|longPress| J[performLongPress]
    B -->|doubleTap| K[performDoubleTap]
    
    C --> L[CapabilityService]
    D --> L
    E --> L
    F --> L
    G --> L
    H --> L
    J --> L
    K --> L
    
    L --> M[执行完成]
    I --> M
```

## 模块交互图

```mermaid
graph LR
    A[TaskExecutionEngine] --> B[ScreenshotModule]
    A --> C[ModelInferenceModule]
    A --> D[ActionExecutionModule]
    A --> E[ConversationHistoryModule]
    A --> F[StepManagementModule]
    A --> G[ErrorHandlingModule]
    A --> H[TaskStateModule]
    A --> I[CancellationModule]
    
    C --> J[DialogueFactory]
    C --> K[DialogueService]
    
    J --> L[PromptProvider]
    J --> M[Parser]
    
    K --> N[API调用]
    
    M --> O[ActionParser]
    M --> P[StreamParser]
    
    D --> Q[CapabilityService]
    B --> Q
    
    Q --> R[AccessibilityCapability]
    Q --> S[ADBCapability]
```

## 数据流图

```mermaid
graph LR
    A[用户指令] --> B[任务循环]
    B --> C[截图]
    C --> D[模型推理]
    D --> E[思考过程]
    D --> F[操作指令]
    E --> G[日志输出]
    F --> H[执行操作]
    F --> G
    H --> I[等待UI更新]
    I --> B
```

## 状态转换图

```mermaid
stateDiagram-v2
    [*] --> idle: 初始化
    idle --> waiting: 任务启动
    waiting --> running: 开始执行
    running --> running: 执行步骤
    running --> success: 任务完成
    running --> failed: 任务失败
    running --> [*]: 任务取消
    success --> [*]
    failed --> [*]
```

## 错误处理流程

```mermaid
graph TD
    A[步骤执行] --> B{发生错误?}
    B -->|否| C[重置错误计数]
    B -->|是| D[ErrorHandlingModule]
    
    D --> E{连续错误次数}
    E -->|< maxErrors| F[记录错误]
    E -->|>= maxErrors| G[终止任务]
    
    F --> H[继续下一步骤]
    G --> I[抛出错误]
    
    C --> J[继续执行]
    H --> J
```

## 对话历史管理

```mermaid
graph LR
    A[首次步骤] --> B[添加系统提示词]
    B --> C[添加用户消息]
    C --> D[添加截图]
    D --> E[模型推理]
    E --> F[添加助手响应]
    F --> G[后续步骤]
    G --> C
```

## 能力服务架构

```mermaid
graph TD
    A[CapabilityService] --> B[AccessibilityCapability]
    A --> C[ADBCapability]
    
    B --> D[无障碍服务]
    C --> E[ADB服务]
    
    D --> F[截图]
    D --> G[点击]
    D --> H[滑动]
    D --> I[输入]
    
    E --> F
    E --> G
    E --> H
    E --> I
    E --> J[启动应用]
```

## 时间线图

```mermaid
gantt
    title 任务执行时间线
    dateFormat X
    axisFormat %s
    
    section 初始化
    初始化模块 :0, 1s
    前置初始化 :1s, 1s
    
    section 步骤1
    截图 :2s, 1s
    模型推理 :3s, 3s
    执行操作 :6s, 1s
    等待UI更新 :7s, 1s
    
    section 步骤2
    截图 :8s, 1s
    模型推理 :9s, 3s
    执行操作 :12s, 1s
    等待UI更新 :13s, 1s
```

