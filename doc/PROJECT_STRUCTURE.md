# 项目结构说明

> **最后更新**: 2024-12-25
> 
> 本文档详细说明了重构后的项目结构、各模块职责和依赖关系。

## 目录结构

```
AwesomeProject/
├── src/
│   ├── components/          # 通用 UI 组件
│   │   ├── task/            # 任务相关组件
│   │   │   ├── ChatMessage.tsx          # 聊天消息组件
│   │   │   ├── TaskStepItem.tsx         # 任务步骤项组件
│   │   │   ├── HistoryPanel.tsx         # 历史任务侧边面板
│   │   │   └── TaskStatusBadge.tsx      # 任务状态徽章
│   │   ├── ConfirmModal.tsx             # 确认对话框
│   │   ├── EmptyState.tsx               # 空状态组件
│   │   ├── FAB.tsx                      # 浮动操作按钮
│   │   ├── Icon.tsx                     # 图标组件
│   │   └── ModelItem.tsx                # 模型列表项
│   │
│   ├── constants/           # 常量配置
│   │   └── index.ts                     # 统一常量管理
│   │
│   ├── features/            # 功能模块（按业务领域组织）
│   │   └── task/            # 任务功能模块
│   │       └── useTaskExecutionWithBackground.ts  # 后台任务执行逻辑
│   │
│   ├── hooks/               # 自定义 Hooks
│   │   ├── useTaskExecution.ts          # 任务执行 Hook
│   │   └── useTaskHistory.ts            # 任务历史 Hook
│   │
│   ├── navigation/          # 导航配置
│   │   └── AppNavigator.tsx             # 导航器配置
│   │
│   ├── screens/             # 页面组件
│   │   ├── AddModelScreen.tsx           # 添加模型页面
│   │   ├── EditModelScreen.tsx          # 编辑模型页面
│   │   ├── ModelListScreen.tsx          # 模型列表页面
│   │   ├── SettingsScreen.tsx           # 设置页面
│   │   ├── TaskDetailScreen.tsx         # 任务详情页面
│   │   ├── TaskExecutionScreen.tsx      # 任务执行页面（已废弃）
│   │   ├── TaskHistoryScreen.tsx        # 任务历史页面
│   │   └── TaskInputScreen.tsx          # 任务输入页面
│   │
│   ├── services/            # 服务层（数据访问和业务逻辑）
│   │   ├── AccessibilityService.ts     # 无障碍服务封装
│   │   ├── ADBService.ts                # ADB 服务封装
│   │   ├── AutoGLMService.ts            # Open-AutoGLM API 服务
│   │   ├── ModelService.ts              # 模型管理服务
│   │   ├── SettingsService.ts           # 设置管理服务
│   │   ├── TaskExecutionHeadless.ts     # Headless JS 任务执行
│   │   ├── TaskHistoryService.ts        # 任务历史服务
│   │   └── prompts_zh.ts                # 系统提示词
│   │
│   ├── types/               # TypeScript 类型定义
│   │   ├── Model.ts                     # 模型类型
│   │   ├── navigation.ts                # 导航类型
│   │   └── Task.ts                      # 任务类型
│   │
│   └── utils/               # 工具函数
│       ├── formatters.ts                # 格式化工具
│       ├── storage.ts                   # 存储工具
│       ├── taskHelpers.ts              # 任务相关工具
│       └── validation.ts                # 验证工具
│
└── android/                 # Android 原生代码
    └── app/src/main/java/com/awesomeproject/
        ├── AccessibilityModule.kt        # 无障碍模块桥接
        ├── AutoGLMAccessibilityService.kt # 无障碍服务
        ├── TaskExecutionService.kt       # 前台服务
        └── TaskExecutionHeadlessService.kt # Headless JS 服务
```

## 架构层次

### 1. 展示层 (Presentation Layer)
- **位置**: `screens/`, `components/`
- **职责**: UI 渲染和用户交互
- **特点**: 
  - 页面组件只负责 UI 展示和事件处理
  - 通过 Hooks 获取数据和业务逻辑
  - 组件可复用，职责单一

