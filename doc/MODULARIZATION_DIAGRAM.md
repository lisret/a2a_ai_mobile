# 项目模块化结构抽象图

## 🏗️ 架构层次图

```
┌─────────────────────────────────────────────────────────────────┐
│                        应用入口层                                 │
│                    (App.tsx, index.js)                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      导航层 (Navigation)                         │
│                    AppNavigator.tsx                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   功能模块层 (Features)                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Model   │  │   Task   │  │ Settings │  │  Debug   │       │
│  │ Feature  │  │ Feature  │  │ Feature  │  │ Feature  │       │
│  │          │  │          │  │          │  │          │       │
│  │ screens/ │  │ screens/ │  │ screens/ │  │ screens/ │       │
│  │ services/│  │ services/│  │ services/│  │ services/│       │
│  │ comps/   │  │ hooks/   │  │          │  │          │       │
│  │          │  │ comps/   │  │          │  │          │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │             │             │             │              │
└───────┼─────────────┼─────────────┼─────────────┼──────────────┘
        │             │             │             │
        └─────────────┴─────────────┴─────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   共享资源层 (Shared)                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │Components│  │   Utils  │  │Constants │  │  Types   │       │
│  │ (通用UI) │  │ (工具函数)│  │  (常量)  │  │ (共享类型)│       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    核心模块层 (Core)                             │
│  ┌──────────────────────────┐  ┌──────────────────────────┐    │
│  │      Ability Module      │  │      Engine Module       │    │
│  │      (能力模块)           │  │      (执行引擎)          │    │
│  │                          │  │                          │    │
│  │  ┌──────────┐            │  │  ┌────────────────────┐ │    │
│  │  │Accessible│            │  │  │  Dialogue Module   │ │    │
│  │  │  -ity    │            │  │  │  (模型对话模块)     │ │    │
│  │  └──────────┘            │  │  │                    │ │    │
│  │  ┌──────────┐            │  │  │  ┌──────────────┐ │ │    │
│  │  │   ADB    │            │  │  │  │ openAutoGML  │ │ │    │
│  │  └──────────┘            │  │  │  │  Provider    │ │ │    │
│  │  ┌──────────┐            │  │  │  └──────────────┘ │ │    │
│  │  │ Manager  │            │  │  │  ┌──────────────┐ │ │    │
│  │  └──────────┘            │  │  │  │   Claude     │ │ │    │
│  │                          │  │  │  │  Provider   │ │ │    │
│  │                          │  │  │  └──────────────┘ │ │    │
│  └──────────────────────────┘  │  └────────────────────┘ │    │
│                                │                          │    │
│                                │  ┌────────────────────┐ │    │
│                                │  │ openAutoGML Engine │ │    │
│                                │  │  (任务执行引擎)     │ │    │
│                                │  │  - task/           │ │    │
│                                │  │  - services/       │ │    │
│                                │  │  - types/          │ │    │
│                                │  └────────────────────┘ │    │
│                                └──────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   原生层 (Native)                                │
│          Android/iOS 原生模块                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 模块依赖关系

```
┌─────────────────────────────────────────────────────────────┐
│                    依赖方向 (从上到下)                        │
└─────────────────────────────────────────────────────────────┘

Features (功能模块)
    │
    ├─→ Shared (共享资源)
    │       ├─→ Components
    │       ├─→ Utils
    │       ├─→ Constants
    │       └─→ Types
    │
    └─→ Core (核心模块)
            ├─→ Ability (能力模块)
            │       ├─→ Accessibility
            │       └─→ ADB
            │
            └─→ Engine (执行引擎)
                    ├─→ Dialogue (模型对话模块)
                    │       ├─→ openAutoGML Provider
                    │       │       ├─→ Prompts
                    │       │       └─→ Parsers
                    │       └─→ Claude Provider (未来)
                    │
                    └─→ openAutoGML Engine (任务执行引擎)
                            ├─→ Task Modules
                            ├─→ Services
                            └─→ Types
