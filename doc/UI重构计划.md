# UI 重构计划

基于 `design_demo.html` 示例文件重构 React Native 页面，保持所有原有功能。

## 📋 重构概览

### 目标
将现有的 React Native 页面按照 `design_demo.html` 的设计风格和交互方式重构，同时保留所有业务逻辑和功能。

### 核心变化
1. **移除 Chat 对话模式** → **改为 Home 启动器模式**
2. **统一 Tab 导航结构**（首页、模型、历史、设置）
3. **优化视觉设计和交互体验**
4. **保持所有现有功能完整性**

---

## 🎯 阶段一：导航结构重构

### 1.1 更新 AppNavigator.tsx

**当前状态：**
- 使用 Stack Navigator + Tab Navigator 混合结构
- Tab 包含：模型、设置
- Stack 包含：AddModel, EditModel, TaskHistory, APIKeyGuide, DebugLog

**目标状态：**
- Tab Navigator 包含：首页、模型、历史、设置
- Stack Navigator 保留：AddModel, EditModel, APIKeyGuide, DebugLog
- 移除 TaskHistory 作为独立 Stack Screen（改为 Tab）

**修改内容：**
```typescript
// 新增 Tab: Home, History
// 移除 Stack: TaskHistory
// 调整导航参数传递方式
```

**影响文件：**
- `src/navigation/AppNavigator.tsx`
- `src/shared/types/navigation.ts`

---

## 🎯 阶段二：首页 (Home) 页面创建

### 2.1 创建 HomeScreen.tsx

**功能需求：**
- ✅ 大号任务输入框（替代 Chat 输入）
- ✅ 快捷指令建议 Chips
- ✅ 执行状态卡片（显示步骤时间轴）
- ✅ 开始/停止任务按钮
- ✅ 模型选择检查（无模型时禁用）

**组件结构：**
```
HomeScreen/
├── components/
│   ├── TaskInputCard.tsx      # 任务输入卡片
│   ├── ExecutionCard.tsx      # 执行状态卡片
│   ├── StepTimeline.tsx        # 步骤时间轴组件
│   └── SuggestionChips.tsx     # 快捷指令建议
└── hooks/
    └── useHomeTaskExecution.ts # 复用现有执行逻辑
```

**复用现有逻辑：**
- `useTaskExecution` Hook
- `useTaskExecutionWithBackground` Hook
- `TaskExecutionHeadless` Service

**新增文件：**
- `src/features/task/screens/HomeScreen.tsx`
- `src/features/task/components/TaskInputCard.tsx`
- `src/features/task/components/ExecutionCard.tsx`
- `src/features/task/components/StepTimeline.tsx`
- `src/features/task/components/SuggestionChips.tsx`

**修改文件：**
- `src/navigation/AppNavigator.tsx`（添加 Home Tab）

---

## 🎯 阶段三：历史页面重构

### 3.1 重构 TaskHistoryScreen.tsx

**当前功能：**
- ✅ 任务列表展示
- ✅ 侧边栏历史面板
- ✅ 任务详情查看（Chat 模式）
- ✅ 删除任务
- ✅ 新建任务

**目标状态：**
- ✅ 保留所有功能
- ✅ 移除 Chat 对话模式
- ✅ 改为纯列表展示
- ✅ 点击历史项跳转到 Home 页面并填充输入框

**修改策略：**
1. 移除 `ChatMessage` 组件使用
2. 移除 `TaskStepItem` 展开查看（改为跳转）
3. 保留 `HistoryPanel` 侧边栏
4. 简化页面为纯列表展示
5. 点击历史项 → `navigation.navigate('Home', { taskId: id })`

**修改文件：**
- `src/features/task/screens/TaskHistoryScreen.tsx`
- `src/features/task/components/HistoryPanel.tsx`（保持现有）

**保留组件：**
- `HistoryPanel.tsx`（侧边栏）
- `TaskStatusBadge.tsx`

---

## 🎯 阶段四：模型页面优化

### 4.1 优化 ModelListScreen.tsx

**当前功能：**
- ✅ 模型列表展示
- ✅ 添加/编辑/删除模型
- ✅ 模型激活切换
- ✅ 点击模型跳转 TaskHistory

**目标状态：**
- ✅ 保持所有功能
- ✅ 优化 UI 样式（参考示例）
- ✅ 点击模型跳转 Home（而非 TaskHistory）
- ✅ 添加模型激活状态视觉反馈

**修改内容：**
1. 更新 `ModelItem` 组件样式
2. 修改 `handleModelPress` → 跳转 Home
3. 优化激活状态的视觉反馈

**修改文件：**
- `src/features/model/screens/ModelListScreen.tsx`
- `src/features/model/components/ModelItem.tsx`

---

## 🎯 阶段五：设置页面优化

### 5.1 优化 SettingsScreen.tsx

**当前功能：**
- ✅ 无障碍服务设置
- ✅ 搜索框位置设置
- ✅ ADB 兜底开关
- ✅ 自动保存历史开关
- ✅ 调试日志入口
- ✅ 关于信息

**目标状态：**
- ✅ 保持所有功能
- ✅ 优化分组和布局
- ✅ 统一开关组件样式

**修改文件：**
- `src/features/settings/screens/SettingsScreen.tsx`（样式优化）

---

## 🎯 阶段六：Tab 栏状态管理

### 6.1 实现 Tab 禁用逻辑

**需求：**
- 无激活模型时，首页和历史 Tab 置灰禁用
- 有激活模型后，自动启用