### 2. 业务逻辑层 (Business Logic Layer)
- **位置**: `hooks/`, `features/`
- **职责**: 封装业务逻辑，连接 UI 和服务层
- **特点**:
  - `hooks/` 提供可复用的业务逻辑 Hook
  - `features/` 按功能模块组织复杂业务逻辑
  - 便于测试和复用

### 3. 服务层 (Service Layer)
- **位置**: `services/`
- **职责**: 数据访问、API 调用、原生模块桥接
- **特点**:
  - 单一职责，每个服务专注一个领域
  - 提供统一的接口，便于扩展和替换
  - 不包含 UI 逻辑

### 4. 数据层 (Data Layer)
- **位置**: `services/` (存储相关), `types/`
- **职责**: 数据模型定义和数据持久化
- **特点**:
  - 使用 AsyncStorage 进行本地存储
  - TypeScript 类型定义确保类型安全

### 5. 工具层 (Utils Layer)
- **位置**: `utils/`, `constants/`
- **职责**: 通用工具函数和常量
- **特点**:
  - 纯函数，无副作用
  - 可跨模块复用

## 模块说明

### Components (组件层)

#### 通用组件 (`components/`)
- **ConfirmModal**: 确认对话框，支持危险操作样式
- **EmptyState**: 空状态展示组件
- **FAB**: 浮动操作按钮
- **Icon**: 统一的图标组件，使用 FontAwesome
- **ModelItem**: 模型列表项，包含编辑和删除操作

#### 任务组件 (`components/task/`)
- **ChatMessage**: 聊天消息组件，支持用户和 AI 消息
- **TaskStepItem**: 任务步骤项，支持展开/收起思考过程
- **HistoryPanel**: 历史任务侧边面板，支持滑动动画
- **TaskStatusBadge**: 任务状态徽章，显示任务执行状态

### Hooks (业务逻辑层)

#### useTaskExecution
- **职责**: 封装任务执行的前台逻辑
- **功能**:
  - 无障碍服务检查和初始化
  - 任务执行循环（截图 → 调用模型 → 执行操作）
  - 错误处理和重试机制
  - 任务取消支持
- **使用场景**: 前台任务执行

#### useTaskHistory
- **职责**: 封装任务历史管理逻辑
- **功能**:
  - 加载任务列表
  - 选择任务
  - 删除任务
  - 刷新任务列表
- **使用场景**: 任务历史页面

### Services (服务层)

#### AccessibilityService
- **职责**: 封装 Android 无障碍服务功能
- **功能**:
  - 截图（支持 Android 5.0-10 和 11+）
  - 点击、滑动、输入、返回等操作
  - 悬浮窗管理
  - 前台服务管理
  - WakeLock 管理
  - Headless JS 任务启动

#### AutoGLMService
- **职责**: 与 Open-AutoGLM API 通信
- **功能**:
  - 调用模型 API 获取操作指令
  - 支持流式响应
  - 解析模型返回的 `do()` 格式指令
  - 坐标映射（0-999 到实际分辨率）

#### TaskHistoryService
- **职责**: 任务历史数据管理
- **功能**:
  - 保存/加载任务
  - 按模型 ID 查询任务
  - 删除任务
  - 自动删除超过 50 条的最早记录

#### ADBService
- **职责**: ADB 命令执行（作为无障碍服务的兜底）
- **功能**:
  - 通过 ADB 执行点击、滑动、输入等操作
  - ADB 截图

#### SettingsService
- **职责**: 应用设置管理
- **功能**:
  - ADB 兜底开关
  - 后台运行开关

### Features (功能模块)

#### task/useTaskExecutionWithBackground
- **职责**: 封装后台任务执行的统一逻辑
- **功能**:
  - 根据设置选择前台或后台执行
  - 启动 Headless JS 任务
  - 监听后台任务事件

### Constants (常量)

#### TASK_CONFIG
- 任务执行相关配置（最大步数、超时时间等）