```

---

## 🎯 功能模块详细结构

### Model Feature (模型管理)
```
features/model/
├── screens/
│   ├── ModelListScreen.tsx      (模型列表)
│   ├── AddModelScreen.tsx        (添加模型)
│   └── EditModelScreen.tsx       (编辑模型)
├── services/
│   ├── ModelService.ts           (模型CRUD)
│   └── ModelListService.ts       (模型列表API)
├── components/
│   ├── ModelItem.tsx             (模型项组件)
│   ├── ModelNameSelector.tsx     (模型选择器)
│   └── ApiProviderSelector.tsx   (API提供商选择器)
└── index.ts                      (导出)
```

### Task Feature (任务执行)
```
features/task/
├── screens/
│   └── TaskHistoryScreen.tsx     (任务历史)
├── services/
│   ├── TaskHistoryService.ts     (任务历史存储)
│   └── TaskExecutionHeadless.ts  (后台任务执行)
├── hooks/
│   ├── useTaskHistory.ts         (任务历史钩子)
│   ├── useTaskExecution.ts       (任务执行钩子)
│   └── useTaskExecutionWithBackground.ts (后台执行钩子)
├── components/
│   ├── ChatMessage.tsx           (聊天消息)
│   ├── HistoryPanel.tsx          (历史面板)
│   ├── TaskStatusBadge.tsx       (任务状态徽章)
│   └── TaskStepItem.tsx          (任务步骤项)
└── index.ts
```

### Settings Feature (设置)
```
features/settings/
├── screens/
│   ├── SettingsScreen.tsx        (设置页面)
│   └── APIKeyGuideScreen.tsx     (API密钥指南)
├── services/
│   ├── SettingsService.ts        (设置存储)
│   └── SearchBoxPositionService.ts (搜索框位置)
└── index.ts
```

### Debug Feature (调试)
```
features/debug/
├── screens/
│   └── DebugLogScreen.tsx        (调试日志)
├── services/
│   └── DebugLogService.ts        (日志服务)
└── index.ts
```

---

## 📊 文件数量对比

### 重构前
```
screens/         7个文件 (同层级)
services/        7个文件 (同层级)
components/      11个文件 (7通用 + 4task)
hooks/           2个文件
```

### 重构后
```
features/
├── model/
│   ├── screens/     3个文件
│   ├── services/    2个文件
│   └── components/  3个文件
├── task/
│   ├── screens/     1个文件
│   ├── services/    2个文件
│   ├── hooks/       3个文件
│   └── components/  4个文件
├── settings/
│   ├── screens/     2个文件
│   └── services/    2个文件
└── debug/
    ├── screens/     1个文件
    └── services/    1个文件

shared/
├── components/       5个文件 (通用组件)
└── hooks/           0个文件 (通用钩子，如有)
```

**优势**：每个目录下文件数量控制在1-4个，结构更清晰

---

## 🔄 模块间通信

```
┌─────────────┐
│   Feature   │ ──┐
│   (Model)   │   │
└─────────────┘   │
                  │
┌─────────────┐   │    ┌──────────────┐
│   Feature   │ ──┼───→│    Shared    │
│   (Task)    │   │    │  (共享资源)   │
└─────────────┘   │    └──────────────┘
                  │
┌─────────────┐   │    ┌──────────────┐
│   Feature   │ ──┘    │     Core     │
│  (Settings) │        │  (核心模块)   │
└─────────────┘        └──────────────┘
```

**原则**：
- Features 之间不直接依赖
- Features 通过 Shared 共享资源
- Features 通过 Core 使用底层能力
- Core 不依赖 Features
- Dialogue 模块独立，支持多模型实现
- Task Engine 通过 Dialogue Provider 调用模型

---

## 🗣️ 对话模块详细架构

### Dialogue Module 结构

```
core/engine/dialogue/
│
├── types/                              # 接口定义层
│   └── DialogueProvider.ts            # 统一接口
│
├── openAutoGML/                        # Open-AutoGLM 实现
│   ├── prompts/                        # 提示词
│   │   └── prompts_zh.ts
│   ├── parsers/                        # 解析器
│   │   ├── ActionParser.ts
│   │   └── StreamParser.ts
│   └── OpenAutoGLMDialogueProvider.ts  # 提供者实现
│
├── claude/                             # Claude 实现（未来）
│   └── ...
│
└── factory.ts                          # 工厂类
```

### 对话模块调用流程

```
TaskExecutionEngine
    │
    ├─→ ModelInferenceModule
    │       │
    │       └─→ DialogueProviderFactory
    │               │
    │               └─→ DialogueProvider (接口)
    │                       │
    │                       ├─→ getSystemPrompt()
    │                       │       └─→ prompts/prompts_zh.ts
    │                       │
    │                       ├─→ getAction()
    │                       │       ├─→ DialogueService.callAPI()
    │                       │       └─→ parseAction()
    │                       │               └─→ parsers/ActionParser.ts
    │                       │
    │                       └─→ handleStreamingResponse()
    │                               └─→ parsers/StreamParser.ts
```

### 对话模块优势

1. **可扩展性**：新增模型只需实现 `DialogueProvider` 接口
2. **职责分离**：提示词、解析器、API调用分离
3. **易于测试**：接口可Mock，组件独立测试
4. **多模型支持**：同一架构支持不同模型的对话格式

---

## 📚 相关文档

- **对话模块详细规划**：参见 `DIALOGUE_MODULE_PLAN.md`
- **对话模块架构图**：参见 `DIALOGUE_MODULE_DIAGRAM.md`

