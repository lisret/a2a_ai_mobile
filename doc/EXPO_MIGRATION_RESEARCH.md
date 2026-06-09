# Expo 项目重构调研报告

## 项目概述

当前项目是一个基于 React Native 0.73.6 的 AI 自动化任务执行应用，主要功能包括：
- AI 模型管理和 API 调用
- 通过无障碍服务或 ADB 执行自动化操作
- 后台任务执行（Headless JS）
- 截图和图像处理
- 悬浮窗显示
- 任务历史记录

## 核心功能迁移分析

### ✅ 可直接迁移的功能

#### 1. UI 界面和导航
- **状态**：完全兼容
- **说明**：所有 React Native 组件和 React Navigation 都可以在 Expo 中使用
- **涉及模块**：
  - 所有 Screen 组件（ModelListScreen、SettingsScreen 等）
  - 导航配置（AppNavigator）
  - 通用组件（FAB、EmptyState、ConfirmModal 等）

#### 2. 数据存储
- **状态**：完全兼容
- **说明**：AsyncStorage 在 Expo 中有对应的 `@react-native-async-storage/async-storage` 包
- **涉及模块**：
  - ModelService
  - TaskHistoryService
  - SettingsService

#### 3. API 调用和网络请求
- **状态**：完全兼容
- **说明**：HTTP 请求、流式响应处理在 Expo 中完全支持
- **涉及模块**：
  - AutoGLMService（API 调用部分）

#### 4. 状态管理和业务逻辑
- **状态**：完全兼容
- **说明**：所有 TypeScript 业务逻辑代码可以直接迁移
- **涉及模块**：
  - 所有 Service 层的业务逻辑
  - Hooks（useTaskExecution、useTaskHistory）
  - Utils（formatters、taskHelpers、validation）

### ⚠️ 需要适配的功能

#### 1. 权限管理
- **状态**：需要替换实现方式
- **当前实现**：使用 `react-native-permissions`
- **Expo 方案**：使用 `expo-permissions` 或 `expo-camera`、`expo-media-library` 等模块
- **影响范围**：
  - 相机权限（二维码扫描）
  - 存储权限
  - 其他系统权限

#### 2. 图标和资源管理
- **状态**：需要调整配置方式
- **当前实现**：手动配置 Android/iOS 资源
- **Expo 方案**：使用 `app.json` 统一配置，支持 `expo-asset` 管理
- **影响范围**：
  - 应用图标生成脚本
  - 资源文件路径

### ❌ 需要重大改造的功能

#### 1. 无障碍服务（AccessibilityService）
- **状态**：需要开发自定义原生模块
- **当前实现**：
  - 自定义 Kotlin 原生模块（AccessibilityModule）
  - AutoGLMAccessibilityService 服务
  - 截图、点击、滑动、输入等操作
- **Expo 方案**：
  - **方案 A（推荐）**：使用 Expo Development Build + 自定义原生代码
    - 需要创建 Expo Config Plugin
    - 将 Kotlin 代码封装为 Expo Module
    - 使用 `expo-build-properties` 配置构建参数
  - **方案 B**：使用 EAS Build 的 Custom Development Client
    - 支持完全自定义原生代码
    - 需要配置 `app.json` 和构建配置
- **迁移复杂度**：高
- **涉及功能**：
  - 屏幕截图
  - 点击、长按、双击操作
  - 滑动操作
  - 文本输入
  - 返回、Home 键操作
  - 应用启动
  - 屏幕尺寸获取

#### 2. ADB 服务（ADBService）
- **状态**：需要开发自定义原生模块
- **当前实现**：
  - 自定义 Kotlin 原生模块（ADBModule）
  - 通过 shell 命令执行操作
- **Expo 方案**：
  - 使用 Expo Development Build + 自定义原生代码
  - 创建 Expo Config Plugin 封装 ADB 功能
- **迁移复杂度**：高
- **涉及功能**：
  - Shell 命令执行
  - 作为无障碍服务的回退方案

#### 3. 后台任务执行（Headless JS）
- **状态**：需要重新设计实现
- **当前实现**：
  - React Native Headless JS（registerHeadlessTask）
  - TaskExecutionHeadlessService（Kotlin）
  - 前台服务（TaskExecutionService）
