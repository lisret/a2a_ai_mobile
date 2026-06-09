# a2a_ai_mobile / AI 驱动移动端自动化执行框架

基于 Open-AutoGLM 的 AI 驱动移动端自动化框架。用自然语言描述用例，AI 智能体自动分析屏幕并执行触控操作，无需编写脚本。

支持 Android 7.0+。

AI-driven mobile automation framework based on Open-AutoGLM. Describe test cases in natural language, and the AI agent automatically analyzes the screen and executes touch operations — no scripting required. Supports Android 7.0+.

## 架构 / Architecture

```
自然语言 → 截图 → 视觉模型 → 结构化操作指令 → 无障碍服务/ADB 执行
Natural Language → Screenshot → Vision Model → Structured Action → Accessibility/ADB Execute
```

## 特性 / Features

- **多模型支持** — 7 家大模型厂商（智谱、ModelScope、OpenAI、Claude、DeepSeek、Moonshot、自定义），支持同时配置多个模型并指定驱动模型，随时切换对比效果
- **双通道执行** — 无障碍服务 + ADB 降级兜底，覆盖点击、滑动、输入、长按、双击等全手势操作
- **单任务最大 100 步** — 支持长流程复杂用例，步数上限随模型上下文窗口可继续上调
- **三轨执行** — 悬浮窗实时进度展示 + 前台服务 + 后台无界面执行，熄屏/切后台不中断
- **语音指令** — 默认集成开源离线语音识别，支持切换配置为云端语音接口，语音口述用例直接触发执行
- **OpenClaw 集成** — WebSocket 协议接入 OpenClaw 网关，设备注册为远程 Agent 节点，支持集群调度
- **应用映射** — 内置 200+ 国产应用包名映射

---

- **Multi-Model Support** — 7 LLM providers with hot-swappable driver model selection
- **Dual-Channel Execution** — AccessibilityService + ADB fallback, all gesture types
- **100 Steps Per Task** — Scales with model context window
- **Triple Execution Mode** — Floating window + Foreground Service + Headless background
- **Voice Commands** — Offline ASR by default, configurable to cloud APIs
- **OpenClaw Integration** — WebSocket gateway, device as remote Agent node for cluster scheduling
- **App Mapping** — 200+ Chinese app package name mappings built-in

## 技术栈 / Tech Stack

| 层级 | 技术 |
|------|------|
| 界面 | React Native 0.73 + TypeScript |
| 执行引擎 | Kotlin（Android AccessibilityService + ADB） |
| AI 管线 | OpenAI 兼容 Vision API、SSE 流式解析、结构化指令提取 |
| 语音 | 开源离线语音识别（默认），可配置云端语音接口 |
| 集群 | WebSocket（OpenClaw 协议） |

## 快速开始 / Quick Start

### 环境要求

- Node.js >= 18
- JDK 17
- Android SDK（API 21–34）
- Android 设备或模拟器（7.0+）

### 安装

```bash
cd AwesomeProject
npm install
```

### 配置 Android SDK

编辑 `AwesomeProject/android/local.properties`：

```
sdk.dir=/path/to/Android/sdk
```

### 运行

```bash
# 终端 1：启动 Metro 打包器
cd AwesomeProject
npm start

# 终端 2：编译并运行
npm run android
```

## 项目结构 / Project Structure

```
.
├── AwesomeProject/          # React Native 项目
│   ├── src/                 # TypeScript 源码
│   │   ├── core/            # 引擎、对话、能力层
│   │   ├── features/        # 功能模块（任务、模型、设置）
│   │   ├── navigation/      # 导航
│   │   └── shared/          # 类型、常量、工具
│   └── android/             # Kotlin 原生层
│       └── app/src/main/java/com/awesomeproject/
│           ├── bridge/      # Native Modules（无障碍、ADB、悬浮窗）
│           ├── service/     # 服务（无障碍、任务执行）
│           └── accessibility/  # 手势 & 截图处理
├── doc/                     # 开发文档
├── src/                     # 部署文档
└── design_demo.html         # UI 设计稿
```

## 支持的模型厂商 / Supported Model Providers

| 厂商 | 模型示例 |
|------|---------|
| 智谱 AI / Zhipu AI | AutoGLM-Phone-9B, GLM-4V |
| ModelScope | AutoGLM-Phone-9B |
| OpenAI | gpt-4o, gpt-4-vision-preview |
| Anthropic | claude-3-opus, claude-3-sonnet |
| DeepSeek | deepseek-vl2 |
| Moonshot | moonshot-v1-8k-vision |
| 自定义 / Custom | 任意 OpenAI 兼容接口 |

## 相关链接 / Related

- [Open-AutoGLM](https://github.com/zai-org/Open-AutoGLM) — 上游框架
- [a2a_ai_mobile_skill_market](https://github.com/lisret/a2a_ai_moblie_skill_market) — 移动测试场景 AI 技能共享平台

## 开源协议 / License

MIT
