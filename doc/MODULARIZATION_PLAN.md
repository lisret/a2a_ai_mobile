# 项目模块化重构方案

## 📊 当前结构问题分析

### 当前结构
```
src/
├── abilityModule/          # 能力模块（Accessibility, ADB）
├── functionalModule/       # 功能模块（openAutoGML核心）
├── components/             # 组件（7个通用 + 4个task相关）
├── screens/                # 屏幕（7个文件）
├── services/               # 服务（7个文件）
├── hooks/                  # 钩子（2个）
├── features/               # 功能（1个task相关）
├── constants/              # 常量
├── types/                  # 类型
├── utils/                  # 工具
└── navigation/             # 导航
```

### 问题
1. **同层级文件过多**：screens/ 和 services/ 各有7个文件，缺乏分组
2. **功能分散**：相关功能分散在不同目录
   - Model管理：`ModelListScreen`, `AddModelScreen`, `EditModelScreen`, `ModelService`, `ModelListService`
   - Task管理：`TaskHistoryScreen`, `TaskHistoryService`, `TaskExecutionHeadless`, `hooks/useTaskHistory`, `hooks/useTaskExecution`
   - Settings：`SettingsScreen`, `SettingsService`
   - Debug：`DebugLogScreen`, `DebugLogService`
3. **组件分类不清**：通用组件和功能组件混在一起

---

## 🎯 模块化重构方案

### 新结构设计（按功能域组织）

```
src/
├── core/                           # 核心模块（底层能力）
│   ├── ability/                    # 能力模块
│   │   ├── accessibility/          # 无障碍能力
│   │   │   ├── AccessibilityActions.ts
│   │   │   ├── AccessibilityCapability.ts
│   │   │   └── AccessibilityService.ts
│   │   ├── adb/                    # ADB能力
│   │   │   ├── ADBAppMappingService.ts
│   │   │   ├── ADBCapability.ts
│   │   │   └── ADBService.ts
│   │   ├── manager/                # 能力管理器
│   │   │   ├── CapabilityManager.ts
│   │   │   └── CapabilityService.ts
│   │   └── index.ts
│   │
│   └── engine/                     # 执行引擎
│       ├── dialogue/               # 模型对话模块（新增，支持多模型）
│       │   ├── types/              # 对话接口类型
│       │   │   ├── DialogueProvider.ts
│       │   │   ├── DialogueRequest.ts
│       │   │   ├── DialogueResponse.ts
│       │   │   └── index.ts
│       │   ├── openAutoGML/        # Open-AutoGLM 实现
│       │   │   ├── prompts/        # 提示词
│       │   │   │   ├── prompts_zh.ts
│       │   │   │   └── index.ts
│       │   │   ├── parsers/        # 解析器
│       │   │   │   ├── ActionParser.ts
│       │   │   │   ├── StreamParser.ts
│       │   │   │   └── index.ts
│       │   │   ├── OpenAutoGLMDialogueProvider.ts
│       │   │   └── index.ts
│       │   ├── claude/             # Claude 实现（未来扩展）
│       │   │   └── ...
│       │   ├── factory.ts          # 对话提供者工厂
│       │   └── index.ts
│       │
│       ├── openAutoGML/            # AutoGLM任务执行引擎
│       │   ├── task/                # 任务执行
│       │   │   ├── modules/         # 执行模块
│       │   │   │   ├── ActionExecutionModule.ts
│       │   │   │   ├── CancellationModule.ts
│       │   │   │   ├── ConversationHistoryModule.ts
│       │   │   │   ├── ErrorHandlingModule.ts
│       │   │   │   ├── ModelInferenceModule.ts
│       │   │   │   ├── ScreenshotModule.ts
│       │   │   │   ├── StepManagementModule.ts
│       │   │   │   └── TaskStateModule.ts
│       │   │   ├── TaskExecutionActions.ts
│       │   │   ├── TaskExecutionEngine.ts
│       │   │   └── TaskExecutionHelpers.ts
│       │   ├── services/           # 引擎服务（通用API调用）
│       │   │   └── DialogueService.ts
│       │   └── types/               # 引擎类型
│       │       ├── Task.ts
│       │       └── index.ts
│       └── index.ts
│
├── features/                       # 功能模块（按业务域组织）
│   ├── model/                      # 模型管理功能
│   │   ├── screens/                 # 模型相关屏幕
│   │   │   ├── ModelListScreen.tsx
│   │   │   ├── AddModelScreen.tsx
│   │   │   └── EditModelScreen.tsx
│   │   ├── services/                # 模型相关服务
│   │   │   ├── ModelService.ts
│   │   │   └── ModelListService.ts
│   │   ├── components/              # 模型相关组件
│   │   │   ├── ModelItem.tsx
│   │   │   ├── ModelNameSelector.tsx
│   │   │   └── ApiProviderSelector.tsx
│   │   └── index.ts                 # 功能导出
│   │
│   ├── task/                        # 任务执行功能
│   │   ├── screens/                 # 任务相关屏幕
│   │   │   └── TaskHistoryScreen.tsx
│   │   ├── services/                # 任务相关服务
│   │   │   ├── TaskHistoryService.ts
│   │   │   └── TaskExecutionHeadless.ts
│   │   ├── hooks/                   # 任务相关钩子
│   │   │   ├── useTaskHistory.ts
│   │   │   ├── useTaskExecution.ts
│   │   │   └── useTaskExecutionWithBackground.ts
│   │   ├── components/              # 任务相关组件
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── HistoryPanel.tsx
│   │   │   ├── TaskStatusBadge.tsx
│   │   │   └── TaskStepItem.tsx
│   │   └── index.ts
│   │
│   ├── settings/                    # 设置功能
│   │   ├── screens/
│   │   │   └── SettingsScreen.tsx
│   │   ├── services/
│   │   │   ├── SettingsService.ts
│   │   │   └── SearchBoxPositionService.ts
│   │   └── index.ts
│   │
│   └── debug/                       # 调试功能
│       ├── screens/
│       │   └── DebugLogScreen.tsx
│       ├── services/
│       │   └── DebugLogService.ts
│       └── index.ts
│
├── shared/                          # 共享资源
│   ├── components/                  # 通用UI组件
│   │   ├── ConfirmModal.tsx
│   │   ├── EmptyState.tsx
│   │   ├── FAB.tsx
│   │   ├── Icon.tsx
│   │   └── PageLayout.tsx
│   ├── hooks/                       # 通用钩子（如果有）
│   ├── utils/                       # 工具函数
│   │   ├── formatters.ts
│   │   ├── storage.ts
│   │   ├── taskHelpers.ts
│   │   └── validation.ts
│   ├── constants/                   # 常量
│   │   ├── apiProviders.ts
│   │   ├── styles.ts
│   │   └── index.ts
│   └── types/                       # 共享类型
│       ├── Model.ts
│       └── navigation.ts
│
└── navigation/                      # 导航配置
    └── AppNavigator.tsx
```