- **Expo 方案**：
  - **方案 A**：使用 Expo TaskManager + Background Fetch
    - 功能有限，主要用于定时任务
    - 不支持长时间运行的后台任务
  - **方案 B**：使用 Expo Development Build + 自定义原生服务
    - 保留 Headless JS 实现
    - 需要配置前台服务权限
  - **方案 C**：重新设计为前台服务 + 通知
    - 使用 `expo-notifications` 显示任务状态
    - 使用 `expo-task-manager` 管理后台任务
- **迁移复杂度**：高
- **限制说明**：
  - Expo Go 不支持后台任务
  - 需要 Development Build 或 Production Build

#### 4. 悬浮窗功能
- **状态**：需要自定义原生模块
- **当前实现**：
  - 通过 AccessibilityModule 显示系统悬浮窗
  - 需要 SYSTEM_ALERT_WINDOW 权限
- **Expo 方案**：
  - 使用 Expo Development Build + 自定义原生代码
  - 创建 Expo Module 封装悬浮窗功能
- **迁移复杂度**：中
- **替代方案**：
  - 使用全屏覆盖层（React Native Modal）
  - 使用通知栏显示信息

## 技术架构对比

### 当前架构（React Native CLI）
```
React Native CLI
├── JavaScript/TypeScript 层
│   ├── UI 组件
│   ├── 业务逻辑
│   └── 服务层
└── 原生层（Kotlin）
    ├── AccessibilityModule
    ├── ADBModule
    ├── AutoGLMAccessibilityService
    ├── TaskExecutionService
    └── TaskExecutionHeadlessService
```

### Expo 架构选项

#### 选项 1：Expo Go（不适用）
- ❌ 不支持自定义原生代码
- ❌ 无法实现无障碍服务和 ADB 功能
- **结论**：不适合本项目

#### 选项 2：Expo Development Build（推荐）
```
Expo Development Build
├── JavaScript/TypeScript 层（可直接迁移）
│   ├── UI 组件
│   ├── 业务逻辑
│   └── 服务层
├── Expo Modules（需要开发）
│   ├── AccessibilityModule（自定义）
│   ├── ADBModule（自定义）
│   └── TaskExecutionModule（自定义）
└── Config Plugins（需要配置）
    ├── 无障碍服务配置
    ├── 权限配置
    └── 服务注册配置
```

#### 选项 3：EAS Build + Bare Workflow
- 类似当前 React Native CLI 项目
- 完全控制原生代码
- 可以使用 Expo SDK 的便利功能
- **结论**：迁移成本最低，但失去部分 Expo 优势

## 迁移方案建议

### 推荐方案：Expo Development Build + 自定义原生模块

#### 优势
1. **保留 Expo 生态优势**：
   - 统一的构建和发布流程（EAS Build）
   - 便捷的 OTA 更新（Expo Updates）
   - 丰富的 Expo SDK 模块
   - 更好的开发体验

2. **支持自定义原生代码**：
   - 可以保留所有现有原生功能
   - 通过 Expo Modules API 封装原生模块
   - 更好的类型安全（TypeScript 支持）

3. **渐进式迁移**：
   - 可以先迁移 UI 和业务逻辑
   - 逐步封装原生模块
   - 降低迁移风险

#### 实施步骤

**阶段 1：项目初始化**
1. 使用 `npx create-expo-app` 创建 Expo 项目
2. 配置 `app.json` 和基础设置
3. 迁移所有 JavaScript/TypeScript 代码

**阶段 2：原生模块封装**
1. 创建 Expo Config Plugin：
   - 配置无障碍服务权限
   - 注册原生服务
   - 配置 AndroidManifest.xml
2. 开发 Expo Modules：
   - `expo-accessibility`（封装 AccessibilityModule）
   - `expo-adb`（封装 ADBModule）
   - `expo-task-execution`（封装后台任务服务）

**阶段 3：功能适配**
1. 替换权限管理为 Expo 方式
2. 适配后台任务为 Expo TaskManager
3. 调整资源管理方式

**阶段 4：测试和优化**
1. 功能测试
2. 性能优化
3. 构建和发布流程验证

### 备选方案：EAS Build + Bare Workflow

如果 Expo Modules 开发成本过高，可以考虑：
1. 使用 `npx expo prebuild` 生成原生项目
2. 直接迁移现有 Kotlin 代码
3. 使用 Expo SDK 替换部分功能
4. 通过 EAS Build 进行构建

