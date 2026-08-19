# 融合计划：NoNo UI × Elel 首页伴侣

更新时间：2026-08-19  
来源：

| 轨道 | 分支 | PR | 角色 |
| --- | --- | --- | --- |
| NoNo 全页视觉 / 设计系统 / Tab | `codex/nono-ui-orchestration` | [#1](https://github.com/lisret/a2a_ai_mobile/pull/1) | 珍珠底、深紫底栏、四主页纯 View、NoNo 机器人标 |
| Elel 首页虚拟角色 | `cursor/avatar-home-research-fb50` | [#2](https://github.com/lisret/a2a_ai_mobile/pull/2) | 首页换成 CC0 形象 Elel Silverbell |

本文件取代两份计划各自「下一步怎么干」的叙述。原文档仍保留作细节：

- NoNo 迁移：`docs/superpowers/plans/2026-08-17-nono-react-native-ui-migration.md`（在 PR #1）
- NoNo 进度：`docs/superpowers/plans/2026-08-19-nono-ui-progress.md`（在 PR #1）
- Elel 调研：`doc/虚拟角色首页调研.md`（在 PR #2）

---

## 产品结论（一条线，不要两套首页）

**壳是 NoNo，脸是 Elel。**

- 全 App 视觉、底栏、模型/活动/设置：走 PR #1 的 NoNo 设计系统（珍珠底 `#F8F7F3`、墨色 `#1B1D30`、紫 `#756BF0`、薄荷、珊瑚）。
- 首页「伴侣」不再是顶栏 54px 的 CSS 机器人 `NoNoMascot`，也不再是蓝灰工具风大输入卡。首页舞台用 **Elel Silverbell**（Xmas Chibis，CC0）。
- `NoNoMascot` / `NoNoMark` / `AppMark` 留作品牌标：底栏选中态、非首页顶栏、执行中小标。不要和 Elel 在首页抢同一块主视觉。
- 低端机（Android 7 WebGL 失败）回退半身静图 + 气泡；**默认首页是 Elel 3D VRM**，模型已打进 APK（约 3.2MB）。

两套首页不能并存：

| 现在 | 问题 |
| --- | --- |
| PR #1 `NoNoHomeView` | 问候文案 + `TaskInputCard`，角色只在 header 角落 |
| PR #2 `HomeScreen` + `AvatarStage` | Elel 占主舞台，但还套在旧蓝灰 `COLORS` / 旧 `PageLayout` 上 |

融合后只保留：**`HomeScreen`（业务）→ `NoNoHomeView`（展示）→ 内部用 Elel `AvatarStage` + NoNo tokens**。

---

## 合并顺序（避免互相覆盖）

1. **以 PR #1 为视觉基线**（tokens、Tab、四主页、PageLayout、执行卡/设置已改完）。
2. **把 PR #2 的 Elel 资源与组件 rebase 上去**（`src/assets/avatars/`、`AvatarStage`、`AvatarInputDock`）。
3. **改 `NoNoHomeView`**：问候区换成 Elel 舞台；输入改底部 Dock；执行时 Elel 缩小，现有 `ExecutionCard` 留下。
4. **改 `NoNoHomeView` 测试**，不要再断言大标题「今天想让手机替你完成什么？」为首页主视觉。
5. 不要把 PR #2 的旧蓝灰 Home 直接合进 master，否则会打掉 NoNo 壳。

情绪对齐（一套状态机，两套皮肤）：

| 任务状态 | Elel `AvatarMood` | NoNo `NoNoMood` | 首页表现 |
| --- | --- | --- | --- |
| 待机 | `idle` | `idle` | Elel 3D 慢转 + 气泡；底栏 NoNo 标 idle |
| 思考 / 执行 | `work` | `thinking` | Elel 缩小；执行卡；顶栏可改 AppMark |
| 成功 | `done` | `success` | 气泡「搞定了」 |
| 失败 / 要权限 | `error` | `error` / `confirm` | 气泡指设置；确认终止仍用 NoNo 弹层 |

---

## 融合后进度

### 总览

| 轨道 | 进度 | 说明 |
| --- | ---: | --- |
| NoNo 原型视觉（非首页主舞台） | 100% | 模型、活动、设置、二级页已按珍珠底改完（PR #1） |
| NoNo 设计系统 + View 拆分 | 85% | 四主页已拆；Agent 配置页缺运行时契约 |
| 自定义 Tab | 80% | 已接入 App；缺 navigator 集成测试 |
| Elel 选型 / 授权 / 调研 | 100% | 正选 Elel，备选 Holy；模之屋不打进包 |
| Elel 首页第一期（旧壳上） | 90% | PR #2 已在旧 Home 接 **3D Elel** + Dock；尚未接到 NoNo 壳 |
| Elel 3D VRM（WebView） | 90% | Android 打进 `android/app/src/main/assets/vrm/`；VRM 0.x 转正面对镜头；失败回退半身图。真机 WebGL 仍建议复测 |
| 融合首页（NoNo 壳 + Elel 脸） | 0% | 本计划的下一项 |
| 语音听写 / 悬浮窗头像 | 0% | 后置 |
| Agent 配置车道 | 0% | 等 `AgentConfigController` |
| 真机 / Android 验收 | 0% | 两轨都没编 debug 包 |

### NoNo 方案任务（沿用 PR #1，首页验收标准改掉）

| 任务 | 状态 | 融合后怎么改 |
| --- | --- | --- |
| 1. Tokens 与基础组件 | 完成 | 保持。首页 Elel 必须吃 `NONO_COLORS` / `Surface`，不要再用全局蓝 `#2563EB` 当主色 |
| 2. Tab 转场状态机 | 完成 | 保持 |
| 3. 双图层 TabNavigator | 基本完成 | 保持；补集成测试 |
| 4. 首页 / 活动纯 View | 完成（旧首页结构） | **重做首页 View**：Elel 舞台 + Dock；活动页不动 |
| 5. 设置 / Agent 纯 View | 部分完成 | 保持；Agent 配置仍等契约 |
| 6. 底栏动效 + 布局解耦 | 基本完成 | 保持；底栏继续用 NoNo 标，不是 Elel |
| 7. Screen / Navigator 集成 | 部分完成 | `HomeScreen` 继续只做 adapter；render 改为新 `NoNoHomeView` |
| 8. 全量验收 | 未完成 | 融合后再跑 Jest / tsc；真机看键盘是否挡住 Dock 和深紫底栏 |

### Elel 方案任务

| 任务 | 状态 | 融合后怎么改 |
| --- | --- | --- |
| 调研交互 + 免费资源 | 完成 | 结论不变 |
| 锁定 Elel Silverbell | 完成 | 用户已确认 |
| 半身图打进 `src/assets/avatars` | 完成（PR #2） | rebase 到 NoNo 分支时带过去 |
| 旧壳 `AvatarStage` / `AvatarInputDock` | 完成（PR #2） | 样式改接到 NoNo tokens；气泡圆角/阴影跟 `Surface` |
| 点角色 = 聚焦输入 | 完成 | 语音仍未接，文案保持诚实 |
| 执行时缩小让路 | 完成（旧壳） | 迁到 `NoNoHomeView` 后复测，避免和 `paddingBottom: 120` 底栏抢空间 |
| HTML 原型 `design_demo_avatar.html` | 完成 | 视觉参考；正式 UI 以 NoNo 珍珠底为准 |
| 接到 NoNoHomeView | **未做** | 融合第一优先 |
| 导入本地 VRM / 用户换装 | 未做 | 当前只内置 Elel |
| 语音听写 / 悬浮窗头像 | 未做 | 后置 |
| 悬浮窗头像 | 未做 | 与 NoNo「第二阶段悬浮球」合并规划，不塞进这一轨 |

---

## 下一步（按阻塞排序）

1. **融合首页（马上做）**  
   以 PR #1 为底 rebase PR #2 的 Elel 文件 → 改 `NoNoHomeView`：Elel 占 50–60% 屏，问候改气泡，输入 Dock 贴底栏上方，快捷任务/chip 保留但降为配角。更新 `NoNoHomeView.test.tsx`。
2. **可马上做（NoNo 债）**  
   `NoNoTabNavigator` / `CustomTabBar` 集成测试；`tsc` + 全量 Jest。
3. **等契约**  
   `AgentConfigController` 就位后再做 Agent 配置 View，Tab 用户文案「模型」→「Agent」。
4. **要真机**  
   debug 包；连点 Tab；减少动画；键盘 + Elel Dock + 深紫底栏三件套是否互挡。
5. **后置（不要和融合搅在一起）**  
   语音听写、悬浮球/通知里的 Elel 头像。3D 已是首页默认（WebView + 本地 VRM），真机再确认一次拖转/回退。

---

## 首页融合验收（替代 NoNo 原「问候语首页完成」）

- 打开 App 先看到 Elel，不是大标题工具风，也不是只有角上一个紫机器人。
- 珍珠底 + 深紫底栏仍在；模型/活动/设置仍是 NoNo 页，不回蓝灰。
- 点 Elel → 聚焦底部输入；发送逻辑仍走现有 `HomeScreen` hooks。
- 执行中 Elel 缩小，`ExecutionCard` 可用，终止确认文案可继续用 NoNo 语气。
- 长按 Elel 能看到 CC0 出处。
- 不新增 3D 引擎 npm 包；WebView + 本地 UMD three/three-vrm。新增 `react-native-webview`。
- `.vrm` 已打进 Android assets（约 3.2MB），不是 4200 个模型。
- 打开首页应看到可转动的 3D Elel（自动慢转 + 手指拖转），不是一张不会动的半身静图。