**实现方式：**
1. 在 `AppNavigator.tsx` 中监听模型状态
2. 使用 `tabBarButton` 自定义 Tab 按钮
3. 根据模型状态动态设置 `tabBarItemStyle` 和 `tabBarIconStyle`

**修改文件：**
- `src/navigation/AppNavigator.tsx`
- 可能需要创建 `useModelStatus` Hook

---

## 🎯 阶段七：样式系统统一

### 7.1 更新样式常量

**目标：**
- 统一颜色、间距、字体大小
- 参考 `design_demo.html` 的设计规范

**修改文件：**
- `src/shared/constants/styles.ts`（如果存在）
- 或创建新的样式常量文件

**样式变量：**
```typescript
export const UI_COLORS = {
  primary: '#2563EB',
  primaryLight: '#EFF6FF',
  success: '#10B981',
  error: '#EF4444',
  // ...
};

export const UI_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const UI_BORDER_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
};
```

---

## 📦 组件复用策略

### 保留的现有组件
- ✅ `PageLayout` - 页面布局容器
- ✅ `FAB` - 悬浮按钮
- ✅ `ConfirmModal` - 确认弹窗
- ✅ `EmptyState` - 空状态
- ✅ `HistoryPanel` - 历史侧边栏
- ✅ `TaskStatusBadge` - 状态徽章

### 需要创建的组件
- 🆕 `TaskInputCard` - 任务输入卡片
- 🆕 `ExecutionCard` - 执行状态卡片
- 🆕 `StepTimeline` - 步骤时间轴
- 🆕 `SuggestionChips` - 快捷指令建议

### 需要修改的组件
- 🔄 `ModelItem` - 优化样式和交互
- 🔄 `ChatMessage` - 可能不再需要（或改为其他用途）

---

## 🔄 数据流和状态管理

### 任务执行流程

**当前流程：**
```
TaskHistoryScreen 
  → useTaskExecution 
    → TaskExecutionEngine 
      → 执行任务
```

**新流程：**
```
HomeScreen 
  → useTaskExecution (复用)
    → TaskExecutionEngine 
      → 执行任务
      → 更新 ExecutionCard
      → 完成后保存到历史
```

### 页面间数据传递

**Home → History：**
- 通过 Navigation params 传递 `taskId`
- History 页面加载任务详情

**History → Home：**
- 通过 Navigation params 传递 `taskId` 或 `instruction`
- Home 页面填充输入框

**Model → Home：**
- 通过 Navigation params 传递 `modelId`
- Home 页面使用该模型执行任务

---

## 🧪 测试计划

### 功能测试
- [ ] 首页输入任务并执行
- [ ] 执行状态卡片显示步骤
- [ ] 停止任务功能
- [ ] 历史列表展示
- [ ] 点击历史项跳转并填充
- [ ] 模型列表和切换
- [ ] 模型删除（检查 Tab 状态）
- [ ] 设置页面所有功能
- [ ] Tab 禁用/启用逻辑

### 边界测试
- [ ] 无模型时 Tab 禁用
- [ ] 删除最后一个激活模型
- [ ] 执行中切换页面
- [ ] 后台任务执行状态同步

---

## 📝 实施步骤

### Phase 1: 基础结构（1-2天）
1. 更新导航结构（AppNavigator）
2. 创建 HomeScreen 基础框架
3. 创建必要的组件占位

### Phase 2: 首页功能（2-3天）
1. 实现 TaskInputCard
2. 实现 ExecutionCard
3. 集成任务执行逻辑
4. 实现 StepTimeline

### Phase 3: 历史页面（1-2天）
1. 简化 TaskHistoryScreen
2. 实现跳转逻辑
3. 测试数据传递

### Phase 4: 模型和设置（1天）
1. 优化 ModelListScreen
2. 优化 SettingsScreen
3. 统一样式

### Phase 5: Tab 状态管理（1天）
1. 实现 Tab 禁用逻辑
2. 测试各种场景

### Phase 6: 测试和优化（1-2天）
1. 功能测试
2. UI 细节优化
3. 性能优化

---

## ⚠️ 注意事项

### 兼容性
- 保持所有现有 API 接口不变
- 保持所有 Service 层逻辑不变
- 保持所有 Hook 接口不变

### 数据迁移
- 无需数据迁移（使用相同存储）

### 向后兼容
- 考虑是否需要保留旧的 TaskHistory 路由（作为备用）

### 性能
- 注意 ExecutionCard 的渲染性能
- 步骤时间轴使用 FlatList 或优化渲染

---

## 📚 参考文件

### 设计参考
- `design_demo.html` - UI 设计规范

### 代码参考
- `src/features/task/screens/TaskHistoryScreen.tsx` - 现有任务执行逻辑
- `src/features/task/hooks/useTaskExecution.ts` - 任务执行 Hook
- `src/features/model/screens/ModelListScreen.tsx` - 模型列表逻辑

---

## ✅ 验收标准

1. ✅ 所有原有功能正常工作
2. ✅ UI 风格与示例文件一致
3. ✅ 交互体验流畅
4. ✅ 无性能问题
5. ✅ 代码结构清晰
6. ✅ 通过所有测试用例

---

**预计总工时：** 7-10 天

**优先级：** 
- P0: 阶段一、二（导航和首页）
- P1: 阶段三、四（历史和模型）
- P2: 阶段五、六（设置和 Tab 状态）
- P3: 阶段七（样式统一）