---

## 📈 模块化优势

### 1. **功能内聚**
- 每个功能模块（model, task, settings, debug）包含完整的相关代码
- 屏幕、服务、组件、钩子都在同一功能域下
- 便于功能独立开发和测试

### 2. **层级清晰**
- **core/** - 核心能力，不依赖业务功能
- **features/** - 业务功能，依赖core
- **shared/** - 共享资源，被所有模块使用
- **navigation/** - 导航配置

### 3. **减少同层级文件**
- 原来：screens/ 7个文件 → 现在：分散到4个features，每个feature/screens/最多3个
- 原来：services/ 7个文件 → 现在：分散到4个features，每个feature/services/最多2个

### 4. **易于扩展**
- 新增功能只需在features/下创建新目录
- 功能模块之间低耦合
- 核心模块稳定，业务模块灵活

---

## 🔄 迁移步骤建议

### 核心模块迁移（Core）

1. **第一阶段**：创建新目录结构
   - 创建 `core/ability/` 和 `core/engine/` 目录
   - 创建 `core/engine/dialogue/` 对话模块目录

2. **第二阶段**：迁移能力模块
   - `abilityModule` → `core/ability/`
   - 保持原有结构不变

3. **第三阶段**：拆分对话模块（重点）
   - 创建 `dialogue/types/` 定义接口
   - 创建 `dialogue/openAutoGML/` 目录
   - 移动 `prompts_zh.ts` → `dialogue/openAutoGML/prompts/`
   - 移动 `AutoGLMActionParser.ts` → `dialogue/openAutoGML/parsers/ActionParser.ts`
   - 移动 `AutoGLMStreamParser.ts` → `dialogue/openAutoGML/parsers/StreamParser.ts`
   - 实现 `OpenAutoGLMDialogueProvider` 类
   - 创建 `DialogueProviderFactory` 工厂类

4. **第四阶段**：迁移任务执行引擎
   - `functionalModule/openAutoGML/task/` → `core/engine/openAutoGML/task/`
   - 重构 `AutoGLMService` → `DialogueService`（通用API调用）
   - 更新 `ModelInferenceModule` 使用 `DialogueProvider`

5. **第五阶段**：迁移features模块（按功能域分组）
   - 迁移 model、task、settings、debug 功能模块

6. **第六阶段**：迁移shared资源
   - 迁移通用组件、工具、常量、类型

7. **第七阶段**：更新所有import路径
   - 批量更新所有文件的导入路径

8. **第八阶段**：测试验证
   - 功能测试
   - 集成测试

---

## 📝 注意事项

1. **导入路径更新**：所有文件需要更新import路径
2. **循环依赖**：注意features之间不要产生循环依赖
3. **共享类型**：公共类型放在shared/types，功能特定类型放在features/xxx/types
4. **向后兼容**：可以考虑在旧位置创建re-export文件，逐步迁移
5. **对话模块扩展**：新增模型实现只需在 `dialogue/` 下创建新目录，实现 `DialogueProvider` 接口
6. **提示词和解析器分离**：每个模型实现的提示词和解析器独立，便于定制和维护

---

## 📚 相关文档

- **对话模块详细规划**：参见 `DIALOGUE_MODULE_PLAN.md`
- **对话模块架构图**：参见 `DIALOGUE_MODULE_DIAGRAM.md`