## 迁移成本评估

### 工作量估算

| 功能模块 | 迁移难度 | 预计工作量 | 说明 |
|---------|---------|-----------|------|
| UI 界面 | 低 | 1-2 天 | 直接迁移，少量配置调整 |
| 业务逻辑 | 低 | 1-2 天 | TypeScript 代码可直接迁移 |
| 数据存储 | 低 | 0.5 天 | 替换包名即可 |
| 权限管理 | 中 | 1-2 天 | 需要适配 Expo 权限 API |
| 无障碍服务模块 | 高 | 5-7 天 | 需要开发 Expo Module |
| ADB 服务模块 | 高 | 3-5 天 | 需要开发 Expo Module |
| 后台任务 | 高 | 3-5 天 | 需要重新设计实现 |
| 悬浮窗 | 中 | 2-3 天 | 需要开发 Expo Module 或使用替代方案 |
| 构建配置 | 中 | 2-3 天 | 配置 Expo Config Plugins |
| 测试和调试 | 中 | 3-5 天 | 功能验证和问题修复 |

**总计**：约 20-35 个工作日（4-7 周）

### 风险评估

#### 高风险项
1. **后台任务执行**：
   - Expo 对后台任务限制较多
   - 可能需要重新设计任务执行机制
   - 建议：优先验证后台任务在 Expo 中的可行性

2. **无障碍服务稳定性**：
   - 需要确保 Expo Module 封装不影响功能
   - 不同 Android 版本的兼容性
   - 建议：充分测试各种 Android 版本

#### 中风险项
1. **原生模块性能**：
   - Expo Module 封装可能带来性能开销
   - 建议：进行性能基准测试

2. **构建和发布流程**：
   - EAS Build 的构建时间可能较长
   - 需要熟悉 EAS 服务
   - 建议：提前熟悉 EAS 工作流

## Expo 优势分析

### 开发体验提升
1. **统一的工作流**：
   - 无需配置 Android Studio / Xcode
   - 统一的 CLI 工具
   - 简化的依赖管理

2. **OTA 更新**：
   - 支持 JavaScript 代码热更新
   - 无需重新发布应用商店
   - 快速修复和迭代

3. **构建服务**：
   - EAS Build 云端构建
   - 无需本地配置构建环境
   - 支持多平台构建

### 生态优势
1. **丰富的 SDK**：
   - 相机、文件系统、通知等模块
   - 官方维护，质量有保障
   - 统一的 API 设计

2. **社区支持**：
   - 活跃的社区
   - 丰富的文档和示例
   - 官方技术支持

## 迁移建议

### 建议迁移的情况
1. ✅ 需要 OTA 更新能力
2. ✅ 希望简化构建和发布流程
3. ✅ 团队对原生开发不熟悉
4. ✅ 需要利用 Expo SDK 的丰富功能
5. ✅ 长期维护和迭代的项目

### 不建议迁移的情况
1. ❌ 项目对原生代码有频繁修改需求
2. ❌ 需要深度定制原生功能
3. ❌ 团队对 React Native CLI 已经很熟悉
4. ❌ 迁移时间窗口紧张
5. ❌ 项目即将完成，迁移收益不大

## 结论

本项目迁移到 Expo 在技术上是**可行的**，但需要：

1. **使用 Expo Development Build**：因为项目依赖大量自定义原生代码
2. **开发自定义 Expo Modules**：封装无障碍服务、ADB 服务等原生功能
3. **重新设计后台任务**：适配 Expo 的后台任务机制
4. **投入开发时间**：预计 4-7 周的工作量

**建议**：
- 如果项目处于早期阶段，迁移到 Expo 可以获得长期收益
- 如果项目已经稳定运行，需要评估迁移成本和收益
- 可以先进行小规模 POC（概念验证），验证关键功能的可行性
- 考虑分阶段迁移，先迁移非核心功能，逐步完善

## 参考资料

- [Expo Development Build 文档](https://docs.expo.dev/development/introduction/)
- [Expo Modules API](https://docs.expo.dev/modules/overview/)
- [Expo Config Plugins](https://docs.expo.dev/config-plugins/introduction/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [Expo TaskManager](https://docs.expo.dev/versions/latest/sdk/task-manager/)

