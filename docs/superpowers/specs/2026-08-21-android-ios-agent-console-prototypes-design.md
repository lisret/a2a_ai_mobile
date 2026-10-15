# Android / iOS Agent 控制台原型拆分设计

日期：2026-08-21

## 目标

将根目录完整交互原型明确标记为 Android 端，并基于它生成独立的 iOS 端原型。两端都把 `OpenClaw 远程` 提升为供应商无关的 `Agent 控制台`，首批展示 OpenClaw 与 DSH。

## Android 原型

- 保留 `nono-app-prototype.html` 作为 Android 原型入口。
- 保留跨 App 看屏、点击、悬浮窗、无障碍和 ADB 等 Android 产品语义。
- 将 OpenClaw 专属入口改为 Agent 控制台，允许选择 OpenClaw 或 DSH。

## iOS 原型

- 新建独立的 `nono-app-prototype-ios.html`。
- 保留首页陪伴、角色外观、模型配置、记忆、交代、活动、隐私和 Agent 控制台。
- 将“替我操作手机”改为“帮我办事”，能力限定为快捷指令、系统授权动作、分享内容和远程 Agent。
- 将跨 App 悬浮球改为 Live Activity / 灵动岛任务状态。
- 删除无障碍服务、ADB 兜底、静默跨 App 截图和任意点击的产品承诺。
- 定时交代以通知、提醒或受支持的系统动作触发，不承诺任意后台跨 App 操作。

## Agent 控制台

- 能力名称与具体 Agent 实现解耦。
- 控制台提供 OpenClaw 与 DSH 选择。
- 陪伴模型继续独立，不因 Agent 选择而改变。
- Android 端可将本机作为执行设备；iOS 端主要提交远程任务或调用公开系统动作。

## 验收

- 两份原型均可独立打开并包含 Agent 控制台、OpenClaw、DSH。
- Android 原型标题和说明明确标识 Android。
- iOS 原型标题和说明明确标识 iOS。
- iOS 原型不再出现 ADB 兜底、无障碍服务或跨 App 悬浮窗权限文案。
- iOS 原型保留完整的首页、能力、活动、设置和任务状态交互。
