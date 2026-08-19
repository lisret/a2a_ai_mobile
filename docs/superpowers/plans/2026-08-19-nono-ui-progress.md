# NoNo UI 进度表

更新时间：2026-08-19  
当前分支：`codex/nono-ui-orchestration`  
PR：https://github.com/lisret/a2a_ai_mobile/pull/1

融合策略：保留现有原型视觉（珍珠底、模型/活动文案），接入 `shared/ui/nono` 设计系统和自定义双图层 Tab。

## 总览

| 轨道 | 进度 | 说明 |
| --- | ---: | --- |
| 原型视觉对齐 | 100% | 主路径页面已按原型改完 |
| 设计系统 + View/业务拆分 | 85% | 四主页已拆；Agent 配置页缺运行时契约 |
| 自定义 Tab 导航 | 80% | 已接入 App；缺完整 navigator 集成测试 |
| Agent 配置车道 | 0% | `AgentConfigController` 不存在，未开工 |
| 真机 / Android 验收 | 0% | 未编 debug 包、未连真机 |
| 原生悬浮球 / 通知 | 不做 | 明确第二阶段 |

## 方案任务

| 任务 | 状态 | 已完成 | 未完成 |
| --- | --- | --- | --- |
| 1. Tokens 与基础组件 | 完成 | `shared/ui/nono`：tokens、NoNoMark、NoNoPage、Surface、SectionHeading、StatusBadge、PrimaryButton、useReducedMotion；基础测试已过 | — |
| 2. Tab 转场状态机 | 完成 | `NoNoTabTransition`：+28% / -12%、280ms、generation-safe；单测已过 | — |
| 3. 双图层 TabNavigator | 基本完成 | `createNoNoTabNavigator` 已替换 `BottomTabNavigator`；已访问 scene 保持挂载；减少动画时直接切页 | 缺少方案里的 `NoNoTabNavigator` 集成测试（连点、disabled 重定向、TalkBack） |
| 4. 首页 / 活动纯 View | 完成 | `NoNoHomeView`、`NoNoActivityView`；Screen 只留 hook/service | — |
| 5. 设置 / Agent 纯 View | 部分完成 | `NoNoSettingsView`（含权限中心）已接入 | `AgentConfigView` 未建；密钥遮罩 / 三种模式 UI 未做 |
| 6. 底栏动效 + 布局解耦 | 基本完成 | `CustomTabBar` 走 `onRoutePress`；`PageLayout` 已去掉 `PageTransitionWrapper` | 缺少独立 `CustomTabBar` 测试 |
| 7. Screen / Navigator 集成 | 部分完成 | 首页、模型、活动、设置已变成 View adapter；无模型时 Home/History 禁用并回退 Models | Tab 文案仍是「模型」不是「Agent」；无 `AgentConfigScreen`；仍轮询 `modelService`；无集成测试 |
| 8. 全量验收 | 未完成 | 融合相关 7 个套件 / 14 项单测已过 | 未跑全量 Jest、tsc、lint、`assembleDebug`、真机 |

## 页面视觉

| 页面 | 状态 | 备注 |
| --- | --- | --- |
| 首页 / 执行态 | 完成 | 问候语、输入卡、快捷任务、终止确认层 |
| 模型列表 | 完成 | Active Brain hero、「＋ 新增」 |
| 新增 / 编辑模型 | 完成 | 完整子页，不再用透明底弹层 |
| 活动 | 完成 | 筛选 chip + 卡片；Tab 文案「活动」 |
| 任务详情 | 完成 | 深色 hero、「再次执行」 |
| 设置 | 完成 | 权限中心、深色搜索框弹层 |
| API Key 指南 | 完成 | SAFE SETUP hero |
| 调试日志 | 完成 | LOCAL DIAGNOSTICS hero |
| 旧 TaskHistory 聊天页 | 未改 | 导航注册了，当前主路径走不到 |
| Agent 配置 | 未做 | 缺 `AgentConfigController` |

## 下一步（按阻塞排序）

1. **可马上做**：补 `NoNoTabNavigator` / `CustomTabBar` 集成测试；跑 `tsc` + 全量 Jest。
2. **等契约**：`src/core/engine/agentRuntime/config/AgentConfigController.ts` 就位后，再做 Agent 配置 View / Screen，并把无模型门控改成 `isRunnable`。
3. **要真机**：Android debug 安装、连点 Tab、减少动画、键盘不挡底栏。
4. **第二阶段**：悬浮球 / 前台通知，另开计划，不并进这一轨。
