# a2a_ai_mobile

AI-driven mobile automation framework based on Open-AutoGLM. Describe test cases in natural language, and the AI agent automatically analyzes the screen and executes touch operations — no scripting required.

Supports Android 7.0+.

## Architecture

```
Natural Language → Screenshot → Vision Model → Structured Action → Accessibility/ADB Execute
```

## Features

- **Multi-Model Support** — 7 LLM providers (Zhipu, ModelScope, OpenAI, Claude, DeepSeek, Moonshot, custom) with hot-swappable driver model selection
- **Dual-Channel Execution** — AccessibilityService + ADB fallback, covering tap, swipe, input, long-press, double-tap gestures
- **100 Steps Per Task** — Supports long-form complex test flows; step limit scales with model context window
- **Triple Execution Mode** — Floating window progress overlay + Foreground Service + Headless background, survives screen-off and app switching
- **Voice Commands** — Offline ASR by default, configurable to cloud ASR APIs; trigger tasks by speaking
- **OpenClaw Integration** — WebSocket connection to OpenClaw gateway, registering device as a remote Agent node for cluster scheduling
- **App Mapping** — 200+ Chinese app package name mappings built-in

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React Native 0.73 + TypeScript |
| Execution Engine | Kotlin (Android AccessibilityService + ADB) |
| AI Pipeline | OpenAI-compatible Vision API, SSE streaming, structured action extraction |
| Voice | Offline ASR (default), configurable cloud ASR |
| Cluster | WebSocket (OpenClaw protocol) |

## Quick Start

### Prerequisites

- Node.js >= 18
- JDK 17
- Android SDK (API 21–34)
- Android device or emulator (7.0+)

### Install

```bash
cd AwesomeProject
npm install
```

### Configure Android SDK

Edit `AwesomeProject/android/local.properties`:

```
sdk.dir=/path/to/Android/sdk
```

### Run

```bash
# Terminal 1: Start Metro bundler
cd AwesomeProject
npm start

# Terminal 2: Build and run on Android
npm run android
```

## Project Structure

```
.
├── AwesomeProject/          # React Native project
│   ├── src/                 # TypeScript source
│   │   ├── core/            # Engine, dialogue, ability layers
│   │   ├── features/        # Feature modules (task, model, settings)
│   │   ├── navigation/      # App navigation
│   │   └── shared/          # Types, constants, utils
│   └── android/             # Kotlin native layer
│       └── app/src/main/java/com/awesomeproject/
│           ├── bridge/      # Native Modules (Accessibility, ADB, FloatingWindow)
│           ├── service/     # Services (Accessibility, TaskExecution)
│           └── accessibility/  # Gesture & screenshot handlers
├── doc/                     # Development documentation (Chinese)
├── src/                     # Deployment guides (Chinese)
└── design_demo.html         # UI design mockup
```

## Supported Model Providers

| Provider | Example Model |
|----------|--------------|
| Zhipu AI | AutoGLM-Phone-9B, GLM-4V |
| ModelScope | AutoGLM-Phone-9B |
| OpenAI | gpt-4o, gpt-4-vision-preview |
| Anthropic | claude-3-opus, claude-3-sonnet |
| DeepSeek | deepseek-vl2 |
| Moonshot | moonshot-v1-8k-vision |
| Custom | Any OpenAI-compatible endpoint |

## Awards

- 🏆 Zhipu AI Open-AutoGLM Developer Event — Bonus Prize
- 🏆 JieYue Star "Galaxy Explorer" Developer Event — Bonus Prize

## Related

- [Open-AutoGLM](https://github.com/zai-org/Open-AutoGLM) — The upstream framework
- [a2a_ai_mobile_skill_market](https://github.com/lisret/a2a_ai_moblie_skill_market) — AI skill marketplace for mobile testing

## License

MIT