#### UI_CONFIG
- UI 相关常量（面板宽度、消息最大宽度等）

#### ACCESSIBILITY_CONFIG
- 无障碍服务配置（重试次数、超时时间等）

#### COLORS
- 统一的颜色主题

#### STORAGE_KEYS
- AsyncStorage 键名常量

### Utils (工具函数)

#### formatters.ts
- `formatTime`: 格式化时间戳为相对时间
- `truncateText`: 截断文本

#### taskHelpers.ts
- `getActionDescription`: 获取操作描述
- `getStatusColor`: 获取状态颜色
- `getStatusText`: 获取状态文本
- `getTaskTitle`: 获取任务标题

## 设计原则

### 1. 单一职责原则 (SRP)
- 每个模块、组件、服务只负责一个明确的功能
- 例如：`TaskHistoryService` 只负责任务历史数据管理

### 2. 依赖倒置原则 (DIP)
- UI 层依赖 Hooks，Hooks 依赖 Services
- Services 通过接口定义，便于替换实现

### 3. 开闭原则 (OCP)
- 通过 Hooks 和 Services 的抽象，便于扩展新功能
- 新增功能时，只需添加新的 Hook 或 Service，无需修改现有代码

### 4. 模块化
- 按功能领域组织代码（task, model, settings）
- 组件按用途分类（通用组件、任务组件）

### 5. 可测试性
- 业务逻辑集中在 Hooks 和 Services，便于单元测试
- 纯函数工具函数，易于测试

## 扩展指南

### 添加新功能
1. **新页面**: 在 `screens/` 创建页面组件
2. **新业务逻辑**: 在 `hooks/` 或 `features/` 创建 Hook
3. **新服务**: 在 `services/` 创建服务类
4. **新组件**: 在 `components/` 创建可复用组件
5. **新类型**: 在 `types/` 定义 TypeScript 类型

### 添加新常量
- 在 `constants/index.ts` 中添加，按类别组织

### 添加新工具函数
- 在 `utils/` 中创建对应的工具文件

## 依赖关系

```
UI Layer (Screens/Components)
    ↓
Business Logic Layer (Hooks/Features)
    ↓
Service Layer (Services)
    ↓
Data Layer (AsyncStorage/Types)
```

## 注意事项

1. **不要跨层调用**: UI 层不应直接调用 Service，应通过 Hooks
2. **保持组件纯净**: 组件只负责 UI，业务逻辑放在 Hooks
3. **服务层无 UI**: Services 不应包含任何 UI 相关代码
4. **类型安全**: 使用 TypeScript 类型确保类型安全
5. **错误处理**: 在适当的层次处理错误，不要向上层暴露底层错误

## 重构后的改进

### 代码量减少
- **TaskHistoryScreen.tsx**: 从 1803 行减少到 837 行（减少 53%）
- 业务逻辑提取到 Hooks，代码更清晰

### 可维护性提升
- 单一职责：每个模块只负责一个明确的功能
- 易于定位：问题可以快速定位到具体模块
- 易于修改：修改功能只需修改对应模块

### 可测试性提升
- Hooks 和 Services 可以独立测试
- 工具函数是纯函数，易于测试
- 已创建测试框架和示例测试（`jest.config.js`, `jest.setup.js`）
- 已安装 `@types/jest` 和测试库（`@testing-library/react`, `@testing-library/react-native`）

### 可扩展性提升
- 新增功能只需添加新的 Hook 或 Service
- 组件可复用，减少重复代码
- 接口定义便于替换实现（`services/interfaces/`）

### 已完成的重构任务
1. ✅ **逐步重构 TaskHistoryScreen.tsx**：使用新创建的组件和 Hooks
2. ✅ **优化服务层**：提取接口定义（`services/interfaces/`）
3. ✅ **添加单元测试**：覆盖 Hooks 和 Services（测试框架已配置，示例测试已创建）
4. ✅ **去除无用代码**：删除 `TaskExecutionScreen.tsx` 和 `TaskInputScreen.tsx`

