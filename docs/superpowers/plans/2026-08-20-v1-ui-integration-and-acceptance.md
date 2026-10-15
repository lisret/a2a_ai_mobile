# V1 UI Integration and Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留 `V1` UI 的前提下，把首页、手机操作、视觉 Agent 工具、模型配置、交代、隐私和活动页接到真实 Application Facade / ViewState，收口 task-scoped 事件，并以 Android/iOS 构建、真机路径、隐私扫描和独立门禁完成统一签发。

**Architecture:** 以 `V1@9ff7ba4cc4dc186b79b6e62181333ae6c9132f54` 为产品基线，先冻结不依赖 React Native 的 UI 契约，再让三个 worker 只新增互不重叠的 Facade 文件；随后由唯一集成 Agent 串行修改所有共享热点。UI 只消费 Facade 和稳定 ViewState，不直接读取 provider、repository、AsyncStorage、原生桥或执行循环；前台、Headless、通知和页面都以 `{taskId, sessionRevision, sequence}` 识别同一任务。

**Tech Stack:** React Native 0.73.6、React 18.2、TypeScript 5.0.4、Jest 29.6、`@testing-library/react-native` 13.3、React Navigation 6、Android Kotlin 1.9.24 / compileSdk 34 / minSdk 21、iOS 13.4+、AsyncStorage、Android Keystore、iOS Keychain。

**Design sources:**

- `docs/superpowers/specs/2026-08-20-v1-feature-gap-parallel-agent-delivery-design.md`
- `docs/superpowers/plans/2026-08-20-v1-complete-parallel-delivery.md`
- `docs/superpowers/plans/2026-08-20-v1-runtime-foundation.md`
- `docs/superpowers/plans/2026-08-20-v1-capability-domains.md`
- `docs/superpowers/specs/2026-08-19-nono-runtime-channel-refactor-design.md`
- `docs/superpowers/plans/2026-08-19-nono-runtime-channel-refactor.md`
- `docs/superpowers/plans/2026-08-20-nono-offline-asr.md`
- `docs/superpowers/plans/2026-08-20-nono-avatar-glb-packs.md`

## Global Constraints

- 产品基线固定为 `9ff7ba4cc4dc186b79b6e62181333ae6c9132f54`；禁止把 `codex/agent-runtime-phase1`、`codex/nono-ui-runtime-integration` 或任何旧集成分支整分支 merge 到 V1。
- 开始本计划前，`codex/v1-runtime-integration` 必须已包含 Runtime contracts、CredentialStore、model/provider catalog、配置快照、不可变 session、唯一 `OperateTaskRunner`、Companion、Errand、Visual Agent Tool adapter registry 和隐私日志边界；本计划不重建这些核心模块。
- 当前仓库根工作树已有用户修改和未跟踪文件。所有实施都在独立 worktree 中进行，不在 `/Users/a/Desktop/code/tool/a2a_ai_mobile` 根工作树写业务文件。
- 最多三个编码 worker 并行；并行 worker 只能新增本计划分配的 Facade/测试文件，不能修改任何现有 Screen、Hook、service、navigation、storage 或原生文件。
- 所有共享热点只由集成 Agent 串行修改；worker 发现需要热点改动时只提交接口需求，不越权写文件。
- Companion 永不截图、永不执行设备动作；普通对话、偏好 proposal 和交代 proposal 均先经过 Companion Facade，持久化必须等用户确认。
- 一个 `taskId` 只绑定一个 `ResolvedOperateSessionV1`；若走视觉 Agent 工具，session 还必须固化不可变的 `{profileId, sourceConfigRevision, toolId, capabilities}` snapshot。active profile 或 profile 内容变化只影响新任务，运行中任务继续使用创建时的 snapshot 与 `sessionRevision`。
- 视觉 Agent 工具的 active profile 未就绪、断线，或缺少 canonical `imageInput` / `structuredAction` 任一必需能力时操作必须 `blocked`；`OpenClaw`、`Codex`、`Cursor`、`dsh`、`Hermes` 五个 built-in adapters 均执行同一 zero-fallback 规则，禁止静默回退本地或云端三模式；Companion 不受影响。
- 本地视觉不可运行或推理失败时不得调用 cloud perception 或 unified direct；PhoneOperate 不允许激活不可运行模式。
- Headless taskData 只允许 `{taskId, sessionRevision}`；不得包含 instruction、model、apiKey、baseUrl、截图、原始响应。
- UI 任务事件必须包含 `taskId`、`sessionRevision`、单调递增 `sequence` 和明确 `type`；不得再使用 `taskId: 'current'`、无 taskId cancel 或靠页面 `executing` 布尔值接收全局事件。
- API Key 只存在于 Android Keystore / iOS Keychain 支持的 CredentialStore；编辑 UI 只提交 `keep | replace | remove` intent，`replace` 明文仅存在于当前输入控件到 CredentialStore 命令的瞬时调用栈，绝不回填；AsyncStorage、长期 React state、taskData、历史、日志和诊断证据均不得出现明文。
- 模型配置顶层模式只有 `preset | custom`。preset 固定展示 OpenAI、Anthropic、Gemini、DeepSeek、xAI、百炼 Qwen、智谱、Kimi、MiniMax、火山 Doubao，并保留 ModelScope compatibility preset；无论厂商目录是否支持或请求是否成功，模型 ID 始终允许手输。
- ASR 使用既有离线计划的 `SpeechRouter`，不使用 `SpeechRecognizer` 或演示话轮；Avatar 使用既有本地包计划，运行时 JS 只来自安装包，包失败回滚 builtin。
- Android ASR/可下载 Avatar 是本版真机范围；iOS 必须编译并保持 builtin Avatar/非崩溃路径，Android-only 功能必须在报告中按产品范围记录 `WAIVED`，不能伪报 `PASS`。
- 每个行为必须经历真实 RED → GREEN；禁止删断言、放宽隐私规则、忽略测试目录或增加任意 sleep 获绿。
- 跨计划 seam 名称固定为 `ModelProviderRegistry`、`ProviderModelCatalogPort`、`ModelEndpointProfileRepository`、`VisualAgentToolRegistry`、`VisualAgentToolId`、`VisualAgentCapabilitySet`、`VisualAgentProfileV1`；本计划在 Wave 0 只新增 Task 1 列出的八个 UI-only narrow `*ApplicationPort` 与一个 `TaskUiEventSource`，不得创建近义 registry/catalog/profile contract，后续 worker 不得重声明这些 ports。
- 提交/PR/合入前必须遵守 agent-workflow：Kimi K3-first `agent-runtime review`、独立 testing Agent、`agent-runtime test-gate --record docs/superpowers/reports/2026-08-20-v1-ui-integration-and-acceptance-verification.md`。报告中的 Candidate code SHA 必须等于不可变 candidate checkpoint；若随后只提交验收报告，Evidence commit 与 candidate 的 diff 只能包含该报告，且 test/review gate 必须明确关联这两个 SHA。

---

## Current Repository Evidence

| 证据 | V1 当前状态 | 本计划约束 |
| --- | --- | --- |
| Git | `V1` 指向 `9ff7ba4 feat: add NoNo companion UI, capability pages, and local 3D avatar` | 从干净 runtime checkpoint 建新 worktree，不覆盖根工作树 |
| Worktree | 当前已有十余个 `.worktrees/nono-*` 与两个外部 worktree | 新分支使用独立名称，不复用、不删除旧 worktree |
| Home | `HomeScreen.tsx:51-76` 是 `DEMO_TURNS`；`149-317` 同时接前台/后台和全局事件；`374-382` 后台失败再开前台循环；`393` 发 `taskId:'current'` | Home 只调 Facade，删除 demo、双 owner、全局事件和直接 repository/model 访问 |
| Navigation | `HomeScreen.tsx:336` 用 Root Stack navigation 直接跳 Tab route `Capabilities`，V1 `tsc` 报 TS2769 | 使用 `MainTabs` nested params，不把 `Capabilities` 伪装成 Root route |
| PhoneOperate | `PhoneOperateScreen.tsx:43-49` 读 `NonoConfigService`；`146` 明写本地 runtime 未接通但仍回退云端一体；`168` 无可运行性校验直接激活 | Facade 返回每模式 blockers/runnable；不可运行模式不能激活，文案来自 ViewState |
| Visual Agent tools | `OpenClawScreen.tsx:14-18` 只读本地 config；`44` 固定“远程会话尚未接通”；不存在 Codex/Cursor/dsh/Hermes 统一配置 UI | 泛化为多 profile 的 `VisualAgentToolsScreen`；OpenClaw 只是 preset，并保留一版旧 route alias；展示 readiness/maturity/capabilities，断线或缺必需能力时 zero fallback |
| Model UI | `AddModelScreen.tsx` / `EditModelScreen.tsx` 硬编码 provider chips；现有 `ApiProviderSelector`、`ModelNameSelector`、`ModelListService` 未接线；目录异常被折叠为空数组且无 stale-response guard | 由 `ModelConfigFacade/ViewState` 统一接线；顶层只保留 `preset | custom`，模型目录呈现七态且旧响应不得覆盖新选择，凭据只用 keep/replace/remove intent |
| Errand/Activity | `ErrandsScreen` 只有说明卡；`ErrandDetailScreen` 和 `TaskHistoryScreenTab` 把 errand 混在 `MemoryItem[]` | 分别读 `ErrandRepository`、`PreferenceRepository`、`TaskRepository` 的真实 ViewState |
| Privacy | `PrivacyScreen.tsx:85-104` 使用静态能力说明 | 显示由当前 config/policy 派生的数据去向和真实诊断字段 |
| Events | `TaskExecutionHeadless.ts`、`TaskStateModule.ts` 和多个 Screen 发/收多组 `Task*` 全局事件；Android 通知 cancel 不带 taskId | 统一 `NonoTaskEventV1` / `NonoTaskCancelRequestedV1`，全链路 task-scoped |
| Headless privacy | `useTaskExecutionWithBackground.ts:56-71` 把 instruction 与完整 model/apiKey 放进 taskData；`TaskExecutionHeadlessService.kt:87` 记录 taskData | payload 精确两字段；原生禁止记录 payload 内容 |
| Local experience | V1 已有 `NonoAvatar3D`/`AvatarLooksScreen` 演示壳；离线 ASR 和下载 Avatar 各有独立计划 | 只接其已验证领域接口；Home 和导航接线由集成 Agent 串行完成 |

## Execution Topology

### Worktree and branch protocol

- [ ] **Locate and verify the integration worktree at the Wave 2 checkpoint**

This plan is executed under the master plan after capability Wave 2. Run from `/Users/a/Desktop/code/tool/a2a_ai_mobile`:

```bash
git rev-parse codex/checkpoint-v1-wave2^{commit}
git rev-parse codex/v1-runtime-integration^{commit}
git merge-base --is-ancestor codex/checkpoint-v1-contracts codex/checkpoint-v1-wave2
git worktree list --porcelain
```

Expected: the two `rev-parse` outputs are identical, `merge-base` exits 0, and the worktree list identifies the clean `codex/v1-runtime-integration` worktree. If the integration branch does not equal the Wave 2 checkpoint or its worktree is dirty, conclude `FAIL`; do not continue in the primary checkout.

- [ ] **Create the three UI Facade worker worktrees after Wave 2 contains Task 1**

```bash
git worktree add .worktrees/v1-ui-facade-operate -b codex/v1-w3-ui-operate-companion codex/checkpoint-v1-wave2
git worktree add .worktrees/v1-ui-facade-capability -b codex/v1-w3-ui-capability codex/checkpoint-v1-wave2
git worktree add .worktrees/v1-ui-facade-activity -b codex/v1-w3-ui-errand-activity codex/checkpoint-v1-wave2
```

Expected: 三个 worktree HEAD 完全相同，均为 `codex/checkpoint-v1-wave2`；该 checkpoint 已包含 Task 1 contract commit。

- [ ] **Enforce delivery metadata for every worker**

每个 worker 交付以下完整字段；缺一项，集成 Agent 拒收：

```text
Work package: write the canonical Task number and branch name
Base SHA: paste the literal 40-character Wave 2 checkpoint SHA
Commit SHA: paste every package commit SHA in application order
Owned files: list every changed path
Changed interfaces: write `none` or list each frozen-compatible change
RED command and failure: paste the command, exit code, and decisive failure line
GREEN commands and results: paste every command, exit code, and suite/test counts
Manual checks: list checks and actual results; write `none required` only when the Task says so
Known gaps: list gaps; write `none` only after checking the Task acceptance criteria
Rollback command: give the exact `git revert` command or ordered commands
```

### Dependency waves

| Wave | 可并行任务 | Owner | 前置 | Checkpoint |
| --- | --- | --- | --- | --- |
| 0 | Task 1 | 集成 Agent，串行；由 master Task 2 提前完成 | V1 baseline | `codex/checkpoint-v1-contracts` |
| 1 | Task 2、Task 3、Task 4 | 三个编码 worker，并行；Task 3 同时冻结视觉工具与模型配置 UI facade | `codex/checkpoint-v1-wave2` | 三个独立 branch ranges |
| 1 integration | Task 5 | 集成 Agent，串行 cherry-pick + composition | 三个 worker branch ranges | Task 5 commit |
| 2 | Task 6 → Task 7 → Task 8 → Task 9 | 集成 Agent，严格串行 | Task 5 commit | 每 Task 一个可 revert commit |
| 3 | Task 10 | ASR/Avatar 领域包按 master Task 8 的前置关系准备；Home/导航接线仍由集成 Agent串行 | Task 8、Task 9 | `codex/checkpoint-v1-candidate` |
| 4 | Task 11、Task 12 | 独立 testing Agent + review gate；修复仍由集成 Agent | `codex/checkpoint-v1-candidate` | release candidate evidence |

### Shared-hotspot ownership

以下文件在本计划期间只有集成 Agent 可以修改，且一次只开放一个串行 Task：

| 文件 | 串行 Task |
| --- | --- |
| `AwesomeProject/App.tsx` | Task 5 |
| `AwesomeProject/src/shared/types/navigation.ts` | Task 6 / Task 9，按顺序 |
| `AwesomeProject/src/navigation/AppNavigator.tsx` | Task 6 / Task 9 / Task 10，按顺序 |
| `AwesomeProject/src/features/task/screens/HomeScreen.tsx` | Task 6 / Task 8 / Task 10，按顺序 |
| `AwesomeProject/src/features/model/screens/AddModelScreen.tsx` | Task 6 |
| `AwesomeProject/src/features/model/screens/EditModelScreen.tsx` | Task 6 |
| `AwesomeProject/src/features/model/screens/ModelListScreen.tsx` | Task 6 |
| `AwesomeProject/src/features/model/components/ApiProviderSelector.tsx` | Task 6 |
| `AwesomeProject/src/features/model/components/ModelNameSelector.tsx` | Task 6 |
| `AwesomeProject/src/features/model/components/ModelListPanel.tsx` | Task 6 |
| `AwesomeProject/src/features/model/components/ModelItem.tsx` | Task 6 |
| `AwesomeProject/src/features/model/services/ModelListService.ts` | Task 6 |
| `AwesomeProject/src/shared/constants/apiProviders.ts` | Task 6 |
| `AwesomeProject/src/application/facades/createAppFacades.ts` | Task 5 / Task 6，按顺序 |
| `AwesomeProject/src/features/task/hooks/useTaskExecution.ts` | Task 7 |
| `AwesomeProject/src/features/task/useTaskExecutionWithBackground.ts` | Task 7 |
| `AwesomeProject/src/features/task/services/TaskExecutionHeadless.ts` | Task 7 |
| `AwesomeProject/src/core/engine/taskEngine/task/TaskExecutionEngine.ts` | Task 7 |
| `AwesomeProject/src/core/engine/taskEngine/task/modules/TaskStateModule.ts` | Task 7 |
| `AwesomeProject/src/core/engine/taskEngine/task/modules/CancellationModule.ts` | Task 7 |
| `AwesomeProject/src/features/task/screens/TaskHistoryScreen.tsx` | Task 7 |
| `AwesomeProject/src/features/model/services/ModelService.ts` | 本计划只读；legacy data 仅由 runtime migration 消费，new composition/Screen 不得 import |
| `AwesomeProject/src/features/capability/services/NonoConfigService.ts` | 本计划只读；需要变化则退回 runtime checkpoint 修复 |
| `AwesomeProject/src/shared/utils/storage.ts` | 本计划只读；需要变化则退回 runtime checkpoint 修复 |
| `AwesomeProject/src/core/ability/accessibility/AccessibilityService.ts` | Task 7 |
| `AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityModule.kt` | Task 7 |
| `AwesomeProject/android/app/src/main/java/com/awesomeproject/utils/ServiceManager.kt` | Task 7 |
| `AwesomeProject/android/app/src/main/java/com/awesomeproject/service/TaskExecutionService.kt` | Task 7 |
| `AwesomeProject/android/app/src/main/java/com/awesomeproject/service/TaskExecutionHeadlessService.kt` | Task 7 |
| `AwesomeProject/ios/AwesomeProject/AutoGLMAccessibilityModule.m` | Task 7 |
| `AwesomeProject/jest.setup.js` | Task 5 / Task 10，按顺序 |

## Exact File Map

| 文件 | 操作 | 单一职责 |
| --- | --- | --- |
| `AwesomeProject/src/application/facades/UiRuntimeContracts.ts` | Create | 所有 Facade、ViewState、task event 与 port 的冻结契约 |
| `AwesomeProject/src/application/facades/OperateFacade.ts` | Create | 操作任务 start/cancel/state，不拥有执行循环 |
| `AwesomeProject/src/application/facades/CompanionFacade.ts` | Create | transcript → reply/proposal → confirm，文本域隔离 |
| `AwesomeProject/src/application/events/ScopedTaskUiEvents.ts` | Create | 按 task/session/sequence 过滤 UI 事件 |
| `AwesomeProject/src/application/facades/PhoneOperateFacade.ts` | Create | 模式可运行性、draft、原子激活的 ViewState |
| `AwesomeProject/src/application/facades/VisualAgentToolsFacade.ts` | Create | 多 tool profile、active profile、readiness/maturity/capabilities 与 zero-fallback ViewState |
| `AwesomeProject/src/application/facades/ModelConfigFacade.ts` | Create | preset/custom draft、目录七态、stale-request 防护和 credential intent |
| `AwesomeProject/src/application/facades/PrivacyFacade.ts` | Create | 真实数据去向、记忆和诊断 ViewState |
| `AwesomeProject/src/application/facades/ErrandFacade.ts` | Create | 交代启停、列表、编辑、取消 |
| `AwesomeProject/src/application/facades/ActivityFacade.ts` | Create | Preference/Errand/Task 三仓聚合 ViewState |
| `AwesomeProject/src/application/facades/AppFacadesContext.tsx` | Create | 可注入的 React Context；测试不触碰生产 singleton |
| `AwesomeProject/src/application/facades/createAppFacades.ts` | Create/Modify | 唯一 production composition root；Task 6 把 legacy model UI service 收口为 runtime registry/catalog/profile ports 的窄适配 |
| `AwesomeProject/App.tsx` | Modify | 在 Navigator 外安装唯一 `AppFacadesProvider` |
| `AwesomeProject/jest.setup.js` | Modify | 仅补 composition/ASR 所需 native mocks |
| `AwesomeProject/src/shared/types/navigation.ts` | Modify | canonical VisualAgentTools route、OpenClaw 一版 alias 与 nested tabs 类型 |
| `AwesomeProject/src/navigation/AppNavigator.tsx` | Modify | canonical route 注册和兼容 alias 转发 |
| `AwesomeProject/src/features/task/services/NativeTaskUiEventSource.ts` | Create | `DeviceEventEmitter` 与 `NonoTaskEventV1` 的唯一边界 |
| `AwesomeProject/src/features/task/services/TaskUiEventNames.ts` | Create | 两个版本化事件名常量 |
| `AwesomeProject/src/features/capability/screens/PhoneOperateScreen.tsx` | Modify | 只渲染 `PhoneOperateViewState`，不可运行模式禁用激活 |
| `AwesomeProject/src/features/capability/screens/VisualAgentToolsScreen.tsx` | Create | 保存多个 profile、选择 active profile，并展示五个 built-in 及已通过 conformance 的 custom adapter 能力状态 |
| `AwesomeProject/src/features/capability/screens/OpenClawScreen.tsx` | Modify | 一版兼容 route alias，只转发到 `VisualAgentToolsScreen` 的 OpenClaw preset，不拥有状态 |
| `AwesomeProject/src/features/model/screens/AddModelScreen.tsx` | Modify | 删除硬编码 provider chips，使用 `ModelConfigFacade` 与两个 selector |
| `AwesomeProject/src/features/model/screens/EditModelScreen.tsx` | Modify | 不回填 secret，以 keep/replace/remove intent 编辑模型配置 |
| `AwesomeProject/src/features/model/screens/ModelListScreen.tsx` | Modify | 通过 `ModelConfigListViewState` 列举/选择/删除 binding，不直连 legacy `ModelService` |
| `AwesomeProject/src/features/model/components/ApiProviderSelector.tsx` | Modify | 顶层严格 `preset | custom`，呈现完整 preset registry |
| `AwesomeProject/src/features/model/components/ModelNameSelector.tsx` | Modify | 呈现当前凭证可用模型、目录七态，并始终保留手输 model ID |
| `AwesomeProject/src/features/model/components/ModelListPanel.tsx` | Modify | PhoneOperate/Companion 共用的 role-scoped binding list，命令走 `ModelConfigFacade` |
| `AwesomeProject/src/features/model/components/ModelItem.tsx` | Modify | 只接 `ModelConfigListItemViewState`，不硬编码 provider 名称 |
| `AwesomeProject/src/features/settings/screens/APIKeyGuideScreen.tsx` | Modify | 按 canonical preset ID 显示同一厂商集合的本地化凭据指引；不再维护另一套 provider ID/base URL registry |
| `AwesomeProject/src/features/model/services/ModelListService.ts` | Modify | 返回 typed catalog result，不把错误折叠为空列表 |
| `AwesomeProject/src/features/model/services/ModelService.ts` | Read-only | legacy data 仅作 runtime migration input；禁止新 composition/Screen 直连或在 UI plan 重写 storage schema |
| `AwesomeProject/src/shared/types/Model.ts` | Read-only | legacy `AIModel.apiKey` 只作为 runtime migration input；新 Screen/Fascade 不消费，canonical 类型来自 runtime profile/binding contracts |
| `AwesomeProject/src/features/capability/services/NonoConfigService.ts` | Read-only | legacy config 只由 runtime migration 读取；视觉工具和模型 UI 不再直连 |
| `AwesomeProject/src/shared/utils/storage.ts` | Read-only | UI 不新增 key；profile/binding/tool config 与 secret migration 由 runtime foundation 拥有 |
| `AwesomeProject/src/shared/constants/apiProviders.ts` | Modify | 仅保留 keyed-by-`ProviderPresetV1` 的 UI presentation、localized credential guide 与 HTTPS host allowlist；base URL/auth/catalog 等 canonical metadata 只来自 `ModelProviderRegistry` |
| `AwesomeProject/src/features/capability/screens/ErrandsScreen.tsx` | Modify | 只渲染真实 Errand ViewState |
| `AwesomeProject/src/features/capability/screens/ErrandDetailScreen.tsx` | Modify | 通过 Errand Facade 编辑/取消 |
| `AwesomeProject/src/features/capability/screens/PrivacyScreen.tsx` | Modify | 只渲染真实数据去向与记忆状态 |
| `AwesomeProject/src/features/capability/screens/CapabilitiesScreen.tsx` | Modify | 能力卡 meta 由 Facade ViewState 派生 |
| `AwesomeProject/src/features/task/screens/TaskHistoryScreenTab.tsx` | Modify | Activity Facade 聚合真实三仓数据 |
| `AwesomeProject/src/features/task/screens/HomeScreen.tsx` | Modify | 移除 demo/直接服务，接 Companion/Operate/Errand + ASR/Avatar |
| `AwesomeProject/src/features/task/components/NonoAvatar3D.tsx` | Modify | active GLB 注入与失败回滚回调 |
| `AwesomeProject/src/shared/constants/permission.config.ts` | Modify | 真实麦克风用途说明 |
| `AwesomeProject/android/app/src/main/AndroidManifest.xml` | Modify | `RECORD_AUDIO` |
| `AwesomeProject/src/__tests__/application/**` | Create | Facade/契约纯测试 |
| `AwesomeProject/src/__tests__/features/**` | Create/Modify | Screen 与 task-scoped 集成测试 |
| `AwesomeProject/src/__tests__/integration/**` | Create | 通道、恢复、隐私和用户路径矩阵 |
| `docs/superpowers/reports/2026-08-20-v1-ui-integration-and-acceptance-verification.md` | Create | 最终 PASS/FAIL/WAIVED 证据 |
| `docs/superpowers/reports/2026-08-20-v1-visual-agent-provider-research.md` | Create | 候选冻结前的官方工具协议与 provider catalog 版本证据 |

---

### Task 1: Freeze UI Facade, ViewState, and Event Contracts

**Mode:** Wave 0，集成 Agent 串行。

**Files:**

- Create: `AwesomeProject/src/application/facades/UiRuntimeContracts.ts`
- Test: `AwesomeProject/src/__tests__/application/facades/UiRuntimeContracts.test.ts`

**Interfaces:**

- Consumes: `AgentModeId`、`ModelListKey`、runtime canonical `ProviderPresetV1`、capability canonical `VisualAgentToolId` / `VisualAgentCapabilitySet` 和 task/session/profile/model-catalog/errand/preference/task-history领域值；不得 import React Native、AsyncStorage 或具体 provider 实现。
- Produces: 下列 exact union/interface。Task 2-Task 10 只能消费，不得各自复制或扩展同名类型。

```ts
import type {AgentModeId, ModelListKey} from '../../shared/types/Model';
import type {
  ProviderAuthV1,
  ProviderCapabilityDeclarationV1,
  ProviderPresetV1,
  ProviderProtocolV1,
} from '../../core/engine/operateRuntime/model/ModelProviderContracts';
import type {
  VisualAgentCapabilitySet,
  VisualAgentToolId,
} from '../../core/engine/operateRuntime/visualAgent/VisualAgentContracts';

export type Unsubscribe = () => void;

export type UiBlockerCode =
  | 'phone_operate_disabled'
  | 'missing_unified_model'
  | 'missing_split_vision_model'
  | 'missing_split_planner_model'
  | 'missing_local_planner_model'
  | 'local_model_not_ready'
  | 'credential_unavailable'
  | 'accessibility_disabled'
  | 'visual_agent_not_ready'
  | 'visual_agent_capability_missing'
  | 'config_revision_conflict'
  | 'companion_model_missing';

export interface UiBlocker {
  code: UiBlockerCode;
  message: string;
}

export interface ModeOptionViewState {
  id: AgentModeId;
  label: string;
  nodes: readonly string[];
  caption: string;
  runnable: boolean;
  blockers: readonly UiBlocker[];
}

export interface PhoneOperateViewState {
  status: 'loading' | 'ready' | 'error';
  revision: number;
  activeMode: AgentModeId;
  draftMode: AgentModeId;
  modes: Record<AgentModeId, ModeOptionViewState>;
  adbFallbackEnabled: boolean;
  errorMessage?: string;
}

export type BuiltInVisualAgentToolId = Exclude<VisualAgentToolId, `custom:${string}`>;
export type VisualAgentReadiness =
  | 'not_configured'
  | 'connecting'
  | 'ready'
  | 'disconnected'
  | 'unsupported'
  | 'error';
export type VisualAgentMaturity = 'stable' | 'beta' | 'experimental';

export interface VisualAgentProfileViewState {
  profileId: string;
  toolId: VisualAgentToolId;
  displayName: string;
  enabled: boolean;
  endpointLabel: string;
  readiness: VisualAgentReadiness;
  maturity: VisualAgentMaturity;
  requestedCapabilities: Readonly<VisualAgentCapabilitySet>;
  capabilities: Readonly<VisualAgentCapabilitySet>;
  runnable: boolean;
  blockers: readonly UiBlocker[];
}

export interface VisualAgentToolOptionViewState {
  toolId: VisualAgentToolId;
  builtIn: boolean;
  label: string;
  readiness: VisualAgentReadiness;
  maturity: VisualAgentMaturity;
  capabilities: Readonly<VisualAgentCapabilitySet>;
  configuredProfileCount: number;
}

export interface VisualAgentToolsViewState {
  status: 'loading' | 'ready' | 'error';
  revision: number;
  enabled: boolean;
  activeProfileId?: string;
  adapters: readonly VisualAgentToolOptionViewState[];
  profiles: readonly VisualAgentProfileViewState[];
  canOperate: boolean;
  blocker?: UiBlocker;
  errorMessage?: string;
}

export type ModelConfigMode = 'preset' | 'custom';
export type ProviderPresetId = ProviderPresetV1;
export type ModelCatalogStatus =
  | 'loading'
  | 'ready'
  | 'unsupported'
  | 'auth_failed'
  | 'network_failed'
  | 'empty'
  | 'stale';
export type CredentialEditIntent =
  | {action: 'keep'}
  | {action: 'replace'; plaintext: string}
  | {action: 'remove'};

export interface VisualAgentProfileDraftInput {
  profileId?: string;
  toolId: VisualAgentToolId;
  enabled: boolean;
  bridgeUrl: string;
  bindingId: string;
  credential: CredentialEditIntent;
  requestedCapabilities: VisualAgentCapabilitySet;
}

export interface ProviderPresetViewState {
  id: ProviderPresetId;
  label: string;
  maturity: 'stable' | 'beta' | 'compatibility';
  catalogSupported: boolean;
}

export interface ModelCatalogViewState {
  requestGeneration: number;
  status: ModelCatalogStatus;
  models: readonly {id: string; label: string}[];
  fetchedAtMs?: number;
  message?: string;
}

export interface CustomProviderConfigViewState {
  providerLabel: string;
  baseUrl: string;
  protocol: ProviderProtocolV1;
  auth: ProviderAuthV1;
  chatPath: string;
  modelListPath: string | null;
  declaredCapabilities: ProviderCapabilityDeclarationV1;
  capabilityTrust: 'user_declared_unverified';
}

export interface ModelConfigViewState {
  status: 'loading' | 'ready' | 'error';
  revision: number;
  mode: ModelConfigMode;
  selectedPresetId?: ProviderPresetId;
  presets: readonly ProviderPresetViewState[];
  providerLabel: string;
  baseUrl: string;
  custom?: CustomProviderConfigViewState;
  modelId: string;
  credential: {state: 'ready' | 'missing' | 'unavailable'; maskedLabel?: string};
  catalog: ModelCatalogViewState;
  errorMessage?: string;
}

export interface ModelConfigListItemViewState {
  bindingId: string;
  endpointProfileId: string;
  displayName: string;
  providerLabel: string;
  modelId: string;
  mode: ModelConfigMode;
  selected: boolean;
}

export interface ModelConfigListViewState {
  status: 'loading' | 'ready' | 'error';
  revision: number;
  list: ModelListKey;
  items: readonly ModelConfigListItemViewState[];
  errorMessage?: string;
}

interface ModelConfigCommandBase {
  list: ModelListKey;
  bindingId?: string;
  selectedModelId: string;
  credential: CredentialEditIntent;
}

export type ModelConfigSaveInput =
  | (ModelConfigCommandBase & {
      expectedRevision: number;
      mode: 'preset';
      presetId: ProviderPresetId;
      baseUrlOverride: string | null;
    })
  | (ModelConfigCommandBase & {
      expectedRevision: number;
      mode: 'custom';
      customProviderLabel: string;
      baseUrl: string;
      protocol: ProviderProtocolV1;
      auth: ProviderAuthV1;
      chatPath: string;
      modelListPath: string | null;
      declaredCapabilities: ProviderCapabilityDeclarationV1;
    });

interface ModelCatalogRefreshBase {
  list: ModelListKey;
  bindingId?: string;
  requestGeneration: number;
  credential: Extract<CredentialEditIntent, {action: 'keep' | 'replace'}>;
}

export type ModelCatalogRefreshInput =
  | (ModelCatalogRefreshBase & {
      mode: 'preset';
      presetId: ProviderPresetId;
      baseUrlOverride: string | null;
    })
  | (ModelCatalogRefreshBase & {
      mode: 'custom';
      customProviderLabel: string;
      baseUrl: string;
      protocol: ProviderProtocolV1;
      auth: ProviderAuthV1;
      chatPath: string;
      modelListPath: string | null;
      declaredCapabilities: ProviderCapabilityDeclarationV1;
    });

export interface ErrandItemViewState {
  id: string;
  title: string;
  kind: 'once' | 'schedule';
  status: 'pending' | 'leased' | 'failed' | 'completed' | 'cancelled';
  scheduleLabel: string;
  nextDueAtMs?: number;
  lastRunAtMs?: number;
  errorMessage?: string;
}

export interface ErrandsViewState {
  status: 'loading' | 'ready' | 'error';
  enabled: boolean;
  pendingCount: number;
  items: readonly ErrandItemViewState[];
  errorMessage?: string;
}

export interface PrivacyChannelViewState {
  id: 'companion' | 'cloud_direct' | 'cloud_split' | 'local_vision' | 'visual_agent';
  state: 'local' | 'remote' | 'blocked';
  destinationLabel: string;
  fields: readonly string[];
}

export interface PrivacyViewState {
  status: 'loading' | 'ready' | 'error';
  memoryEnabled: boolean;
  memoryLocation: 'device' | 'visual_agent';
  canUseVisualAgentMemory: boolean;
  channels: readonly PrivacyChannelViewState[];
  persistedDiagnosticFields: readonly string[];
  errorMessage?: string;
}

export interface PreferenceViewState {
  id: string;
  kind: 'name' | 'preference';
  title: string;
  body?: string;
}

export interface ActivityTaskViewState {
  id: string;
  title: string;
  status: 'running' | 'success' | 'failed';
  createdAtMs: number;
  completedAtMs?: number;
  stepCount: number;
}

export interface ActivityViewState {
  status: 'loading' | 'ready' | 'error';
  memoryEnabled: boolean;
  memoryLocationLabel: string;
  preferences: readonly PreferenceViewState[];
  errands: readonly ErrandItemViewState[];
  tasks: readonly ActivityTaskViewState[];
  errorMessage?: string;
}

export type CompanionProposal =
  | {kind: 'preference'; title: string; body?: string}
  | {kind: 'errand'; title: string; errandType: 'once' | 'schedule'; when?: string};

export interface CompanionTurnViewState {
  id: string;
  transcript: string;
  reply: string;
  intent: 'companion' | 'operate' | 'preference' | 'errand' | 'ambiguous';
  proposal?: CompanionProposal;
}

export interface CompanionViewState {
  phase: 'idle' | 'listening' | 'thinking' | 'ready' | 'error';
  modelLabel?: string;
  partialText?: string;
  turn?: CompanionTurnViewState;
  errorMessage?: string;
}

export interface TaskStepViewState {
  step: number;
  actionLabel: string;
  occurredAtMs: number;
}

export interface OperateTaskViewState {
  phase: 'idle' | 'starting' | 'running' | 'success' | 'failed' | 'cancelled' | 'blocked';
  taskId?: string;
  sessionRevision?: number;
  instruction?: string;
  currentStep?: number;
  maxSteps?: number;
  steps: readonly TaskStepViewState[];
  visualAgentProfileSnapshot?: {
    profileId: string;
    sourceConfigRevision: number;
    toolId: VisualAgentToolId;
    capabilities: Readonly<VisualAgentCapabilitySet>;
  };
  blocker?: UiBlocker;
  errorMessage?: string;
}

interface TaskUiEventBase {
  taskId: string;
  sessionRevision: number;
  sequence: number;
  occurredAtMs: number;
}

export type TaskUiEvent =
  | (TaskUiEventBase & {type: 'started'; maxSteps: number})
  | (TaskUiEventBase & {type: 'step_started'; step: number; maxSteps: number})
  | (TaskUiEventBase & {type: 'step_completed'; step: number; actionLabel: string})
  | (TaskUiEventBase & {type: 'completed'; summary: string})
  | (TaskUiEventBase & {type: 'failed'; code: string; message: string; isCancelled: boolean});

export type StartOperateResult =
  | {
      kind: 'started';
      taskId: string;
      sessionRevision: number;
      visualAgentProfileSnapshot?: OperateTaskViewState['visualAgentProfileSnapshot'];
    }
  | {kind: 'blocked'; blocker: UiBlocker};

export interface OperateFacade {
  getViewState(): Promise<OperateTaskViewState>;
  start(instruction: string): Promise<StartOperateResult>;
  cancel(taskId: string): Promise<void>;
  subscribeTask(
    taskId: string,
    sessionRevision: number,
    listener: (event: TaskUiEvent) => void,
  ): Unsubscribe;
}

export interface CompanionFacade {
  getViewState(): Promise<CompanionViewState>;
  submitTranscript(text: string): Promise<CompanionTurnViewState>;
  confirmProposal(turnId: string): Promise<void>;
  dismissTurn(turnId: string): Promise<void>;
}

export interface PhoneOperateFacade {
  getViewState(): Promise<PhoneOperateViewState>;
  selectDraftMode(mode: AgentModeId): Promise<PhoneOperateViewState>;
  activateDraftMode(expectedRevision: number): Promise<PhoneOperateViewState>;
  setAdbFallbackEnabled(enabled: boolean): Promise<PhoneOperateViewState>;
}

export interface VisualAgentToolsFacade {
  getViewState(): Promise<VisualAgentToolsViewState>;
  setEnabled(enabled: boolean, expectedRevision: number): Promise<VisualAgentToolsViewState>;
  saveProfile(
    profile: VisualAgentProfileDraftInput,
    expectedRevision: number,
  ): Promise<VisualAgentToolsViewState>;
  deleteProfile(profileId: string, expectedRevision: number): Promise<VisualAgentToolsViewState>;
  setActiveProfile(profileId: string, expectedRevision: number): Promise<VisualAgentToolsViewState>;
  refreshProfile(profileId: string): Promise<VisualAgentToolsViewState>;
}

export interface ModelConfigFacade {
  getListViewState(list: ModelListKey): Promise<ModelConfigListViewState>;
  getViewState(input: {list: ModelListKey; bindingId?: string}): Promise<ModelConfigViewState>;
  refreshCatalog(input: ModelCatalogRefreshInput): Promise<ModelCatalogViewState>;
  save(input: ModelConfigSaveInput): Promise<ModelConfigViewState>;
  selectBinding(input: {list: ModelListKey; bindingId: string; expectedRevision: number}): Promise<ModelConfigListViewState>;
  deleteBinding(input: {list: ModelListKey; bindingId: string; expectedRevision: number}): Promise<ModelConfigListViewState>;
}

export interface ErrandFacade {
  getViewState(): Promise<ErrandsViewState>;
  setEnabled(enabled: boolean): Promise<ErrandsViewState>;
  createFromProposal(proposal: Extract<CompanionProposal, {kind: 'errand'}>): Promise<string>;
  update(item: ErrandItemViewState): Promise<ErrandItemViewState>;
  cancel(id: string): Promise<void>;
}

export interface PrivacyFacade {
  getViewState(): Promise<PrivacyViewState>;
  setMemoryEnabled(enabled: boolean): Promise<PrivacyViewState>;
  setMemoryLocation(location: 'device' | 'visual_agent'): Promise<PrivacyViewState>;
  forgetAllPreferences(): Promise<PrivacyViewState>;
}

export interface ActivityFacade {
  getViewState(): Promise<ActivityViewState>;
  forgetPreference(id: string): Promise<ActivityViewState>;
  deleteTask(id: string): Promise<ActivityViewState>;
}

export interface AppFacades {
  operate: OperateFacade;
  companion: CompanionFacade;
  phoneOperate: PhoneOperateFacade;
  visualAgentTools: VisualAgentToolsFacade;
  modelConfig: ModelConfigFacade;
  errands: ErrandFacade;
  privacy: PrivacyFacade;
  activity: ActivityFacade;
}

// Frozen Wave-0 application ports. Later workers implement/consume these names;
// they must not redeclare them beside an individual Facade implementation.
export interface OperateApplicationPort {
  getCurrent(): Promise<OperateTaskViewState>;
  start(instruction: string): Promise<StartOperateResult>;
  cancel(taskId: string): Promise<void>;
}

export interface TaskUiEventSource {
  subscribe(listener: (event: TaskUiEvent) => void): Unsubscribe;
}

export interface CompanionApplicationPort {
  getState(): Promise<CompanionViewState>;
  submitTranscript(text: string): Promise<CompanionTurnViewState>;
  confirmProposal(turnId: string): Promise<void>;
  dismissTurn(turnId: string): Promise<void>;
}

export interface PhoneOperateApplicationPort {
  read(): Promise<PhoneOperateViewState>;
  setDraft(mode: AgentModeId): Promise<PhoneOperateViewState>;
  activate(mode: AgentModeId, expectedRevision: number): Promise<PhoneOperateViewState>;
  setAdbFallback(enabled: boolean): Promise<PhoneOperateViewState>;
}

export interface VisualAgentToolsApplicationPort {
  read(): Promise<VisualAgentToolsViewState>;
  setEnabled(enabled: boolean, expectedRevision: number): Promise<VisualAgentToolsViewState>;
  saveProfile(profile: VisualAgentProfileDraftInput, expectedRevision: number): Promise<VisualAgentToolsViewState>;
  deleteProfile(profileId: string, expectedRevision: number): Promise<VisualAgentToolsViewState>;
  setActiveProfile(profileId: string, expectedRevision: number): Promise<VisualAgentToolsViewState>;
  refreshProfile(profileId: string): Promise<VisualAgentToolsViewState>;
}

export interface ModelConfigApplicationPort {
  read(input: {list: ModelListKey; bindingId?: string}): Promise<ModelConfigViewState>;
  readList(list: ModelListKey): Promise<ModelConfigListViewState>;
  fetchCatalog(input: ModelCatalogRefreshInput): Promise<ModelCatalogViewState>;
  save(input: ModelConfigSaveInput): Promise<ModelConfigViewState>;
  selectBinding(input: {list: ModelListKey; bindingId: string; expectedRevision: number}): Promise<ModelConfigListViewState>;
  deleteBinding(input: {list: ModelListKey; bindingId: string; expectedRevision: number}): Promise<ModelConfigListViewState>;
}

export interface PrivacyApplicationPort {
  read(): Promise<PrivacyViewState>;
  setMemoryEnabled(enabled: boolean): Promise<PrivacyViewState>;
  setMemoryLocation(location: 'device' | 'visual_agent'): Promise<PrivacyViewState>;
  forgetAllPreferences(): Promise<PrivacyViewState>;
}

export interface ErrandApplicationPort {
  read(): Promise<ErrandsViewState>;
  setEnabled(enabled: boolean): Promise<ErrandsViewState>;
  create(proposal: Extract<CompanionProposal, {kind: 'errand'}>): Promise<string>;
  update(item: ErrandItemViewState): Promise<ErrandItemViewState>;
  cancel(id: string): Promise<void>;
}

export interface ActivityApplicationPort {
  read(): Promise<ActivityViewState>;
  forgetPreference(id: string): Promise<ActivityViewState>;
  deleteTask(id: string): Promise<ActivityViewState>;
}
```

- [ ] **Step 1: Write the failing contract test**

```ts
import type {
  AppFacades,
  ModelCatalogStatus,
  PhoneOperateViewState,
  TaskUiEvent,
  BuiltInVisualAgentToolId,
  OperateApplicationPort,
  ModelConfigApplicationPort,
  VisualAgentToolsApplicationPort,
} from '../../../application/facades/UiRuntimeContracts';

describe('UiRuntimeContracts', () => {
  it('requires task identity and sequence on every task event', () => {
    const event: TaskUiEvent = {
      type: 'completed',
      taskId: 'task-1',
      sessionRevision: 7,
      sequence: 9,
      occurredAtMs: 100,
      summary: '完成',
    };
    expect(event.taskId).toBe('task-1');
    expect(event.sessionRevision).toBe(7);
    expect(event.sequence).toBe(9);
  });

  it('models mode readiness instead of a cosmetic selected flag', () => {
    const state = {} as PhoneOperateViewState;
    const facade = {} as AppFacades;
    expect(state.modes).toBeDefined();
    expect(facade.operate).toBeDefined();
  });

  it('freezes generic tool and model catalog unions', () => {
    const preset: BuiltInVisualAgentToolId = 'hermes';
    const catalog: ModelCatalogStatus = 'stale';
    expect(preset).toBe('hermes');
    expect(catalog).toBe('stale');
  });

  it('freezes every application port before parallel facade workers start', () => {
    const ports = {} as {
      operate: OperateApplicationPort;
      modelConfig: ModelConfigApplicationPort;
      visualAgentTools: VisualAgentToolsApplicationPort;
    };
    expect(ports).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
cd AwesomeProject
npx jest src/__tests__/application/facades/UiRuntimeContracts.test.ts --runInBand
```

Expected: FAIL with `Cannot find module '../../../application/facades/UiRuntimeContracts'`.

- [ ] **Step 3: Add the exact contract code above**

`UiRuntimeContracts.ts` 只能 import `AgentModeId`、`ModelListKey`、canonical runtime `ProviderPresetV1` / `ProviderProtocolV1` / `ProviderAuthV1` / `ProviderCapabilityDeclarationV1` 与 canonical capability `VisualAgentToolId` / `VisualAgentCapabilitySet`；所有 UI label 字段都必须是非敏感摘要，不能加入 screenshot、持久化 credential、Authorization、raw response 或完整 `Task`。`CredentialEditIntent.replace.plaintext` 只允许作为 model/Visual Agent command input，禁止出现在任何 ViewState；Visual Agent 的 Bridge URL、binding ID、requested capability 和 credential intent 只属于 `VisualAgentProfileDraftInput`，不得误用只读 `VisualAgentProfileViewState` 作为保存命令。Task 1 同时冻结九个 narrow ApplicationPort/EventSource；Task 2–4 只能 import，不能局部重声明，从而让 Runtime/Capability composition 可以在 facade worker 开始前按同一签名实现端口。

- [ ] **Step 4: Verify contract isolation and typecheck**

Run:

```bash
cd AwesomeProject
npx jest src/__tests__/application/facades/UiRuntimeContracts.test.ts --runInBand
npx tsc --noEmit --pretty false
if rg -n "react-native|AsyncStorage|apiKey|Authorization|screenshot|modelResponse" src/application/facades/UiRuntimeContracts.ts; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: Jest PASS；TypeScript PASS；`rg` 无输出。

- [ ] **Step 5: Commit the frozen contract**

```bash
git add AwesomeProject/src/application/facades/UiRuntimeContracts.ts \
  AwesomeProject/src/__tests__/application/facades/UiRuntimeContracts.test.ts
git commit -m "feat: freeze V1 UI runtime contracts"
```

When the master plan executes this Task, it creates `codex/checkpoint-v1-contracts` after the combined runtime/UI contract commit. If running this child Task independently, create that branch at this commit; if the branch already exists, verify `git rev-parse codex/checkpoint-v1-contracts` equals `git rev-parse HEAD` and stop on mismatch. Wave 1 UI workers later start from `codex/checkpoint-v1-wave2`, which must contain this contract checkpoint as an ancestor.

---

### Task 2: Operate, Companion, and Scoped Task Event Facades

**Mode:** Wave 1 worker A；可与 Task 3、Task 4 并行；只新增列出的文件。

**Files:**

- Create: `AwesomeProject/src/application/events/ScopedTaskUiEvents.ts`
- Create: `AwesomeProject/src/application/facades/OperateFacade.ts`
- Create: `AwesomeProject/src/application/facades/CompanionFacade.ts`
- Test: `AwesomeProject/src/__tests__/application/facades/OperateAndCompanionFacade.test.ts`

**Interfaces:**

- Consumes: Task 1 的 `OperateFacade`、`CompanionFacade`、`TaskUiEvent`、`OperateApplicationPort`、`TaskUiEventSource`、`CompanionApplicationPort`；只 import 这些冻结 ports，不 import Screen、Hook、provider、AsyncStorage 或原生 bridge。
- Produces: `DefaultOperateFacade`、`DefaultCompanionFacade`、`ScopedTaskUiEvents`。

- [ ] **Step 1: Write RED tests for scope, no fallback, and explicit confirmation**

```ts
import {ScopedTaskUiEvents} from '../../../application/events/ScopedTaskUiEvents';
import {DefaultOperateFacade} from '../../../application/facades/OperateFacade';
import {DefaultCompanionFacade} from '../../../application/facades/CompanionFacade';
import type {TaskUiEvent} from '../../../application/facades/UiRuntimeContracts';

describe('application task facades', () => {
  it('delivers only matching session events with increasing sequence', () => {
    let emit: (event: TaskUiEvent) => void = () => undefined;
    const source = {subscribe: jest.fn(listener => { emit = listener; return jest.fn(); })};
    const events = new ScopedTaskUiEvents(source);
    const listener = jest.fn();
    events.subscribe('task-a', 3, listener);

    emit({type: 'started', taskId: 'task-b', sessionRevision: 3, sequence: 1, occurredAtMs: 1, maxSteps: 9});
    emit({type: 'started', taskId: 'task-a', sessionRevision: 2, sequence: 1, occurredAtMs: 1, maxSteps: 9});
    emit({type: 'started', taskId: 'task-a', sessionRevision: 3, sequence: 2, occurredAtMs: 2, maxSteps: 9});
    emit({type: 'step_started', taskId: 'task-a', sessionRevision: 3, sequence: 2, occurredAtMs: 3, step: 1, maxSteps: 9});

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].sequence).toBe(2);
  });

  it('returns a blocked operate result without opening a second execution path', async () => {
    const port = {
      getCurrent: jest.fn(),
      start: jest.fn().mockResolvedValue({kind: 'blocked', blocker: {code: 'visual_agent_not_ready', message: 'Active tool profile 未就绪'}}),
      cancel: jest.fn(),
    };
    const facade = new DefaultOperateFacade(port, {subscribe: jest.fn()});
    await expect(facade.start('打开设置')).resolves.toEqual({
      kind: 'blocked',
      blocker: {code: 'visual_agent_not_ready', message: 'Active tool profile 未就绪'},
    });
    expect(port.start).toHaveBeenCalledTimes(1);
  });

  it('does not persist a companion proposal before confirmProposal', async () => {
    const port = {
      getState: jest.fn(),
      submitTranscript: jest.fn().mockResolvedValue({
        id: 'turn-1', transcript: '以后少糖', reply: '要记住吗', intent: 'preference',
        proposal: {kind: 'preference', title: '少糖'},
      }),
      confirmProposal: jest.fn(),
      dismissTurn: jest.fn(),
    };
    const facade = new DefaultCompanionFacade(port);
    await facade.submitTranscript('以后少糖');
    expect(port.confirmProposal).not.toHaveBeenCalled();
    await facade.confirmProposal('turn-1');
    expect(port.confirmProposal).toHaveBeenCalledWith('turn-1');
  });
});
```

- [ ] **Step 2: Run RED**

```bash
cd AwesomeProject
npx jest src/__tests__/application/facades/OperateAndCompanionFacade.test.ts --runInBand
```

Expected: FAIL with the three missing production modules.

- [ ] **Step 3: Implement the thin facades and sequence filter**

`ScopedTaskUiEvents` 的核心必须精确为：

```ts
export class ScopedTaskUiEvents {
  constructor(private readonly source: TaskUiEventSource) {}

  subscribe(
    taskId: string,
    sessionRevision: number,
    listener: (event: TaskUiEvent) => void,
  ): Unsubscribe {
    let lastSequence = -1;
    return this.source.subscribe(event => {
      if (event.taskId !== taskId || event.sessionRevision !== sessionRevision) return;
      if (!Number.isInteger(event.sequence) || event.sequence <= lastSequence) return;
      lastSequence = event.sequence;
      listener(event);
    });
  }
}
```

`DefaultOperateFacade` 只 trim instruction、拒绝空输入、委托一次 `port.start()`、按 exact task/session 订阅，并把 `cancel(taskId)` 原样委托；它不 catch blocked 后启动别的 runner。`DefaultCompanionFacade` 只委托四个文本用例，proposal 返回时不自动确认。

- [ ] **Step 4: Verify green and ownership**

```bash
cd AwesomeProject
npx jest src/__tests__/application/facades/OperateAndCompanionFacade.test.ts --runInBand
npx tsc --noEmit --pretty false
git diff --name-only codex/checkpoint-v1-wave2...HEAD
```

Expected: Jest/TypeScript PASS；diff 只有 Task 2 的三个 production 文件和一个 test 文件。

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/application/events/ScopedTaskUiEvents.ts \
  AwesomeProject/src/application/facades/OperateFacade.ts \
  AwesomeProject/src/application/facades/CompanionFacade.ts \
  AwesomeProject/src/__tests__/application/facades/OperateAndCompanionFacade.test.ts
git commit -m "feat: add scoped operate and companion facades"
```

---

### Task 3: Phone Operate, Visual Agent Tools, Model Config, and Privacy Facades

**Mode:** Wave 1 worker B；可与 Task 2、Task 4 并行；只新增列出的文件。

**Files:**

- Create: `AwesomeProject/src/application/facades/PhoneOperateFacade.ts`
- Create: `AwesomeProject/src/application/facades/VisualAgentToolsFacade.ts`
- Create: `AwesomeProject/src/application/facades/ModelConfigFacade.ts`
- Create: `AwesomeProject/src/application/facades/PrivacyFacade.ts`
- Test: `AwesomeProject/src/__tests__/application/facades/CapabilityFacades.test.ts`

**Interfaces:**

- Consumes: Task 1 已冻结的 `PhoneOperateApplicationPort`、`VisualAgentToolsApplicationPort`、`ModelConfigApplicationPort`、`PrivacyApplicationPort`，不得在 worker 文件中复制或扩展签名。
- Produces: four default facades；所有 readiness/catalog status 在 Screen 以下计算，profile/config mutation 使用 expected revision；OpenClaw 不再拥有专用 Facade。

- [ ] **Step 1: Write RED tests for fail-closed activation and real status**

```ts
import {DefaultPhoneOperateFacade} from '../../../application/facades/PhoneOperateFacade';
import {DefaultVisualAgentToolsFacade} from '../../../application/facades/VisualAgentToolsFacade';
import {DefaultModelConfigFacade} from '../../../application/facades/ModelConfigFacade';
import type {ModelCatalogViewState} from '../../../application/facades/UiRuntimeContracts';

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(next => { resolve = next; });
  return {promise, resolve};
};

describe('capability facades', () => {
  it('refuses activation when the selected mode is not runnable', async () => {
    const state = {
      status: 'ready' as const,
      revision: 4,
      activeMode: 'cloud_direct' as const,
      draftMode: 'local_vision_cloud_planner' as const,
      adbFallbackEnabled: false,
      modes: {
        cloud_direct: {id: 'cloud_direct' as const, label: '云端一体', nodes: [], caption: '', runnable: true, blockers: []},
        cloud_split: {id: 'cloud_split' as const, label: '双云端', nodes: [], caption: '', runnable: true, blockers: []},
        local_vision_cloud_planner: {
          id: 'local_vision_cloud_planner' as const,
          label: '本地视觉', nodes: [], caption: '', runnable: false,
          blockers: [{code: 'local_model_not_ready' as const, message: '本地视觉模型未就绪'}],
        },
      },
    };
    const port = {read: jest.fn().mockResolvedValue(state), setDraft: jest.fn(), activate: jest.fn(), setAdbFallback: jest.fn()};
    const facade = new DefaultPhoneOperateFacade(port);
    await expect(facade.activateDraftMode(4)).rejects.toThrow('local_model_not_ready');
    expect(port.activate).not.toHaveBeenCalled();
  });

  it('blocks a profile that lacks either mandatory capability', async () => {
    const state = {
      status: 'ready' as const, revision: 8, enabled: true, activeProfileId: 'p-1',
      adapters: [{toolId: 'cursor' as const, builtIn: true, label: 'Cursor', readiness: 'ready' as const, maturity: 'beta' as const, capabilities: {imageInput: true, structuredAction: true, stream: true, approval: true, cancel: true, steer: false, resume: true, preferences: false}, configuredProfileCount: 1}],
      profiles: [{
        profileId: 'p-1', toolId: 'cursor' as const,
        displayName: 'Cursor', enabled: true, endpointLabel: 'local', readiness: 'ready' as const,
        maturity: 'beta' as const,
        requestedCapabilities: {imageInput: true, structuredAction: true, stream: true, approval: true, cancel: true, steer: true, resume: true, preferences: true},
        capabilities: {imageInput: true, structuredAction: false, stream: true, approval: true, cancel: true, steer: false, resume: false, preferences: false},
        runnable: false,
        blockers: [{code: 'visual_agent_capability_missing' as const, message: '缺少 structured_action'}],
      }],
      canOperate: false,
      blocker: {code: 'visual_agent_capability_missing' as const, message: '缺少 structured_action'},
    };
    const facade = new DefaultVisualAgentToolsFacade({read: jest.fn().mockResolvedValue(state)} as never);
    await expect(facade.getViewState()).resolves.toEqual(state);
  });

  it('saves a Connector Bridge profile through an explicit one-shot credential intent', async () => {
    const next = {
      status: 'ready' as const, revision: 9, enabled: true,
      adapters: [], profiles: [], canOperate: false,
    };
    const port = {saveProfile: jest.fn().mockResolvedValue(next)};
    const facade = new DefaultVisualAgentToolsFacade(port as never);
    const input = {
      toolId: 'codex' as const,
      enabled: true,
      bridgeUrl: 'https://bridge.example',
      bindingId: 'codex-main',
      credential: {action: 'replace' as const, plaintext: 'sentinel-bridge-secret'},
      requestedCapabilities: {imageInput: true, structuredAction: true, stream: true, approval: true, cancel: true, steer: true, resume: true, preferences: true},
    };
    const result = await facade.saveProfile(input, 8);
    expect(port.saveProfile).toHaveBeenCalledWith(input, 8);
    expect(JSON.stringify(result)).not.toContain('sentinel-bridge-secret');
  });

  it('marks a superseded model catalog response stale and never exposes replacement plaintext', async () => {
    const pending = deferred<ModelCatalogViewState>();
    const port = {
      read: jest.fn().mockResolvedValue({status: 'ready', credential: {state: 'ready'}}),
      fetchCatalog: jest.fn()
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce({requestGeneration: 2, status: 'ready', models: [{id: 'gpt-5', label: 'gpt-5'}]}),
      save: jest.fn(),
    };
    const facade = new DefaultModelConfigFacade(port as never);
    const first = facade.refreshCatalog({list: 'unified', requestGeneration: 1, mode: 'preset', presetId: 'openai', credential: {action: 'replace', plaintext: 'sentinel-secret'}});
    await expect(facade.refreshCatalog({list: 'unified', requestGeneration: 2, mode: 'preset', presetId: 'openai', credential: {action: 'keep'}})).resolves.toMatchObject({requestGeneration: 2, status: 'ready'});
    pending.resolve({requestGeneration: 1, status: 'ready', models: [{id: 'old', label: 'old'}]});
    await expect(first).resolves.toMatchObject({requestGeneration: 1, status: 'stale', models: []});
    expect(JSON.stringify(await facade.getViewState({list: 'unified'}))).not.toContain('sentinel-secret');
  });
});
```

- [ ] **Step 2: Run RED**

```bash
cd AwesomeProject
npx jest src/__tests__/application/facades/CapabilityFacades.test.ts --runInBand
```

Expected: FAIL with missing Facade modules.

- [ ] **Step 3: Implement exact delegation and guard rules**

`DefaultPhoneOperateFacade.activateDraftMode(expectedRevision)` 必须先 `read()`：revision 不同抛 `config_revision_conflict`；draft option `runnable === false` 时抛第一个 blocker code；仅 runnable 时调用 `port.activate(draftMode, expectedRevision)`。

`DefaultVisualAgentToolsFacade` 必须允许保存多个 profile，并只用 `profileId + expectedRevision` 切 active；`adapters` 无论是否已有 profile都至少包含五个 built-ins，并追加已经同一 conformance gate 注册的 `custom:<name>`。adapter option 的 identity、maturity 与八项 `capabilities` 只来自 `VisualAgentToolRegistry` manifest maximum，readiness/configured count 来自 status projection，绝不把 handshake 子集写回 adapter option；`profiles` 只含用户保存的实例，并分别投影 runtime-stored `enabled/requestedCapabilities` 与该 profile handshake 的 negotiated `capabilities`，不得用协商结果覆盖用户请求值。`displayName` 由 registry label + safe binding ID 投影，`endpointLabel` 只显示已验证 Bridge URL 的 origin/host，不含 path/query/userinfo。active profile 不是 `ready`，或 profile negotiated `imageInput/structuredAction` 任一为 false 时 `canOperate=false`；approval/cancel/steer/resume/preferences 只控制对应动作，任何 disconnected/error 都是 `visual_agent_not_ready` 且 zero fallback。

`DefaultVisualAgentToolsFacade.saveProfile` 只接受 `VisualAgentProfileDraftInput`：create 必须省略 `profileId`，edit 必须带 canonical `profileId`，两者都提交 Bridge URL、Bridge-owned binding ID、八项 requested capability 与 `keep|replace|remove` credential intent。Facade/Application Port 把它一对一映射到 capability `VisualAgentProfileController.save`；edit 初始为 `keep` 且密钥输入为空，`replace.plaintext` 只在一次调用栈内存在，任何成功/失败返回值、日志或 ViewState 都不得包含明文。Create 只允许 replace（创建 Bridge secret）或 remove（明确创建 null-ref/no-auth profile），keep/空 replace/stale revision 必须 fail closed；edit 在旧 ref 已为 null 时仍可 keep null、replace 为新 ref，remove 则是无 retirement record 的幂等 null mutation。`setEnabled`、`saveProfile`、`deleteProfile`、`setActiveProfile` 都必须携带当前 ViewState revision，revision 冲突统一刷新后由用户重试，禁止 last-write-wins。

`DefaultModelConfigFacade` 维护每个 `{list, bindingId}` 最新 `requestGeneration`：完成时若不是最新请求，强制返回 `{status:'stale', models:[]}`，不得让旧 provider/credential 响应覆盖新选择。目录保持 `loading | ready | unsupported | auth_failed | network_failed | empty | stale` 原因差异；save 顶层只接受 `preset | custom`，model ID 始终非空且可来自手输。`selectBinding/deleteBinding` 用 canonical binding ID + expected revision，返回刷新后的 list ViewState。credential 只接受 keep/replace/remove command intent，replace 明文绝不写入 `ModelConfigViewState`。`DefaultPrivacyFacade` 不生成静态说明；`setMemoryLocation('visual_agent')` 在 `canUseVisualAgentMemory === false` 时抛 `visual_agent_not_ready`。

- [ ] **Step 4: Verify green and no storage/provider imports**

```bash
cd AwesomeProject
npx jest src/__tests__/application/facades/CapabilityFacades.test.ts --runInBand
npx tsc --noEmit --pretty false
if rg -n "AsyncStorage|ModelService|NonoConfigService|providers/|react-native" src/application/facades/PhoneOperateFacade.ts src/application/facades/VisualAgentToolsFacade.ts src/application/facades/ModelConfigFacade.ts src/application/facades/PrivacyFacade.ts; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: Jest/TypeScript PASS；`rg` 无输出。

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/application/facades/PhoneOperateFacade.ts \
  AwesomeProject/src/application/facades/VisualAgentToolsFacade.ts \
  AwesomeProject/src/application/facades/ModelConfigFacade.ts \
  AwesomeProject/src/application/facades/PrivacyFacade.ts \
  AwesomeProject/src/__tests__/application/facades/CapabilityFacades.test.ts
git commit -m "feat: expose tool and model configuration view states"
```

---

### Task 4: Errand and Activity Facades

**Mode:** Wave 1 worker C；可与 Task 2、Task 3 并行；只新增列出的文件。

**Files:**

- Create: `AwesomeProject/src/application/facades/ErrandFacade.ts`
- Create: `AwesomeProject/src/application/facades/ActivityFacade.ts`
- Test: `AwesomeProject/src/__tests__/application/facades/ErrandActivityFacades.test.ts`

**Interfaces:**

- Consumes: Task 1 已冻结的 `ErrandApplicationPort`、`ActivityApplicationPort`；这些 ports 已把 PreferenceRepository、ErrandRepository、TaskRepository 分离。
- Produces: `DefaultErrandFacade`、`DefaultActivityFacade`；禁止重新创建 `MemoryItem[]` compatibility store。

- [ ] **Step 1: Write RED tests for repository separation and refresh-after-command**

```ts
import {DefaultErrandFacade} from '../../../application/facades/ErrandFacade';
import {DefaultActivityFacade} from '../../../application/facades/ActivityFacade';

describe('errand and activity facades', () => {
  it('creates only after an explicit errand proposal is confirmed by the caller', async () => {
    const port = {read: jest.fn(), setEnabled: jest.fn(), create: jest.fn().mockResolvedValue('errand-1'), update: jest.fn(), cancel: jest.fn()};
    const facade = new DefaultErrandFacade(port);
    await expect(facade.createFromProposal({kind: 'errand', title: '交周报', errandType: 'schedule', when: '周五 18:00'})).resolves.toBe('errand-1');
    expect(port.create).toHaveBeenCalledTimes(1);
  });

  it('reloads the three-source activity projection after forgetting a preference', async () => {
    const state = {status: 'ready' as const, memoryEnabled: true, memoryLocationLabel: '仅这台手机', preferences: [], errands: [], tasks: []};
    const port = {read: jest.fn().mockResolvedValue(state), forgetPreference: jest.fn().mockResolvedValue(state), deleteTask: jest.fn()};
    const facade = new DefaultActivityFacade(port);
    await expect(facade.forgetPreference('pref-1')).resolves.toEqual(state);
    expect(port.forgetPreference).toHaveBeenCalledWith('pref-1');
  });
});
```

- [ ] **Step 2: Run RED**

```bash
cd AwesomeProject
npx jest src/__tests__/application/facades/ErrandActivityFacades.test.ts --runInBand
```

Expected: FAIL with missing production modules.

- [ ] **Step 3: Implement thin validation/delegation**

`createFromProposal` 必须拒绝空 title；schedule 必须有非空 `when`；once 把 `when` 归一为 absent。`update` 只接受 `pending` 或 `failed` 项，leased/terminal 返回固定 `errand_not_editable`。`ActivityFacade` 只委托聚合 port，不按 modelId 隐式过滤任务。

- [ ] **Step 4: Verify green and ownership**

```bash
cd AwesomeProject
npx jest src/__tests__/application/facades/ErrandActivityFacades.test.ts --runInBand
npx tsc --noEmit --pretty false
if rg -n "MemoryItem|NonoConfigService|AsyncStorage|react-native" src/application/facades/ErrandFacade.ts src/application/facades/ActivityFacade.ts; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: Jest/TypeScript PASS；`rg` 无输出。

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/application/facades/ErrandFacade.ts \
  AwesomeProject/src/application/facades/ActivityFacade.ts \
  AwesomeProject/src/__tests__/application/facades/ErrandActivityFacades.test.ts
git commit -m "feat: project errands and activity through facades"
```

---

### Task 5: Integrate Wave 1 Commits and Add the Facade Composition Root

**Mode:** Wave 1 integration；集成 Agent 串行。

**Files:**

- Create: `AwesomeProject/src/application/facades/AppFacadesContext.tsx`
- Create: `AwesomeProject/src/application/facades/createAppFacades.ts`
- Modify: `AwesomeProject/App.tsx`
- Modify: `AwesomeProject/jest.setup.js`
- Test: `AwesomeProject/src/__tests__/application/facades/AppFacadesContext.test.tsx`

**Interfaces:**

- Consumes: Task 2-Task 4 commits；runtime checkpoint 中的 `OperateRuntime`、`OperateTaskRunner`、`CompanionPipeline`、`PreferenceRepository`、`ErrandRepository`、`VisualAgentToolRegistry`、`ModelProviderRegistry`、`ProviderModelCatalogPort`、`ModelEndpointProfileRepository`、`CredentialStore`、`RuntimeConfigRepository`、`TaskRepository`、`sanitizeLog`。既有 `ModelService` 保持只读且不进入新 composition；既有 `ModelListService` 在 Task 6 收窄后接到 catalog port。
- Produces: `createAppFacades(ports): AppFacades`、`projectVisualAgentToolOptions(registry,statusByTool)`、`AppFacadesProvider`、`useAppFacades()`、唯一 production `appFacades`。
- Composition 适配是唯一允许知道 core/repository 具体类的 application 文件；Screen 不得 import 这些 core 类型。

```ts
export function projectVisualAgentToolOptions(
  registry: VisualAgentToolRegistry,
  statusByTool: ReadonlyMap<VisualAgentToolId, Readonly<{
    readiness: VisualAgentReadiness;
    configuredProfileCount: number;
  }>>,
): readonly VisualAgentToolOptionViewState[];
```

缺省 status 固定为 `{readiness:'not_configured', configuredProfileCount:0}`；返回顺序必须与 registry 一致，且该函数只投影 canonical manifest，不做 handshake、配置或网络读取。

- [ ] **Step 1: Cherry-pick the three Wave 1 commits in dependency-neutral order**

Run from `.worktrees/v1-ui-integration`，先用各 worker 报告中的 commit SHA 检查文件域，再 cherry-pick：

```bash
git diff --stat codex/checkpoint-v1-wave2..codex/v1-w3-ui-operate-companion
git diff --stat codex/checkpoint-v1-wave2..codex/v1-w3-ui-capability
git diff --stat codex/checkpoint-v1-wave2..codex/v1-w3-ui-errand-activity
git cherry-pick codex/checkpoint-v1-wave2..codex/v1-w3-ui-operate-companion
git cherry-pick codex/checkpoint-v1-wave2..codex/v1-w3-ui-capability
git cherry-pick codex/checkpoint-v1-wave2..codex/v1-w3-ui-errand-activity
```

Expected: 每个 branch range 只含其 Task 列出的新文件；cherry-pick 无冲突。出现热点文件或冲突时 `git cherry-pick --abort`，让原 worker 基于 `codex/checkpoint-v1-wave2` 重放，禁止在集成分支拼接实现。

- [ ] **Step 2: Write the failing injectable-context test**

```tsx
import React from 'react';
import {Text} from 'react-native';
import {render} from '@testing-library/react-native';
import {
  AppFacadesProvider,
  useAppFacades,
} from '../../../application/facades/AppFacadesContext';
import {projectVisualAgentToolOptions} from '../../../application/facades/createAppFacades';
import {createBuiltInVisualAgentToolRegistry} from '../../../connectorBridge/visualAgent/BuiltInVisualAgentToolRegistry';
import type {AppFacades} from '../../../application/facades/UiRuntimeContracts';

const Probe = () => {
  const facades = useAppFacades();
  return <Text>{facades.visualAgentTools && facades.modelConfig ? 'injected' : 'missing'}</Text>;
};

describe('AppFacadesContext', () => {
  it('uses the test-owned facade graph', () => {
    const fake = {visualAgentTools: {}, modelConfig: {}} as AppFacades;
    expect(render(<AppFacadesProvider value={fake}><Probe /></AppFacadesProvider>).getByText('injected')).toBeTruthy();
  });

  it('fails loudly outside the provider', () => {
    expect(() => render(<Probe />)).toThrow('AppFacadesProvider is missing');
  });

  it('projects the exact canonical built-in manifests without widening capabilities', () => {
    const registry = createBuiltInVisualAgentToolRegistry();
    const options = projectVisualAgentToolOptions(registry, new Map());
    expect(options.map(({toolId, builtIn, maturity, capabilities}) => ({toolId, builtIn, maturity, capabilities}))).toEqual([
      {toolId: 'openclaw', builtIn: true, maturity: 'stable', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: true}},
      {toolId: 'codex', builtIn: true, maturity: 'beta', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: false}},
      {toolId: 'cursor', builtIn: true, maturity: 'beta', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: false, preferences: false}},
      {toolId: 'dsh', builtIn: true, maturity: 'experimental', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: false, resume: false, steer: false, preferences: false}},
      {toolId: 'hermes', builtIn: true, maturity: 'beta', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: false}},
    ]);
  });
});
```

- [ ] **Step 3: Run RED**

```bash
cd AwesomeProject
npx jest src/__tests__/application/facades/AppFacadesContext.test.tsx --runInBand
```

Expected: FAIL because `AppFacadesContext` does not exist.

- [ ] **Step 4: Implement context and composition without hidden fallback**

`AppFacadesContext.tsx` 必须用 `createContext<AppFacades | null>(null)`；`useAppFacades()` 遇到 null 直接 throw。`createAppFacades.ts` 必须通过显式 ports 构造 Task 2-Task 4 的 default facades；不得在 Facade 内调用 service locator。`App.tsx` 在 `SafeAreaProvider` 内、`AppNavigator` 外包一层：

```tsx
<AppFacadesProvider value={appFacades}>
  <AppNavigator />
</AppFacadesProvider>
```

production adapters 必须满足：

```ts
const start = async (instruction: string): Promise<StartOperateResult> => {
  const task = await taskRepository.createRunning(instruction);
  const sessionResult = await operateRuntime.createSession(task.id);
  if (sessionResult.kind === 'blocked') {
    await taskRepository.markBlocked(task.id, sessionResult.blocker.code);
    return sessionResult;
  }
  await foregroundRunner.start({
    taskId: task.id,
    sessionRevision: sessionResult.session.sessionRevision,
  });
  return {
    kind: 'started',
    taskId: task.id,
    sessionRevision: sessionResult.session.sessionRevision,
  };
};
```

`start` 不捕获后台启动失败后调用第二个 runner；启动失败写同一 task/session 的 failed 终态并返回/抛固定安全错误。

视觉工具 adapter 必须从 `RuntimeConfigRepository` 的 `VisualAgentProfileV1[] + activeProfileId` 投影多个 profile；纯函数 `projectVisualAgentToolOptions` 枚举 `VisualAgentToolRegistry.list()` 并解析每个已注册 adapter 的 exact identity/manifest，`capabilities` 只能逐字段复制 `manifest.declaredCapabilities`，`maturity` 只能复制 manifest，且以 `builtIn = !toolId.startsWith('custom:')` 区分五个内置项和通过相同 conformance 注册的 `custom:<name>`；禁止 UI 默认值或全 true 扩宽。再通过其 execution/handshake status 投影 readiness 与 profile negotiated `VisualAgentCapabilitySet`，后者可以是 manifest 的严格子集。未注册或未通过 conformance 的 custom 工具不显示为可选项。OpenClaw 只通过 tool preset 注册，不建立第二套 client 分支。`OperateRuntime.createSession` 在 start 时把 config revision、active profileId、toolId 和 canonical capability set 复制到 session snapshot，之后 composition 不再读取 active profile；profile 删除/切换/编辑都不得改变运行中 task。

模型配置 adapter 直接建立 `ModelConfigApplicationPort` 到 `ModelProviderRegistry`、`ProviderModelCatalogPort`、`ModelEndpointProfileRepository` 与 `CredentialStore` 的窄接缝；Task 6 再把既有 selectors / `ModelListService` 接到这条缝。读取只返回 masked credential state；replace plaintext 立即交给 `CredentialStore` 后清除；remove 只把 profile ref 改为 null 并提交 runtime-owned retirement record；keep 不读取 secret 回 UI。旧 ref 不在 UI/config mutation 中直接删除，由 Runtime Task 6 cold-start GC 在确认 active/draft config 与非终态 sessions 均无引用后删除。catalog typed result 不得被 composition 抹平成 empty，ModelScope 是 registry 中的 compatibility presentation。Screen 永远不直接 import `ModelService`。

在 `jest.setup.js` 仅增加当前 production composition 所需 NativeModule 空 mock；mock 中不得放真实 secret、任务数据或默认成功响应。

- [ ] **Step 5: Run the Wave 1 integration gate**

```bash
cd AwesomeProject
npx jest src/__tests__/application --runInBand
npx tsc --noEmit --pretty false
npx prettier --check src/application App.tsx jest.setup.js
if rg -n "apiKey|Authorization|data:image|modelResponse|screenshotUri" src/application; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: tests/TypeScript/Prettier PASS；privacy `rg` 无输出。

- [ ] **Step 6: Commit the composition root**

```bash
git add AwesomeProject/src/application/facades/AppFacadesContext.tsx \
  AwesomeProject/src/application/facades/createAppFacades.ts \
  AwesomeProject/App.tsx \
  AwesomeProject/jest.setup.js \
  AwesomeProject/src/__tests__/application/facades/AppFacadesContext.test.tsx
git commit -m "feat: compose injectable V1 application facades"
```

把该 commit 的完整 SHA 写入 Wave 3 evidence 作为 `UI Facade checkpoint`。从此步骤开始停止所有编码 worker；共享热点按 Task 6-Task 10 严格串行。

---

### Task 6: Wire Model Configuration, Fix Navigation Typing, and Render Phone Operate Readiness

**Mode:** Wave 2；集成 Agent 串行。

**Files:**

- Modify: `AwesomeProject/src/shared/types/navigation.ts`
- Modify: `AwesomeProject/src/navigation/AppNavigator.tsx`
- Modify: `AwesomeProject/src/features/task/screens/HomeScreen.tsx`
- Modify: `AwesomeProject/src/features/capability/screens/PhoneOperateScreen.tsx`
- Modify: `AwesomeProject/src/features/model/screens/AddModelScreen.tsx`
- Modify: `AwesomeProject/src/features/model/screens/EditModelScreen.tsx`
- Modify: `AwesomeProject/src/features/model/screens/ModelListScreen.tsx`
- Modify: `AwesomeProject/src/features/model/components/ApiProviderSelector.tsx`
- Modify: `AwesomeProject/src/features/model/components/ModelNameSelector.tsx`
- Modify: `AwesomeProject/src/features/model/components/ModelListPanel.tsx`
- Modify: `AwesomeProject/src/features/model/components/ModelItem.tsx`
- Modify: `AwesomeProject/src/features/settings/screens/APIKeyGuideScreen.tsx`
- Modify: `AwesomeProject/src/features/model/services/ModelListService.ts`
- Modify: `AwesomeProject/src/shared/constants/apiProviders.ts`
- Modify: `AwesomeProject/src/application/facades/createAppFacades.ts`
- Test: `AwesomeProject/src/__tests__/navigation/AppNavigatorTyping.test.tsx`
- Test: `AwesomeProject/src/__tests__/features/capability/PhoneOperateViewState.test.tsx`
- Test: `AwesomeProject/src/__tests__/features/model/ModelConfigViewState.test.tsx`
- Test: `AwesomeProject/src/__tests__/features/model/ModelCatalogRace.test.ts`

**Interfaces:**

- Consumes: `RootStackParamList.MainTabs: NavigatorScreenParams<MainTabParamList>`、`useAppFacades().phoneOperate`、`useAppFacades().modelConfig`，以及 Task 1 已冻结、由 Task 3 实现的 provider/catalog/credential contracts。
- Produces: type-safe nested navigation；PhoneOperate Screen 不再 import `NonoConfigService`；Add/Edit/Guide/List/ModelListPanel/ModelItem 不再硬编码另一套 provider identity 或直接调用 `ModelService`/`ModelListService`，而是通过 Facade/runtime registry 驱动 selectors、credential guide presentation 与 role-scoped binding list。

UI compatibility key 只在 `ModelConfigApplicationPort` 边界按下表映射一次；repository、binding 和 session 一律使用 canonical runtime `ModelRole`：

| `ModelListKey` | `ModelRole` |
| --- | --- |
| `unified` | `direct` |
| `splitVision` | `vision` |
| `splitPlanner` | `split_planner` |
| `localPlanner` | `local_planner` |
| `companion` | `companion` |

- [ ] **Step 1: Write RED tests for nested navigation and blocked activation**

```tsx
import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {PhoneOperateScreen} from '../../../features/capability/screens/PhoneOperateScreen';
import {AppFacadesProvider} from '../../../application/facades/AppFacadesContext';
import type {AppFacades, PhoneOperateViewState} from '../../../application/facades/UiRuntimeContracts';

const state: PhoneOperateViewState = {
  status: 'ready', revision: 12, activeMode: 'cloud_direct',
  draftMode: 'local_vision_cloud_planner', adbFallbackEnabled: false,
  modes: {
    cloud_direct: {id: 'cloud_direct', label: '云端一体', nodes: ['截图', '云端一体', '动作'], caption: '可运行', runnable: true, blockers: []},
    cloud_split: {id: 'cloud_split', label: '双云端', nodes: ['截图', '云端视觉', '云端编排', '动作'], caption: '可运行', runnable: true, blockers: []},
    local_vision_cloud_planner: {id: 'local_vision_cloud_planner', label: '本地视觉', nodes: ['截图', '本地视觉', '云端编排', '动作'], caption: '截图不离机', runnable: false, blockers: [{code: 'local_model_not_ready', message: '本地视觉模型未就绪'}]},
  },
};

describe('PhoneOperateScreen', () => {
  it('shows the real blocker and never calls activate for an unrunnable draft', async () => {
    const phoneOperate = {
      getViewState: jest.fn().mockResolvedValue(state),
      selectDraftMode: jest.fn(),
      activateDraftMode: jest.fn(),
      setAdbFallbackEnabled: jest.fn(),
    };
    const facades = {phoneOperate} as unknown as AppFacades;
    const screen = render(<AppFacadesProvider value={facades}><PhoneOperateScreen /></AppFacadesProvider>);
    await waitFor(() => expect(screen.getByText('本地视觉模型未就绪')).toBeTruthy());
    expect(screen.getByTestId('activate-operate-mode').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByTestId('activate-operate-mode'));
    expect(phoneOperate.activateDraftMode).not.toHaveBeenCalled();
  });
});
```

`AppNavigatorTyping.test.tsx` 增加 compile-time helper：

```ts
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../shared/types/navigation';

const openCapabilities = (navigation: NativeStackNavigationProp<RootStackParamList>) =>
  navigation.navigate('MainTabs', {screen: 'Capabilities'});

test('Capabilities is a nested MainTabs route', () => {
  expect(openCapabilities).toBeDefined();
});
```

`ModelConfigViewState.test.tsx` 用 injected `modelConfig` 同时渲染 Add/Edit/APIKeyGuide/List/ModelListPanel，断言顶层只出现“热门厂商 / 完全自定义”；preset 顺序精确为 OpenAI、Anthropic、Gemini、DeepSeek、xAI、百炼 Qwen、智谱、Kimi、MiniMax、火山 Doubao、ModelScope（兼容），Guide 使用同一组 canonical preset IDs；未知/custom 显示通用安全指引，不静默空白。Custom 表单必须逐项 round-trip `customProviderLabel/baseUrl/protocol/auth/chatPath/modelListPath/declaredCapabilities`，能力声明显示“用户声明、未验证”，协议切换不能丢掉字段；header/query auth 只保存 header/query 名和 prefix，不进入 ViewState 的 credential 明文。Edit 初始 credential intent 为 keep，secret 输入为空且无任何回填；点击更换/移除分别提交 replace/remove；目录 `unsupported/auth_failed/network_failed/empty/stale/loading` 均显示不同安全文案，所有状态都保留 `testID="manual-model-id"`；列表选择/删除传 canonical bindingId + expected revision，provider label 来自 ViewState。

`ModelCatalogRace.test.ts` 用两个 deferred 请求模拟先选 OpenAI、立刻切 Anthropic，先完成 Anthropic 再完成 OpenAI；断言 UI 最终只展示 Anthropic 的 requestGeneration/models，旧 OpenAI 结果显示或记录为 stale 且不覆盖。再覆盖完整 custom spec、ModelScope compatibility、每页 cursor/page-token 直到 exhausted，以及 ready/unsupported/auth/network/empty/stale 任一状态下的 manual model ID save。

- [ ] **Step 2: Run RED and capture the V1 TS2769 evidence**

```bash
cd AwesomeProject
npx jest src/__tests__/navigation/AppNavigatorTyping.test.tsx src/__tests__/features/capability/PhoneOperateViewState.test.tsx src/__tests__/features/model/ModelConfigViewState.test.tsx src/__tests__/features/model/ModelCatalogRace.test.ts --runInBand
npx tsc --noEmit --pretty false
```

Expected before implementation: PhoneOperate test FAIL because Screen still reads `NonoConfigService`；model tests FAIL because Add/Edit still render hard-coded chips and selectors are not facade-driven；TypeScript includes the V1 Home error at `navigation.navigate('Capabilities')` / TS2769.

- [ ] **Step 3: Apply the navigation fix at the correct nesting boundary**

在 `HomeScreen.tsx` 把：

```ts
navigation.navigate('Capabilities');
```

改为：

```ts
navigation.navigate('MainTabs', {screen: 'Capabilities'});
```

保留 `RootStackParamList` 与 `MainTabParamList` 分层；禁止给 RootStack 新增假的 `Capabilities` route。`AppNavigator.tsx` 只把现有声明行改为 `const MainTabs: React.FC = () => {`，函数体不变；Stack/Tab generic 继续分别使用两张 param list。

同时给 Root Stack 新增 canonical `VisualAgentTools: {initialPreset?: BuiltInVisualAgentToolId} | undefined`，保留既有 `OpenClaw` route 一版并由 navigation listener 立即 replace 到 `{name:'VisualAgentTools', params:{initialPreset:'openclaw'}}`。`OpenClawScreen` 只作为兼容组件存在，不能成为第二个状态 owner；`AppNavigatorTyping.test.tsx` 同时覆盖 canonical route 和 alias params。

把 `RootStackParamList.EditModel` 精确改为 `{bindingId: string; list?: ModelListKey}`；Add route 的 import compatibility 只能在进入 Facade 前转换为非敏感 draft，navigation params 不得携带 credential。更新全部 navigate/route consumers，禁止继续把 binding ID 和 provider model ID 都命名为 `modelId`。

同一 `AppNavigatorTyping.test.tsx` 还必须覆盖 `APIKeyGuide` 的 canonical `{presetId,mode}` 参数、无参全列表、旧 `zhipu/moonshot` deep-link parser 的一次性 replace，以及任意未知 providerId 不进入 Screen state。

- [ ] **Step 4: Replace PhoneOperate data access with ViewState**

Screen 加载和命令路径必须精确为：

```ts
const {phoneOperate} = useAppFacades();
const [viewState, setViewState] = useState<PhoneOperateViewState | null>(null);

useFocusEffect(useCallback(() => {
  let active = true;
  phoneOperate.getViewState().then(next => active && setViewState(next));
  return () => { active = false; };
}, [phoneOperate]));

const option = viewState.modes[viewState.draftMode];
const activate = async () => {
  if (!option.runnable) return;
  setViewState(await phoneOperate.activateDraftMode(viewState.revision));
};
```

三种模式选择调用 `selectDraftMode(mode)` 并使用返回 state；激活按钮固定 `testID="activate-operate-mode"`，`disabled={!option.runnable}`，`accessibilityState={{disabled: !option.runnable}}`。blockers 逐条显示，不得再展示“当前任务仍走云端一体”的回退文案。

- [ ] **Step 5: Replace hard-coded provider/model fields with the facade-driven selectors**

`ModelProviderRegistry` 是 preset 的唯一事实源。`apiProviders.ts` 删除带 base URL/auth/catalog 的 `API_PROVIDERS` 平行 registry，只允许保留 keyed-by-`ProviderPresetV1` 的展示文案/图标、localized credential guide 与 HTTPS host allowlist；`custom` 不是 preset entry。`ApiProviderSelector` 改为纯 controlled component，presets 由 `ModelConfigViewState.presets` 注入；顶层 discriminant 精确为 `preset | custom`，不得再暴露 `select | custom` 或 provider chips；custom 模式渲染并编辑完整 `CustomProviderConfigViewState`：provider label、base URL、protocol、auth kind/header/query metadata、chat path、nullable model-list path、input/output modalities 及 chat/vision/toolCalls/reasoning declarations。两种模式都不持有 credential；自定义能力必须显式标记为用户声明未验证。

`ModelListService` 不再自己 switch provider 或直接 fetch；改为 UI-only narrow mapper，输入 `ProviderModelCatalogResult + requestGeneration`，输出 `ModelCatalogViewState`。认证错误映射 `auth_failed`、网络失败映射 `network_failed`、无目录 API 映射 `unsupported`、成功零项映射 `empty`、成功有项映射 `ready`，runtime `ready.stale === true` 映射 UI `stale`。`createAppFacades.ts` 的 `ModelConfigApplicationPort.fetchCatalog` 从 discriminated `ModelCatalogRefreshInput` 构造完整 preset/custom profile，用 `ModelProviderRegistry.resolveCatalog(profile): ProviderModelCatalogPort` 发起请求，再调用该 mapper；custom input 的 protocol/auth/path/capability 字段不得以默认 OpenAI 配置补齐。禁止由 UI 假设所有厂商都是 OpenAI-compatible，也不得用 `default: []` 隐藏未知厂商。这是现有 `ModelListService` 被接通的唯一位置，`ModelNameSelector` 不直接 import 它。

`ModelNameSelector` 改为纯 controlled component：输入 `catalog`、`modelId`、`onModelIdChange`、`onRefresh`，标题固定“当前凭证可用模型”；不 import/call `ModelListService`，不接收 credential 明文。catalog 任一状态均展示 `testID="manual-model-id"` 的手输输入框，选择目录项只是填入同一 model ID。

`AddModelScreen` / `EditModelScreen` 只通过 `modelConfig` load/refresh/save，并使用 frozen `ModelConfigSaveInput` / `ModelCatalogRefreshInput`，使 preset/custom 的必填字段在类型层互斥。provider/mode/credential/custom protocol/auth/path/capability 变化都分配单调 `requestGeneration`；effect cleanup 与 Facade stale result 双重防护。Add 初始 credential 为 replace 空输入；Edit 初始为 keep 且输入框空，用户显式选择 replace 才显示空密码框，remove 需二次确认。保存后立即清空局部 plaintext；ViewState、navigation params、error 文案、console/log 都不得包含它。删除原 `[openai,zhipu,modelscope,huggingface,custom]` chips 与 provider inference。

把 `RootStackParamList.APIKeyGuide` 精确改为 `{presetId?: ProviderPresetV1; mode?: 'preset' | 'custom'} | undefined`，直接 type-import canonical runtime contract，不得复制 provider union；Screen 不得继续使用 `zhipu/moonshot` 等非 canonical alias。旧 deep link 的 `providerId=zhipu|moonshot` 只在 navigation compatibility parser 中一次性映射为 `zhipu_glm|moonshot_kimi` 后 replace canonical route；Screen/state/telemetry 只见 canonical ID。`APIKeyGuideScreen` 通过 `useAppFacades().modelConfig.getViewState({list:'unified'}).presets` 决定顺序/存在性，再从 `apiProviders.ts` 的 `Record<ProviderPresetV1, LocalizedCredentialGuide>` 读取本地化步骤和官方控制台链接；该 record 必须 exhaustive 覆盖 11 个 preset，不能包含 base URL、auth header 或模型目录元数据。`mode:'custom'` 只显示“请从你的服务提供方获取凭据”的通用说明，任何 compatibility parser 未知值显示固定 unsupported 文案，不猜测 URL。打开外链前只允许 HTTPS 且 hostname 与该 preset guide allowlist 精确匹配；错误日志只记录固定 reason code。

`ModelListScreen` / `ModelListPanel` 用 `getListViewState(list)` 加载，并以 ViewState 中的 bindingId + revision 调 `selectBinding/deleteBinding`；`EditModel` route param 从含混的 `modelId` 改为 `bindingId`。`ModelItem` prop 改为 `ModelConfigListItemViewState`，providerLabel/modelId 全由 Facade 投影，删除 OpenAI/智谱/ModelScope/HuggingFace 的硬编码映射。四个文件不得 import `AIModel` 或 `modelService`；legacy `ModelService` / `shared/types/Model.ts` 只留给 runtime migration/未迁移兼容边界。

- [ ] **Step 6: Verify GREEN**

```bash
cd AwesomeProject
npx jest src/__tests__/navigation/AppNavigatorTyping.test.tsx src/__tests__/features/capability/PhoneOperateViewState.test.tsx src/__tests__/features/capability/PhoneOperatePermission.test.ts src/__tests__/features/model/ModelConfigViewState.test.tsx src/__tests__/features/model/ModelCatalogRace.test.ts --runInBand
npx tsc --noEmit --pretty false
if rg -n "NonoConfigService|nonoConfigService|当前任务仍走云端一体|navigation\.navigate\('Capabilities'" src/features/capability/screens/PhoneOperateScreen.tsx src/features/task/screens/HomeScreen.tsx; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
if rg -n "providerRow|providerChip|huggingface|\['openai'.*'zhipu'|fetchModelList|modelService|AIModel|apiKey|ModelProviderRegistry" src/features/model/screens src/features/model/components src/features/settings/screens/APIKeyGuideScreen.tsx; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: tests/TypeScript PASS；`rg` 无输出。

- [ ] **Step 7: Commit**

```bash
git add AwesomeProject/src/shared/types/navigation.ts \
  AwesomeProject/src/navigation/AppNavigator.tsx \
  AwesomeProject/src/features/task/screens/HomeScreen.tsx \
  AwesomeProject/src/features/capability/screens/PhoneOperateScreen.tsx \
  AwesomeProject/src/features/model/screens/AddModelScreen.tsx \
  AwesomeProject/src/features/model/screens/EditModelScreen.tsx \
  AwesomeProject/src/features/model/screens/ModelListScreen.tsx \
  AwesomeProject/src/features/model/components/ApiProviderSelector.tsx \
  AwesomeProject/src/features/model/components/ModelNameSelector.tsx \
  AwesomeProject/src/features/model/components/ModelListPanel.tsx \
  AwesomeProject/src/features/model/components/ModelItem.tsx \
  AwesomeProject/src/features/settings/screens/APIKeyGuideScreen.tsx \
  AwesomeProject/src/features/model/services/ModelListService.ts \
  AwesomeProject/src/shared/constants/apiProviders.ts \
  AwesomeProject/src/application/facades/createAppFacades.ts \
  AwesomeProject/src/__tests__/navigation/AppNavigatorTyping.test.tsx \
  AwesomeProject/src/__tests__/features/capability/PhoneOperateViewState.test.tsx \
  AwesomeProject/src/__tests__/features/model/ModelConfigViewState.test.tsx \
  AwesomeProject/src/__tests__/features/model/ModelCatalogRace.test.ts
git commit -m "feat: wire model config and runnable mode UI"
```

---

### Task 7: Replace Global Task Events with a Task-Scoped V1 Channel

**Mode:** Wave 2；集成 Agent 串行；JS 与 Android/iOS native signature 必须在同一 commit 原子交付。

**Files:**

- Create: `AwesomeProject/src/features/task/services/TaskUiEventNames.ts`
- Create: `AwesomeProject/src/features/task/services/NativeTaskUiEventSource.ts`
- Modify: `AwesomeProject/src/features/task/hooks/useTaskExecution.ts`
- Modify: `AwesomeProject/src/features/task/useTaskExecutionWithBackground.ts`
- Modify: `AwesomeProject/src/features/task/services/TaskExecutionHeadless.ts`
- Modify: `AwesomeProject/src/core/engine/taskEngine/task/TaskExecutionEngine.ts`
- Modify: `AwesomeProject/src/core/engine/taskEngine/task/modules/TaskStateModule.ts`
- Modify: `AwesomeProject/src/core/engine/taskEngine/task/modules/CancellationModule.ts`
- Modify: `AwesomeProject/src/features/task/screens/TaskHistoryScreen.tsx`
- Modify: `AwesomeProject/src/core/ability/accessibility/AccessibilityService.ts`
- Modify: `AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityModule.kt`
- Modify: `AwesomeProject/android/app/src/main/java/com/awesomeproject/utils/ServiceManager.kt`
- Modify: `AwesomeProject/android/app/src/main/java/com/awesomeproject/service/TaskExecutionService.kt`
- Modify: `AwesomeProject/android/app/src/main/java/com/awesomeproject/service/TaskExecutionHeadlessService.kt`
- Modify: `AwesomeProject/ios/AwesomeProject/AutoGLMAccessibilityModule.m`
- Test: `AwesomeProject/src/__tests__/features/task/TaskUiEvents.test.ts`
- Test: `AwesomeProject/src/__tests__/features/task/TaskExecutionHeadlessSession.test.ts`
- Test: `AwesomeProject/src/__tests__/features/task/TaskNativeContract.test.ts`

**Interfaces:**

- Consumes: Task 1 `TaskUiEvent`、Task 2 `ScopedTaskUiEvents`、runtime `TaskEventPort`、`OperateTaskRunner`。
- Produces:

```ts
export const TASK_UI_EVENT_NAME = 'NonoTaskEventV1';
export const TASK_CANCEL_REQUEST_EVENT_NAME = 'NonoTaskCancelRequestedV1';

export interface HeadlessTaskIdentityV1 {
  taskId: string;
  sessionRevision: number;
}

export interface TaskCancelRequestV1 {
  taskId: string;
  sessionRevision: number;
}
```

- [ ] **Step 1: Write RED event/payload/native contract tests**

```ts
import fs from 'node:fs';
import path from 'node:path';
import {parseHeadlessTaskIdentity} from '../../../features/task/services/TaskExecutionHeadless';

describe('task-scoped runtime channel', () => {
  it('accepts exactly taskId and sessionRevision in Headless payload', () => {
    expect(parseHeadlessTaskIdentity(JSON.stringify({taskId: 'task-1', sessionRevision: 3}))).toEqual({taskId: 'task-1', sessionRevision: 3});
    expect(() => parseHeadlessTaskIdentity(JSON.stringify({taskId: 'task-1', sessionRevision: 3, instruction: 'secret'}))).toThrow('invalid_headless_payload');
    expect(() => parseHeadlessTaskIdentity(JSON.stringify({taskId: 'current', sessionRevision: 3}))).toThrow('invalid_task_id');
  });

  it('contains no legacy global event names in execution entrypoints', () => {
    const files = [
      'src/features/task/hooks/useTaskExecution.ts',
      'src/features/task/useTaskExecutionWithBackground.ts',
      'src/features/task/services/TaskExecutionHeadless.ts',
      'src/core/engine/taskEngine/task/TaskExecutionEngine.ts',
      'src/core/engine/taskEngine/task/modules/TaskStateModule.ts',
      'src/core/engine/taskEngine/task/modules/CancellationModule.ts',
    ];
    const text = files.map(file => fs.readFileSync(path.resolve(file), 'utf8')).join('\n');
    expect(text).not.toMatch(/TaskStarted|TaskStepStarted|TaskStepCompleted|TaskCompleted|TaskFailed|TaskCancelRequested|taskId:\s*['"]current['"]/);
    expect(text).not.toMatch(/modelInferenceModule|while\s*\(step\s*</);
  });

  it('passes task identity through the Android service cancel intent', () => {
    const service = fs.readFileSync(path.resolve('android/app/src/main/java/com/awesomeproject/service/TaskExecutionService.kt'), 'utf8');
    const headless = fs.readFileSync(path.resolve('android/app/src/main/java/com/awesomeproject/service/TaskExecutionHeadlessService.kt'), 'utf8');
    expect(service).toMatch(/putString\("taskId"/);
    expect(service).toMatch(/putDouble\("sessionRevision"/);
    expect(headless).not.toMatch(/任务数据:\s*\$taskData/);
  });
});
```

- [ ] **Step 2: Run RED**

```bash
cd AwesomeProject
npx jest src/__tests__/features/task/TaskUiEvents.test.ts src/__tests__/features/task/TaskExecutionHeadlessSession.test.ts src/__tests__/features/task/TaskNativeContract.test.ts --runInBand
```

Expected: FAIL because payload accepts extra fields、legacy global events remain、native cancel has no task identity and Headless logs raw taskData.

- [ ] **Step 3: Implement strict Headless identity parsing and one runner**

`parseHeadlessTaskIdentity` 必须 parse JSON object、要求 keys 排序后精确等于 `['sessionRevision','taskId']`、taskId 非空且不等于 `current`、revision 为正整数。`registerTaskExecutionTask` 只 claim stored session and invoke the same `OperateTaskRunner`；instruction 由 `TaskInstructionPort.load(taskId)` 读取。删除 Headless 中截图、model inference、action while-loop 和完整模型反序列化。

`useTaskExecutionWithBackground.startBackgroundTask` 序列化：

```ts
JSON.stringify({taskId, sessionRevision})
```

它不创建第二个 taskId、不读取 `AIModel`、不在 startBackgroundTask 失败时调用 foreground runner。`useTaskExecution` 变成 `OperateFacade` 的薄 React adapter；`TaskExecutionEngine` 只兼容委托给 `OperateTaskRunner`。

- [ ] **Step 4: Emit one validated UI event stream**

`NativeTaskUiEventSource` 只监听 `TASK_UI_EVENT_NAME`，对 raw value 做 Task 1 union validation；未知 type、空 taskId、非正 revision、非整数/负 sequence 均丢弃并只记录固定 reason code。`TaskStateModule` 不再 emit raw Task、model response、screenshot；sequence 从 session event counter 单调递增。`CancellationModule` 只接受 exact `{taskId, sessionRevision}`，不接受 absent/current/wildcard。

- [ ] **Step 5: Carry task identity through Android and iOS service APIs**

JS/Android method signatures改为：

```ts
startTaskExecutionService(taskId: string, sessionRevision: number, statusText: string): Promise<void>;
updateTaskExecutionService(taskId: string, sessionRevision: number, statusText: string): Promise<void>;
stopTaskExecutionService(taskId: string, sessionRevision: number): Promise<void>;
```

Android `ServiceManager` 给 start/update/cancel Intent 写 `taskId` 和 `sessionRevision`；`TaskExecutionService` 保存本次 identity，通知 cancel PendingIntent 也写同一 identity，`sendCancelTaskEvent` emit `NonoTaskCancelRequestedV1` 并放两个字段。没有 identity 时拒绝 emit，不能广播取消。`TaskExecutionHeadlessService` 只记录 `taskId` 与 revision，不记录 JSON payload。

iOS notification identifier 使用 `` `TaskExecutionService.${taskId}.${sessionRevision}` ``；update/stop 只操作 exact identifier。iOS 无 Headless JS 等价后台保证，保持现有时间窗口语义并在最终报告单列。

- [ ] **Step 6: Remove legacy Screen cancellation/listeners**

`TaskHistoryScreen.tsx` 只用 `OperateFacade.subscribeTask(taskId, sessionRevision, listener)`；停止按钮调用 `operate.cancel(taskId)`。删除所有 direct `DeviceEventEmitter` import 和 `'current'` cancel。页面收到其他 task/session 或重复 sequence 时不更新。

- [ ] **Step 7: Run JS and Android GREEN gates**

```bash
cd AwesomeProject
npx jest src/__tests__/features/task/TaskUiEvents.test.ts src/__tests__/features/task/TaskExecutionHeadlessSession.test.ts src/__tests__/features/task/TaskNativeContract.test.ts --runInBand
npx tsc --noEmit --pretty false
cd android
./gradlew :app:testDebugUnitTest :app:compileDebugKotlin --stacktrace
```

Expected: Jest/TypeScript PASS；Gradle `BUILD SUCCESSFUL`。

- [ ] **Step 8: Run source privacy/ownership guards**

```bash
cd AwesomeProject
if rg -n "TaskStarted|TaskStepStarted|TaskStepCompleted|TaskCompleted|TaskFailed|TaskCancelRequested|taskId:\s*['\"]current['\"]|modelInferenceModule|while\s*\(step\s*<" src/features/task/hooks/useTaskExecution.ts src/features/task/useTaskExecutionWithBackground.ts src/features/task/services/TaskExecutionHeadless.ts src/core/engine/taskEngine/task/TaskExecutionEngine.ts src/core/engine/taskEngine/task/modules/TaskStateModule.ts src/core/engine/taskEngine/task/modules/CancellationModule.ts; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
if rg -n "apiKey|Authorization|instruction|modelResponse|screenshot" src/features/task/services/TaskExecutionHeadless.ts android/app/src/main/java/com/awesomeproject/service/TaskExecutionHeadlessService.kt; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: 两个 `rg` 均无输出。类型定义/固定错误码若包含 `instruction` 名称，必须移到 `TaskInstructionPort` 文件且不进入 Headless payload。

- [ ] **Step 9: Commit the atomic event/native change**

```bash
git add AwesomeProject/src/features/task/services/TaskUiEventNames.ts \
  AwesomeProject/src/features/task/services/NativeTaskUiEventSource.ts \
  AwesomeProject/src/features/task/hooks/useTaskExecution.ts \
  AwesomeProject/src/features/task/useTaskExecutionWithBackground.ts \
  AwesomeProject/src/features/task/services/TaskExecutionHeadless.ts \
  AwesomeProject/src/core/engine/taskEngine/task/TaskExecutionEngine.ts \
  AwesomeProject/src/core/engine/taskEngine/task/modules/TaskStateModule.ts \
  AwesomeProject/src/core/engine/taskEngine/task/modules/CancellationModule.ts \
  AwesomeProject/src/features/task/screens/TaskHistoryScreen.tsx \
  AwesomeProject/src/core/ability/accessibility/AccessibilityService.ts \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityModule.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/utils/ServiceManager.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/service/TaskExecutionService.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/service/TaskExecutionHeadlessService.kt \
  AwesomeProject/ios/AwesomeProject/AutoGLMAccessibilityModule.m \
  AwesomeProject/src/__tests__/features/task/TaskUiEvents.test.ts \
  AwesomeProject/src/__tests__/features/task/TaskExecutionHeadlessSession.test.ts \
  AwesomeProject/src/__tests__/features/task/TaskNativeContract.test.ts
git commit -m "refactor: scope task UI events to immutable sessions"
```

若 Task 7 刚提交后 gate 失败，Rollback 必须整 commit 执行 `git revert HEAD`；禁止只回滚 JS 或只回滚 native signature。

---

### Task 8: Remove DEMO_TURNS and Connect Home to Facades

**Mode:** Wave 2；集成 Agent 串行。

**Files:**

- Modify: `AwesomeProject/src/features/task/screens/HomeScreen.tsx`
- Test: `AwesomeProject/src/__tests__/features/task/HomeFacadeIntegration.test.tsx`
- Test: `AwesomeProject/src/__tests__/features/task/HomeArchitectureGuard.test.ts`

**Interfaces:**

- Consumes: `useAppFacades().companion`、`.operate`、`.errands`；Task 7 task-scoped subscription。
- Produces: Home 只渲染 `CompanionViewState` + `OperateTaskViewState`；没有 ASR event 时不制造 transcript。Task 10 在此边界接真实 `SpeechRouter` 和 Avatar store。

- [ ] **Step 1: Write RED architecture and behavior tests**

```ts
import fs from 'node:fs';
import path from 'node:path';

describe('Home architecture', () => {
  const source = fs.readFileSync(path.resolve('src/features/task/screens/HomeScreen.tsx'), 'utf8');

  it('has no demo turns, direct repositories, model selection, old hooks, or global events', () => {
    expect(source).not.toMatch(/DEMO_TURNS|listenTurn|listenTimer|setTimeout\(.*2600/);
    expect(source).not.toMatch(/modelService|nonoConfigService|taskHistoryService|useTaskExecution|useTaskExecutionWithBackground|DeviceEventEmitter/);
    expect(source).not.toMatch(/startBackgroundTask|executeTaskForeground|taskId:\s*['"]current['"]/);
    expect(source).toMatch(/useAppFacades/);
  });
});
```

```tsx
import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {HomeScreen} from '../../../features/task/screens/HomeScreen';
import {AppFacadesProvider} from '../../../application/facades/AppFacadesContext';
import type {AppFacades} from '../../../application/facades/UiRuntimeContracts';

test('starts the exact heard instruction and cancels the exact returned task', async () => {
  const listener = jest.fn();
  const operate = {
    getViewState: jest.fn().mockResolvedValue({phase: 'idle', steps: []}),
    start: jest.fn().mockResolvedValue({kind: 'started', taskId: 'task-7', sessionRevision: 4}),
    cancel: jest.fn().mockResolvedValue(undefined),
    subscribeTask: jest.fn((_id, _revision, next) => { listener.mockImplementation(next); return jest.fn(); }),
  };
  const companion = {
    getViewState: jest.fn().mockResolvedValue({
      phase: 'ready',
      turn: {id: 'turn-1', transcript: '打开设置', reply: '准备操作', intent: 'operate'},
    }),
    submitTranscript: jest.fn(), confirmProposal: jest.fn(), dismissTurn: jest.fn(),
  };
  const facades = {operate, companion, errands: {createFromProposal: jest.fn()}} as unknown as AppFacades;
  const screen = render(<AppFacadesProvider value={facades}><HomeScreen /></AppFacadesProvider>);
  await waitFor(() => expect(screen.getByText('开始操作')).toBeTruthy());
  fireEvent.press(screen.getByText('开始操作'));
  await waitFor(() => expect(operate.start).toHaveBeenCalledWith('打开设置'));
  expect(operate.subscribeTask).toHaveBeenCalledWith('task-7', 4, expect.any(Function));
});
```

- [ ] **Step 2: Run RED**

```bash
cd AwesomeProject
npx jest src/__tests__/features/task/HomeArchitectureGuard.test.ts src/__tests__/features/task/HomeFacadeIntegration.test.tsx --runInBand
```

Expected: FAIL because V1 still contains `DEMO_TURNS`、old hooks/services and global events.

- [ ] **Step 3: Replace Home state ownership with Facade state**

Home focus 时并行调用 `companion.getViewState()` 与 `operate.getViewState()`；保留页面本地的纯 presentation state：确认 modal 是否显示、当前 partial text、active subscription cleanup。删除 `AIModel`、`CapabilityFlags`、`MemoryItem`、`Task`、`TaskStep` 业务 state。

操作开始必须处理 discriminated result：

```ts
const result = await operate.start(turn.transcript);
if (result.kind === 'blocked') {
  setOperateState({phase: 'blocked', steps: [], blocker: result.blocker});
  return;
}
setOperateState({
  phase: 'running',
  taskId: result.taskId,
  sessionRevision: result.sessionRevision,
  instruction: turn.transcript,
  steps: [],
});
unsubscribeRef.current?.();
unsubscribeRef.current = operate.subscribeTask(
  result.taskId,
  result.sessionRevision,
  applyTaskUiEvent,
);
```

`applyTaskUiEvent` 只根据 Task 1 union 更新：step_started 更新 currentStep/maxSteps；step_completed append safe step label；completed/failed 进入终态并清 subscription。不得读取 event 中的 raw Task，因为 contract 不允许。

确认 proposal：preference 和 errand 都只调用一次 `companion.confirmProposal(turn.id)`；Companion application port 根据冻结 proposal kind 原子写入 `PreferenceRepository` 或 `ErrandRepository`。Home 不调用 `errands.createFromProposal`、不生成 id/时间，测试断言每次确认只有一次 repository mutation。

在 Task 10 前，点角色不得设置 listening timer 或返回演示句；可以保持 idle 并显示固定“听写组件不可用”错误 state。Task 10 替换为 `SpeechRouter`。

- [ ] **Step 4: Verify GREEN and source boundary**

```bash
cd AwesomeProject
npx jest src/__tests__/features/task/HomeArchitectureGuard.test.ts src/__tests__/features/task/HomeFacadeIntegration.test.tsx src/__tests__/features/task/HomeScreenCompanionAlert.test.ts --runInBand
npx tsc --noEmit --pretty false
if rg -n "DEMO_TURNS|modelService|nonoConfigService|taskHistoryService|useTaskExecution|useTaskExecutionWithBackground|DeviceEventEmitter|taskId:\s*['\"]current['\"]" src/features/task/screens/HomeScreen.tsx; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: tests/TypeScript PASS；`rg` 无输出。

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/features/task/screens/HomeScreen.tsx \
  AwesomeProject/src/__tests__/features/task/HomeFacadeIntegration.test.tsx \
  AwesomeProject/src/__tests__/features/task/HomeArchitectureGuard.test.ts
git commit -m "refactor: connect V1 Home to application facades"
```

---

### Task 9: Connect Visual Agent Tools, Errand, Privacy, Capabilities, and Activity Screens to Real ViewState

**Mode:** Wave 2；集成 Agent 串行。

**Files:**

- Modify: `AwesomeProject/src/features/capability/screens/CapabilitiesScreen.tsx`
- Modify: `AwesomeProject/src/shared/types/navigation.ts`
- Modify: `AwesomeProject/src/navigation/AppNavigator.tsx`
- Create: `AwesomeProject/src/features/capability/screens/VisualAgentToolsScreen.tsx`
- Modify: `AwesomeProject/src/features/capability/screens/OpenClawScreen.tsx`
- Modify: `AwesomeProject/src/features/capability/screens/ErrandsScreen.tsx`
- Modify: `AwesomeProject/src/features/capability/screens/ErrandDetailScreen.tsx`
- Modify: `AwesomeProject/src/features/capability/screens/PrivacyScreen.tsx`
- Modify: `AwesomeProject/src/features/task/screens/TaskHistoryScreenTab.tsx`
- Test: `AwesomeProject/src/__tests__/features/capability/CapabilityViewStates.test.tsx`
- Test: `AwesomeProject/src/__tests__/features/task/ActivityViewState.test.tsx`
- Test: `AwesomeProject/src/__tests__/features/capability/CapabilityArchitectureGuard.test.ts`

**Interfaces:**

- Consumes: Task 1 ViewState 和 `useAppFacades()`；Screen 不再 import `NonoConfigService`、`ModelService`、`TaskHistoryService`、`MemoryItem`。canonical route 为 `VisualAgentTools`，`OpenClaw` route 只保留一版 alias。
- Produces: 每个页面有明确 loading/ready/error；显示值和可操作性都来自 Facade 返回值，空仓储显示真实 empty state，不注入 seed。

- [ ] **Step 1: Write RED architecture and rendering tests**

```ts
import fs from 'node:fs';
import path from 'node:path';

test('capability and activity screens have no direct storage/repository access', () => {
  const files = [
    'src/features/capability/screens/CapabilitiesScreen.tsx',
    'src/features/capability/screens/VisualAgentToolsScreen.tsx',
    'src/features/capability/screens/OpenClawScreen.tsx',
    'src/features/capability/screens/ErrandsScreen.tsx',
    'src/features/capability/screens/ErrandDetailScreen.tsx',
    'src/features/capability/screens/PrivacyScreen.tsx',
    'src/features/task/screens/TaskHistoryScreenTab.tsx',
  ];
  const source = files.map(file => fs.readFileSync(path.resolve(file), 'utf8')).join('\n');
  expect(source).not.toMatch(/NonoConfigService|nonoConfigService|ModelService|modelService|TaskHistoryService|taskHistoryService|MemoryItem|SEED_MEMORIES|AsyncStorage/);
  expect(source).toMatch(/useAppFacades/);
});
```

```tsx
import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
import {VisualAgentToolsScreen} from '../../../features/capability/screens/VisualAgentToolsScreen';
import {PrivacyScreen} from '../../../features/capability/screens/PrivacyScreen';
import {TaskHistoryScreenTab} from '../../../features/task/screens/TaskHistoryScreenTab';
import {AppFacadesProvider} from '../../../application/facades/AppFacadesContext';
import type {AppFacades, VisualAgentToolOptionViewState} from '../../../application/facades/UiRuntimeContracts';

const canonicalAdapters: readonly VisualAgentToolOptionViewState[] = [
  {toolId: 'openclaw', builtIn: true, label: 'OpenClaw', readiness: 'disconnected', maturity: 'stable', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: true}, configuredProfileCount: 1},
  {toolId: 'codex', builtIn: true, label: 'Codex', readiness: 'not_configured', maturity: 'beta', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: false}, configuredProfileCount: 0},
  {toolId: 'cursor', builtIn: true, label: 'Cursor', readiness: 'not_configured', maturity: 'beta', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: false, preferences: false}, configuredProfileCount: 0},
  {toolId: 'dsh', builtIn: true, label: 'DSH (DeepSeek Harness)', readiness: 'not_configured', maturity: 'experimental', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: false, resume: false, steer: false, preferences: false}, configuredProfileCount: 0},
  {toolId: 'hermes', builtIn: true, label: 'Hermes', readiness: 'not_configured', maturity: 'beta', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: false}, configuredProfileCount: 0},
];

test('renders actual tool readiness/capabilities, privacy-channel, and empty activity states', async () => {
  const facades = {
    visualAgentTools: {getViewState: jest.fn().mockResolvedValue({
      status: 'ready', revision: 4, enabled: true, activeProfileId: 'openclaw-1',
      adapters: canonicalAdapters,
      profiles: [{profileId: 'openclaw-1', toolId: 'openclaw', displayName: 'OpenClaw', enabled: true, endpointLabel: 'bridge.example', readiness: 'disconnected', maturity: 'stable', requestedCapabilities: {imageInput: true, structuredAction: true, stream: true, approval: true, cancel: true, steer: true, resume: true, preferences: true}, capabilities: {imageInput: true, structuredAction: true, stream: true, approval: true, cancel: true, steer: true, resume: true, preferences: true}, runnable: false, blockers: [{code: 'visual_agent_not_ready', message: 'OpenClaw 未连接，操作会暂停'}]}],
      canOperate: false, blocker: {code: 'visual_agent_not_ready', message: 'OpenClaw 未连接，操作会暂停'},
    }), setEnabled: jest.fn(), saveProfile: jest.fn(), deleteProfile: jest.fn(), setActiveProfile: jest.fn(), refreshProfile: jest.fn()},
    privacy: {getViewState: jest.fn().mockResolvedValue({
      status: 'ready', memoryEnabled: true, memoryLocation: 'device', canUseVisualAgentMemory: false,
      channels: [{id: 'local_vision', state: 'local', destinationLabel: '仅这台手机', fields: ['结构化观察']}],
      persistedDiagnosticFields: ['错误码', '耗时'],
    }), setMemoryEnabled: jest.fn(), setMemoryLocation: jest.fn(), forgetAllPreferences: jest.fn()},
    activity: {getViewState: jest.fn().mockResolvedValue({
      status: 'ready', memoryEnabled: true, memoryLocationLabel: '仅这台手机', preferences: [], errands: [], tasks: [],
    }), forgetPreference: jest.fn(), deleteTask: jest.fn()},
  } as unknown as AppFacades;

  const tools = render(<AppFacadesProvider value={facades}><VisualAgentToolsScreen /></AppFacadesProvider>);
  await waitFor(() => expect(tools.getByText('OpenClaw 未连接，操作会暂停')).toBeTruthy());
  expect(tools.getByText('审批：支持')).toBeTruthy();
  const privacy = render(<AppFacadesProvider value={facades}><PrivacyScreen /></AppFacadesProvider>);
  await waitFor(() => expect(privacy.getByText('结构化观察')).toBeTruthy());
  const activity = render(<AppFacadesProvider value={facades}><TaskHistoryScreenTab /></AppFacadesProvider>);
  await waitFor(() => expect(activity.getByText('还没有称呼或偏好')).toBeTruthy());
  expect(activity.queryByText('咖啡少糖')).toBeNull();
});
```

- [ ] **Step 2: Run RED**

```bash
cd AwesomeProject
npx jest src/__tests__/features/capability/CapabilityArchitectureGuard.test.ts src/__tests__/features/capability/CapabilityViewStates.test.tsx src/__tests__/features/task/ActivityViewState.test.tsx --runInBand
```

Expected: FAIL because V1 Screens directly read config/model/history and Activity seeds memories.

- [ ] **Step 3: Apply one shared load pattern to every Screen**

每个 Screen 使用该 exact lifecycle；命令返回的新 ViewState 直接覆盖旧 state：

```ts
useFocusEffect(useCallback(() => {
  let active = true;
  setViewState(current => current ?? LOADING_STATE);
  facade.getViewState()
    .then(next => active && setViewState(next))
    .catch(() => active && setViewState(ERROR_STATE));
  return () => { active = false; };
}, [facade]));
```

`LOADING_STATE` 和 `ERROR_STATE` 使用该页面的 exact ViewState shape；error UI 显示固定安全文案和“重试”，不显示 raw Error。

- [ ] **Step 4: Render generic Visual Agent Tools and Capabilities from actual state**

`VisualAgentToolsScreen`：先固定渲染 `adapters` 中 OpenClaw/Codex/Cursor/dsh/Hermes 五个 built-in 卡，即使尚未配置也显示 `not_configured` readiness、maturity 与完整 canonical `VisualAgentCapabilitySet` 八项能力；再渲染 registry 返回且 `builtIn:false` 的已验收 `custom:<name>` 卡，然后列出所有已保存 profiles，可新增/编辑/删除并以 expected revision 选择唯一 active profile。新增/编辑表单精确包含 profile enabled、tool preset（custom 只能从 registry 提供的 adapter 选择，禁止自由输入一个未注册 ID）、Connector Bridge HTTPS/WSS URL、Bridge-owned binding ID、八项 requested capability 和 credential keep/replace/remove；编辑时从 `enabled/requestedCapabilities` 初始化，不得用 negotiated `capabilities` 反写配置；不得要求或展示 OpenClaw gateway、Codex/Cursor CLI、ACP、DSH/Hermes 上游私有参数。编辑默认 keep 且 secret 字段永远为空；replace/remove 必须二次确认；保存只提交 `VisualAgentProfileDraftInput`，响应 state 不回显明文。其他 adapter 使用同一 `VisualAgentToolId + VisualAgentCapabilitySet` contract。active profile 的 readiness 不是 ready 或缺 imageInput/structuredAction 时显示 exact blocker并禁用操作入口；stream/approval/cancel/steer/resume/preferences 不支持时仅禁用对应控件，不伪装支持。

`OpenClawScreen` 不再读取 Facade，只返回/渲染 `VisualAgentToolsScreen initialPreset="openclaw"`；`RootStackParamList.OpenClaw` 与旧 deep link 在这一版导航层 alias 到 canonical `VisualAgentTools`，埋点和状态 key 只用 canonical route，下一 major 删除 alias。严禁复制一套 OpenClaw state 或 adapter 特判。

`CapabilitiesScreen`：PhoneOperate meta 使用 `PhoneOperateViewState.activeMode` 对应 label 和 runnable；Errand meta 使用 `pendingCount`；视觉工具 meta 使用 active profile 的 displayName/readiness/canOperate；Privacy meta 使用 `memoryEnabled/memoryLocation`。视觉工具 toggle 调 `visualAgentTools.setEnabled(next, visualAgentToolsState.revision)`；其他 toggle 分别调用对应 Facade，不能写同一 `CapabilityFlags` object。

- [ ] **Step 5: Render Errand list/detail from ErrandRepository projection**

`ErrandsScreen` 展示真实 `pendingCount` 和 `items`；item badge 映射 pending/leased/failed/completed/cancelled。`ErrandDetailScreen` 用 route `errandId` 从 `errands.getViewState()` exact match；保存调用 `errands.update(item)`，取消调用 `errands.cancel(id)`。leased/terminal 项 disable 编辑并显示 state，不把它复制回 memory。

- [ ] **Step 6: Render Privacy and Activity from independent sources**

`PrivacyScreen` channels 逐项显示 `destinationLabel` 与 `fields.join('、')`；visual-agent profile memory 选项在 `canUseVisualAgentMemory === false` 时 disabled 并显示原因。忘记偏好调用 `privacy.forgetAllPreferences()`；不影响 errands。

`TaskHistoryScreenTab` 的“它还记得”来自 `ActivityViewState.preferences + errands`；“做过的事”来自 `tasks`；删除/忘记命令调用 Activity Facade 并使用返回 state。移除按 selected model 隐式过滤；空 state 不创建样例。

- [ ] **Step 7: Verify GREEN**

```bash
cd AwesomeProject
npx jest src/__tests__/features/capability/CapabilityArchitectureGuard.test.ts src/__tests__/features/capability/CapabilityViewStates.test.tsx src/__tests__/features/task/ActivityViewState.test.tsx --runInBand
npx tsc --noEmit --pretty false
if rg -n "NonoConfigService|nonoConfigService|ModelService|modelService|TaskHistoryService|taskHistoryService|MemoryItem|SEED_MEMORIES|远程会话尚未接通" src/features/capability/screens src/features/task/screens/TaskHistoryScreenTab.tsx; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
if rg -n "facades\.openClaw|OpenClawViewState|OpenClawFacade" src; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: tests/TypeScript PASS；`rg` 无输出。

- [ ] **Step 8: Commit**

```bash
git add AwesomeProject/src/features/capability/screens/CapabilitiesScreen.tsx \
  AwesomeProject/src/shared/types/navigation.ts \
  AwesomeProject/src/navigation/AppNavigator.tsx \
  AwesomeProject/src/features/capability/screens/VisualAgentToolsScreen.tsx \
  AwesomeProject/src/features/capability/screens/OpenClawScreen.tsx \
  AwesomeProject/src/features/capability/screens/ErrandsScreen.tsx \
  AwesomeProject/src/features/capability/screens/ErrandDetailScreen.tsx \
  AwesomeProject/src/features/capability/screens/PrivacyScreen.tsx \
  AwesomeProject/src/features/task/screens/TaskHistoryScreenTab.tsx \
  AwesomeProject/src/__tests__/features/capability/CapabilityViewStates.test.tsx \
  AwesomeProject/src/__tests__/features/task/ActivityViewState.test.tsx \
  AwesomeProject/src/__tests__/features/capability/CapabilityArchitectureGuard.test.ts
git commit -m "refactor: render generic tool and capability view states"
```

---

### Task 10: Integrate the Existing ASR and Avatar Plans at the Serial UI Join Points

**Mode:** Wave 3；ASR/Avatar 领域产物可以预先由独立 worker 准备；本 Task 的所有 cherry-pick 审核、native registration、Home、navigation 和 Screen 改动由集成 Agent 串行完成。

**Prerequisite delivery split:**

- ASR worker 交付 `2026-08-20-nono-offline-asr.md` Task 1-Task 5 的领域文件和测试；不得修改 `HomeScreen.tsx`、`permission.config.ts`、`AndroidManifest.xml`、`AccessibilityPackage.kt`、`android/app/build.gradle` 或 `jest.setup.js`。这些热点差异以单独 patch 说明交给集成 Agent。
- Avatar worker 交付 `2026-08-20-nono-avatar-glb-packs.md` Task 1-Task 4 的领域文件和测试；不得修改 `HomeScreen.tsx`、`NonoAvatar3D.tsx`、`SettingsScreen.tsx`、`AppNavigator.tsx`、`navigation.ts`、native registration 或 `jest.setup.js`。
- 两个 worker 的 shared dependency `LocalPackModule` 只能有一个 canonical implementation。ASR 基于 Avatar Task 2 的接口扩展 archive/assets 安装；禁止复制第二个 downloader/store。

**Files:**

- Consume/Create from ASR delivery: `AwesomeProject/src/features/task/asr/AsrArtifactPins.ts`
- Consume/Create from ASR delivery: `AwesomeProject/src/features/task/asr/AsrModelStore.ts`
- Consume/Create from ASR delivery: `AwesomeProject/src/features/task/asr/SilentAsrUpgrade.ts`
- Consume/Create from ASR delivery: `AwesomeProject/src/features/task/asr/SherpaAsr.ts`
- Consume/Create from ASR delivery: `AwesomeProject/src/features/task/asr/SpeechRouter.ts`
- Consume/Create from Avatar delivery: `AwesomeProject/src/features/task/avatar/LocalPack.ts`
- Consume/Create from Avatar delivery: `AwesomeProject/src/features/task/avatar/AvatarPackStore.ts`
- Consume/Create from Avatar delivery: `AwesomeProject/src/features/task/avatar/parseAvatarManifest.ts`
- Modify: `AwesomeProject/src/features/task/screens/HomeScreen.tsx`
- Modify: `AwesomeProject/src/features/task/components/NonoAvatar3D.tsx`
- Modify: `AwesomeProject/src/features/settings/screens/AvatarLooksScreen.tsx`
- Modify: `AwesomeProject/src/features/settings/screens/SettingsScreen.tsx`
- Modify: `AwesomeProject/src/shared/types/navigation.ts`
- Modify: `AwesomeProject/src/navigation/AppNavigator.tsx`
- Modify: `AwesomeProject/src/shared/constants/permission.config.ts`
- Modify: `AwesomeProject/android/app/src/main/AndroidManifest.xml`
- Modify: `AwesomeProject/android/app/build.gradle`
- Modify: `AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityPackage.kt`
- Modify: `AwesomeProject/jest.setup.js`
- Test: `AwesomeProject/src/__tests__/features/task/HomeLocalExperienceIntegration.test.tsx`
- Test: existing ASR/Avatar tests named in the two source plans

**Interfaces:**

- ASR consumes: `ensureBuiltinAsr()`、`maybeSilentUpgradeAsr()`、`startUtterance(onEvent)`、`stopUtterance()`。
- ASR produces events: `{type:'partial'; text; engine}`、`{type:'final'; text; engine}`、`{type:'error'; code; engine}`。
- Avatar consumes: `resolveAvatarGltfUri()`、`rollbackAvatarToBuiltin()`、`installPinnedAvatar()`、`setActiveAvatarId()`。
- `NonoAvatar3D` produces props `{mood: NoNoMood; gltfUri: string | null; onGltfFailed(): void}`；不再用 demo-only `skinId` 选择下载外观。

- [ ] **Step 1: Verify worker ownership before cherry-pick**

```bash
git show --name-only --format= codex/v1-asr-domain | sort -u
git show --name-only --format= codex/v1-avatar-domain | sort -u
```

Expected: 不含上述热点。若 domain commit 混入热点，让 worker 拆分 commit 后再交付；集成 Agent 不使用 `git checkout codex/v1-asr-domain -- AwesomeProject/src/features/task/screens/HomeScreen.tsx` 这类命令覆盖 V1。

- [ ] **Step 2: Cherry-pick domain commits and run their focused tests**

```bash
git cherry-pick codex/v1-avatar-domain
git cherry-pick codex/v1-asr-domain
cd AwesomeProject
npx jest src/__tests__/features/task/avatar src/__tests__/features/task/asr --runInBand
```

Expected: all domain tests PASS；出现 `LocalPackModule` 冲突则 abort ASR cherry-pick，先让 ASR worker 基于 Avatar domain commit 重放。

- [ ] **Step 3: Write the failing Home integration test**

```tsx
import React from 'react';
import {Platform} from 'react-native';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {HomeScreen} from '../../../features/task/screens/HomeScreen';
import {AppFacadesProvider} from '../../../application/facades/AppFacadesContext';
import type {AppFacades} from '../../../application/facades/UiRuntimeContracts';

jest.mock('../../../features/task/asr/SpeechRouter', () => ({
  startUtterance: jest.fn(),
  stopUtterance: jest.fn(),
}));
jest.mock('../../../features/task/asr/AsrModelStore', () => ({ensureBuiltinAsr: jest.fn()}));
jest.mock('../../../features/task/asr/SilentAsrUpgrade', () => ({maybeSilentUpgradeAsr: jest.fn()}));
jest.mock('../../../features/task/avatar/AvatarPackStore', () => ({
  resolveAvatarGltfUri: jest.fn().mockResolvedValue('file:///avatar/model.glb'),
  rollbackAvatarToBuiltin: jest.fn(),
}));

test('routes final ASR text into CompanionFacade and applies active avatar URI', async () => {
  Object.defineProperty(Platform, 'OS', {value: 'android'});
  const companion = {
    getViewState: jest.fn().mockResolvedValue({phase: 'idle', modelLabel: '陪伴模型'}),
    submitTranscript: jest.fn().mockResolvedValue({id: 'turn-2', transcript: '打开设置', reply: '准备操作', intent: 'operate'}),
    confirmProposal: jest.fn(), dismissTurn: jest.fn(),
  };
  const facades = {companion, operate: {getViewState: jest.fn().mockResolvedValue({phase: 'idle', steps: []})}} as unknown as AppFacades;
  const screen = render(<AppFacadesProvider value={facades}><HomeScreen /></AppFacadesProvider>);
  await waitFor(() => expect(screen.getByTestId('nono-avatar-3d').props.gltfUri).toBe('file:///avatar/model.glb'));
  fireEvent.press(screen.getByLabelText('和 NoNo 说话'));
  const {startUtterance} = require('../../../features/task/asr/SpeechRouter');
  const onEvent = startUtterance.mock.calls[0][0];
  await onEvent({type: 'final', text: '打开设置', engine: 'builtin'});
  expect(companion.submitTranscript).toHaveBeenCalledWith('打开设置');
});
```

同文件增加：麦克风 denied 时 `startUtterance` 未调用且无假 transcript；partial 只更新 dock；空 final 不提交；unmount 调 `stopUtterance`；Avatar load failed 调 rollback 并把 uri 设 null；iOS 不访问 Android NativeModule 且保持 builtin。

- [ ] **Step 4: Run RED**

```bash
cd AwesomeProject
npx jest src/__tests__/features/task/HomeLocalExperienceIntegration.test.tsx --runInBand
```

Expected: FAIL because Home 尚未调用 `SpeechRouter`/Avatar store and `NonoAvatar3D` has no `gltfUri` prop.

- [ ] **Step 5: Wire real listening into Home without changing intent semantics**

Android `startVoiceListen` exact order：

```ts
if (operateState.phase === 'running' || companionState.phase === 'listening') return;
const permission = await request(PERMISSIONS.ANDROID.RECORD_AUDIO);
if (permission !== RESULTS.GRANTED) {
  setCompanionState({phase: 'error', errorMessage: '需要麦克风才能说话'});
  return;
}
await ensureBuiltinAsr();
setCompanionState(current => ({...current, phase: 'listening', partialText: ''}));
await startUtterance(async event => {
  if (event.type === 'partial') {
    setCompanionState(current => ({...current, partialText: event.text}));
  } else if (event.type === 'final' && event.text.trim()) {
    const turn = await companion.submitTranscript(event.text.trim());
    setCompanionState({phase: 'ready', modelLabel: companionState.modelLabel, turn});
  } else if (event.type === 'error') {
    setCompanionState({phase: 'error', errorMessage: '这次没听清，请再试'});
  }
});
```

`useFocusEffect` fire-and-forget `ensureBuiltinAsr()` 与 `maybeSilentUpgradeAsr()`，不显示下载 UI；cleanup 调 `stopUtterance()`。ASR final 不强制设置 `intent:'operate'`，必须经过 `CompanionFacade.submitTranscript` 的真实意图/ proposal 路由。

iOS 点击角色显示固定“当前版本听写仅支持 Android”，不 import/call Android NativeModule；这条产品范围在报告标 `WAIVED`。

- [ ] **Step 6: Wire active Avatar and explicit download UI**

Home focus 调 `resolveAvatarGltfUri()`；先以 `gltfUri=null` 渲染 builtin，再设置成功 URI。`NonoAvatar3D` `onLoadEnd` 先 `setLayout/setMood`，随后 `gltfUri ? loadGltf(uri) : useBuiltin()`；WebView `onMessage` 收 `avatar-load-failed` 调 `onGltfFailed`。Home handler 调 `rollbackAvatarToBuiltin()` 并清 URI。

`AvatarLooksScreen` 使用真实 `listAvatarLooks/installPinnedAvatar/setActiveAvatarId`：未确认不下载；确认框显示网络类型和 bytes；失败回到 builtin；iOS 只显示 builtin 和 Android-only 说明。`SettingsScreen` 保留“角色外观”在 `CompanionConfig` 下；`AppNavigator`/navigation types 只注册一个 `AvatarLooks` route。

- [ ] **Step 7: Apply native registration and permissions serially**

`AndroidManifest.xml` 增加 `android.permission.RECORD_AUDIO`；`permission.config.ts` 增加 `RECORD_AUDIO`/CORE，purpose 精确为“对着角色说话时把语音转成文字”，requestTiming 为“点角色开始说话时请求”。

`AccessibilityPackage.kt` 注册 canonical `LocalPackModule` 与 `SherpaAsrModule` 各一次；`android/app/build.gradle` 把 ASR asset/AAR pin tasks 和 avatar local runtime copy task接到 `preBuild`，不下载远程 JS。`jest.setup.js` 只加两个空 NativeModule mock。

- [ ] **Step 8: Run full local-experience GREEN gates**

```bash
cd AwesomeProject
npx jest src/__tests__/features/task/asr src/__tests__/features/task/avatar src/__tests__/features/task/HomeLocalExperienceIntegration.test.tsx --runInBand
npx tsc --noEmit --pretty false
if rg -n "DEMO_TURNS|SpeechRecognizer|ACTION_RECOGNIZE_SPEECH|jsdelivr|unpkg|cdnjs" src android/app/src/main; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
cd android
./gradlew :app:compileDebugKotlin :app:assembleDebug --stacktrace
```

Expected: Jest/TypeScript PASS；prohibited source scan 无输出；Gradle `BUILD SUCCESSFUL`。

- [ ] **Step 9: Commit the serial UI/native join point**

```bash
git add AwesomeProject/src/features/task/screens/HomeScreen.tsx \
  AwesomeProject/src/features/task/components/NonoAvatar3D.tsx \
  AwesomeProject/src/features/settings/screens/AvatarLooksScreen.tsx \
  AwesomeProject/src/features/settings/screens/SettingsScreen.tsx \
  AwesomeProject/src/shared/types/navigation.ts \
  AwesomeProject/src/navigation/AppNavigator.tsx \
  AwesomeProject/src/shared/constants/permission.config.ts \
  AwesomeProject/android/app/src/main/AndroidManifest.xml \
  AwesomeProject/android/app/build.gradle \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityPackage.kt \
  AwesomeProject/jest.setup.js \
  AwesomeProject/src/__tests__/features/task/HomeLocalExperienceIntegration.test.tsx
git commit -m "feat: connect Home to offline speech and avatar packs"
```

Domain commits remain separately revertible；此 commit 只承担共享接线。完成 master Task 8 的全部 gate 后，在最终候选 commit 创建 `codex/checkpoint-v1-candidate`；不要在本 Task 提前把中间 SHA 当成 release candidate。

---

### Task 11: Add Unified Integration Tests, Privacy Scans, and the Verification Report

**Mode:** Wave 4；集成 Agent写测试/报告骨架，独立 testing Agent执行并填写实际结果。

**Files:**

- Create: `AwesomeProject/src/__tests__/integration/RuntimeChannelEndToEnd.test.ts`
- Create: `AwesomeProject/src/__tests__/integration/RuntimeRecoveryAndConcurrency.test.ts`
- Create: `AwesomeProject/src/__tests__/integration/UiReleaseArchitectureGuard.test.ts`
- Create: `docs/superpowers/reports/2026-08-20-v1-ui-integration-and-acceptance-verification.md`
- Create: `docs/superpowers/reports/2026-08-20-v1-visual-agent-provider-research.md`

**Interfaces:**

- Consumes: frozen AppFacades/runtime composition，in-memory/fake native ports，versioned config/session repositories。
- Produces: deterministic mock E2E coverage, one verification report suitable for `agent-runtime test-gate --record`, and one pre-candidate official-protocol research record suitable for `agent-runtime research --record`。

- [ ] **Step 1: Write RED channel and recovery tests**

`RuntimeChannelEndToEnd.test.ts` 必须用 injected fakes 覆盖并断言调用次数：

```ts
describe.each([
  ['cloud_direct', {direct: 1, perception: 0, planner: 0, local: 0}],
  ['cloud_split', {direct: 0, perception: 1, planner: 1, local: 0}],
  ['local_vision_cloud_planner', {direct: 0, perception: 0, planner: 1, local: 1}],
])('%s channel', (mode, calls) => {
  it('uses only the resolved session channel', async () => {
    const harness = createRuntimeHarness({mode});
    const result = await harness.startAndComplete('打开设置');
    expect(result.status).toBe('success');
    expect(harness.direct).toHaveBeenCalledTimes(calls.direct);
    expect(harness.perception).toHaveBeenCalledTimes(calls.perception);
    expect(harness.planner).toHaveBeenCalledTimes(calls.planner);
    expect(harness.local).toHaveBeenCalledTimes(calls.local);
  });
});

it.each([
  ['openai-compatible', 'openai'],
  ['anthropic', 'anthropic'],
  ['gemini', 'gemini'],
  ['custom', 'custom'],
] as const)('dispatches a frozen %s binding only through transport %s', async (provider, transportId) => {
  const harness = createRuntimeHarness({provider});
  await harness.startAndComplete('打开设置');
  expect(harness.registry.resolveTransport).toHaveBeenCalledWith(
    expect.objectContaining({mode: provider === 'custom' ? 'custom' : 'preset'}),
  );
  expect(harness.transports[transportId].sendChat).toHaveBeenCalled();
  expect(harness.otherTransportCallCount(transportId)).toBe(0);
  expect(harness.liveConfigReadCountDuringRun()).toBe(0);
});

describe.each(['openclaw', 'codex', 'cursor', 'dsh', 'hermes'] as const)('%s visual adapter', toolId => {
  it('blocks disconnect and missing mandatory capabilities with zero fallback', async () => {
    const disconnected = createRuntimeHarness({visualAgent: {toolId, readiness: 'disconnected', imageInput: true, structuredAction: true}});
    await expect(disconnected.start('打开设置')).resolves.toMatchObject({kind: 'blocked'});
    expect(disconnected.allPipelineCalls()).toBe(0);
    const incapable = createRuntimeHarness({visualAgent: {toolId, readiness: 'ready', imageInput: true, structuredAction: false}});
    await expect(incapable.start('打开设置')).resolves.toMatchObject({kind: 'blocked'});
    expect(incapable.allPipelineCalls()).toBe(0);
  });
});

it('keeps the task-owned visual profile snapshot after active profile changes', async () => {
  const harness = createRuntimeHarness({visualAgent: {toolId: 'openclaw', profileId: 'p-1', sourceConfigRevision: 3}});
  const task = await harness.start('打开设置');
  if (task.kind !== 'started') throw new Error('expected started task');
  await harness.saveAndActivateProfile({toolId: 'cursor', profileId: 'p-2'});
  expect(await harness.readTaskProfileSnapshot(task.taskId)).toMatchObject({toolId: 'openclaw', profileId: 'p-1', sourceConfigRevision: 3});
});
```

`RuntimeRecoveryAndConcurrency.test.ts` 必须覆盖：创建 session 后改 active/profile 内容仍用旧的 immutable tool profile snapshot；foreground/headless 重复 claim 只有一个 owner；重复 sequence UI 只消费一次；cancel task A 不影响 task B tombstone/history；terminal exactly once；两次 due sweep 只 lease 一次；history concurrent writes 索引一致；模型目录快速切换只接受最新 `requestGeneration`，七态不互相折叠；keep/replace/remove 分别产生零 secure 写入、一次新 credential 写入 + retirement、一次 null-CAS + retirement。旧 ref 在非终态 session 存在时不可删除，下一次 cold-start recovery 才由 GC 删除；所有 ViewState/trace 均无 plaintext。

- [ ] **Step 2: Write the release architecture guard**

```ts
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.resolve(file), 'utf8');

test('screens depend on facades, not runtime infrastructure', () => {
  const screenFiles = [
    'src/features/task/screens/HomeScreen.tsx',
    'src/features/task/screens/TaskHistoryScreenTab.tsx',
    'src/features/capability/screens/CapabilitiesScreen.tsx',
    'src/features/capability/screens/PhoneOperateScreen.tsx',
    'src/features/capability/screens/VisualAgentToolsScreen.tsx',
    'src/features/capability/screens/OpenClawScreen.tsx',
    'src/features/model/screens/AddModelScreen.tsx',
    'src/features/model/screens/EditModelScreen.tsx',
    'src/features/model/screens/ModelListScreen.tsx',
    'src/features/settings/screens/APIKeyGuideScreen.tsx',
    'src/features/model/components/ModelListPanel.tsx',
    'src/features/model/components/ModelItem.tsx',
    'src/features/capability/screens/ErrandsScreen.tsx',
    'src/features/capability/screens/ErrandDetailScreen.tsx',
    'src/features/capability/screens/PrivacyScreen.tsx',
  ];
  const source = screenFiles.map(read).join('\n');
  expect(source).not.toMatch(/AsyncStorage|ModelService|NonoConfigService|TaskHistoryService|agentRuntime\/providers|OperateTaskRunner|DeviceEventEmitter|OpenClawFacade|OpenClawViewState/);
});

test('model forms have one mode axis and no hard-coded provider chips', () => {
  const source = [
    'src/features/model/screens/AddModelScreen.tsx',
    'src/features/model/screens/EditModelScreen.tsx',
    'src/features/model/screens/ModelListScreen.tsx',
    'src/features/model/components/ApiProviderSelector.tsx',
    'src/features/model/components/ModelNameSelector.tsx',
    'src/features/model/components/ModelListPanel.tsx',
    'src/features/model/components/ModelItem.tsx',
    'src/features/settings/screens/APIKeyGuideScreen.tsx',
  ].map(read).join('\n');
  expect(source).not.toMatch(/providerChip|huggingface|fetchModelList|modelService|AIModel|apiKey|ModelProviderRegistry/);
  expect(source).toMatch(/preset/);
  expect(source).toMatch(/custom/);
  expect(source).toMatch(/manual-model-id/);
});

test('forbidden persistent boundaries contain no sensitive fields', () => {
  const files = [
    'src/features/task/services/TaskExecutionHeadless.ts',
    'src/core/engine/operateRuntime/session/OperateSessionStore.ts',
    'src/features/task/services/TaskHistoryService.ts',
    'src/features/debug/services/DebugLogService.ts',
  ];
  const source = files.map(read).join('\n');
  expect(source).not.toMatch(/apiKey|Authorization|Bearer\s|data:image|modelResponse|finalScreenshot|screenshotUri/);
});
```

- [ ] **Step 3: Run RED, then implement only missing fixture adapters/assertions**

```bash
cd AwesomeProject
npx jest src/__tests__/integration --runInBand
```

Expected first run: FAIL on missing harness/fixtures or a real invariant gap. Add deterministic fake ports under the test files or `src/__tests__/integration/fixtures/`; do not add production backdoors or timers.

- [ ] **Step 4: Run targeted and full automated gates**

```bash
cd AwesomeProject
npx jest src/__tests__/integration --runInBand
npm test -- --runInBand
npx tsc --noEmit --pretty false
npm run lint
npx prettier --check App.tsx index.js src android/app/src/main/java/com/awesomeproject ios/AwesomeProject
```

Expected: all commands exit 0。若 full gate 有 V1 baseline debt，只有在 runtime integration checkpoint 已记录相同 normalized failure 且本分支未新增失败时才可标 `WAIVED`；不能通过 exclude/ignore 获绿。

- [ ] **Step 5: Run exact privacy scans**

```bash
cd AwesomeProject
for target in \
  src/features/task/services/TaskExecutionHeadless.ts \
  src/core/engine/operateRuntime/session \
  src/features/task/services/TaskHistoryService.ts \
  src/features/debug/services/DebugLogService.ts \
  src/features/task \
  src/core/engine/taskEngine \
  src \
  android/app/src/main \
  src/features/model/screens/AddModelScreen.tsx \
  src/features/model/screens/EditModelScreen.tsx \
  src/features/model/components/ApiProviderSelector.tsx \
  src/features/model/components/ModelNameSelector.tsx \
  src/features/settings/screens/APIKeyGuideScreen.tsx \
  src/features/capability/screens; do
  test -e "$target" || { echo "required privacy-scan target missing: $target" >&2; exit 2; }
done

if rg -n "apiKey|Authorization|Bearer[[:space:]]+[A-Za-z0-9._-]+|data:image|modelResponse|finalScreenshot|screenshotUri" \
  src/features/task/services/TaskExecutionHeadless.ts \
  src/core/engine/operateRuntime/session \
  src/features/task/services/TaskHistoryService.ts \
  src/features/debug/services/DebugLogService.ts; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi

if rg -n "DEMO_TURNS|taskId:[[:space:]]*['\"]current['\"]|TaskCancelRequested|TaskCompleted|TaskFailed" \
  src/features/task src/core/engine/taskEngine; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi

if rg -n "jsdelivr|unpkg|cdnjs|SpeechRecognizer|ACTION_RECOGNIZE_SPEECH" \
  src android/app/src/main; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi

if rg -n "apiKey|credential.*ViewState|providerChip|facades\.openClaw|OpenClawFacade|OpenClawViewState" \
  src/features/model/screens/AddModelScreen.tsx \
  src/features/model/screens/EditModelScreen.tsx \
  src/features/model/components/ApiProviderSelector.tsx \
  src/features/model/components/ModelNameSelector.tsx \
  src/features/settings/screens/APIKeyGuideScreen.tsx \
  src/features/capability/screens; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: required-target loop 先确认所有文件/目录存在；缺失时 exit 2 并 FAIL，不能把 `rg` 的 I/O error 当作“无命中”。随后四段命令均 exit 0。credential plaintext 只能是 Add/Edit 内未命名为持久字段的瞬时 replace-input local state，经 command 后立即清空；不得作为 selector prop、ViewState 或 log 字段。任何命中先分类和修复，不能直接加 allowlist。

- [ ] **Step 6: Create the report with immutable evidence fields**

报告必须以该结构开头并填实际值：

```markdown
# V1 UI Integration and Acceptance Verification

- Base product SHA: 9ff7ba4cc4dc186b79b6e62181333ae6c9132f54
- Runtime checkpoint SHA: copy the literal full SHA from `codex/checkpoint-v1-wave1`
- Candidate code SHA: NOT_RUN_PRE_CANDIDATE
- Test started at: NOT_RUN_PRE_CANDIDATE
- Test completed at: NOT_RUN_PRE_CANDIDATE
- Testing agent: NOT_ASSIGNED_PRE_CANDIDATE
- Android device: NOT_RUN_PRE_CANDIDATE
- iOS target: NOT_RUN_PRE_CANDIDATE
- Final result: NOT_RUN_PRE_CANDIDATE

## Commands and Results

| Command | Exit | Result | Evidence excerpt |
| --- | ---: | --- | --- |

## User-path Matrix

| Scenario | Expected | Actual | Result | Evidence |
| --- | --- | --- | --- | --- |

## Waivers

| Gate | Reason | Impact | Owner | Manual follow-up date |
| --- | --- | --- | --- | --- |

## Findings and Fixes

| Severity | Finding | Fix commit | Re-test |
| --- | --- | --- | --- |
```

Task 11 提交的是候选冻结前的 schema/sentinel skeleton，以上 `NOT_*_PRE_CANDIDATE` 是有意的可机检状态，不是测试结果。Task 12 Step 1 必须先用新冻结 candidate 的 literal 40-character SHA 替换 Candidate 行并写开始时间，Step 8–11 再把其余 sentinel 全部替换为实际证据；最终报告不能保留任何 `NOT_*_PRE_CANDIDATE`，也不能把未运行写成 PASS。报告不记录自己的 Evidence commit SHA，因为 commit 无法自包含自身 hash；report-only commit 完成后，由 master Task 9 coordinator evidence、`agent-runtime` gate record 和 Task 10 handoff 文件记录该 literal SHA。

同一步创建 `2026-08-20-v1-visual-agent-provider-research.md`，从各 adapter/provider work-package evidence 汇总：官方 URL、文档/协议版本或 commit/tag、核对日期、采用的 transport/catalog endpoint、成熟度、已知 capability gap、负责 adapter 和下次复核触发条件。至少覆盖 OpenClaw Gateway、Codex exec/App Server、Cursor ACP/Cloud Agents、DeepSeek Harness、Hermes ACP/TUI/API，以及 11 个 provider preset 的模型目录策略。该研究记录必须在 candidate 前填完并提交；禁止在验收期临时改变协议假设。

- [ ] **Step 7: Commit tests and report skeleton**

```bash
git add AwesomeProject/src/__tests__/integration/RuntimeChannelEndToEnd.test.ts \
  AwesomeProject/src/__tests__/integration/RuntimeRecoveryAndConcurrency.test.ts \
  AwesomeProject/src/__tests__/integration/UiReleaseArchitectureGuard.test.ts \
  docs/superpowers/reports/2026-08-20-v1-ui-integration-and-acceptance-verification.md \
  docs/superpowers/reports/2026-08-20-v1-visual-agent-provider-research.md
git commit -m "test: add V1 unified integration acceptance"
```

---

### Task 12: Build Both Platforms, Execute Device Paths, and Sign PASS/FAIL/WAIVED

**Mode:** Wave 4；独立 testing Agent执行，集成 Agent只修复已复现问题；评审 Agent基于同一 frozen SHA。

**Files:**

- Modify: `docs/superpowers/reports/2026-08-20-v1-ui-integration-and-acceptance-verification.md`（只填真实证据）

**Interfaces:**

- Consumes: Task 11 report、`V1_CANDIDATE_REF` 指向的一个 frozen candidate code SHA、由该 exact SHA 构建的 debug APK 与 iOS workspace。
- Produces: `PASS`、`FAIL` 或 `WAIVED` 的唯一结论；agent-workflow test/review evidence。

- [ ] **Step 1: Freeze and record the unified Candidate code SHA**

```bash
: "${V1_CANDIDATE_REF:?export the exact immutable candidate branch, for example codex/checkpoint-v1-candidate}"
candidate_sha=$(git rev-parse "$V1_CANDIDATE_REF")
test "$(git rev-parse HEAD)" = "$candidate_sha"
git status --short
git rev-parse "$V1_CANDIDATE_REF"
git diff --check
agent-runtime status --json
```

Expected: HEAD 精确等于 `V1_CANDIDATE_REF`；git status 无输出；`git diff --check` exit 0；把完整 `candidate_sha` 写入 report 的 Candidate code SHA。首次验收导出 `V1_CANDIDATE_REF=codex/checkpoint-v1-candidate`；后续任何 code fix 都创建并导出新的 suffixed candidate ref，使此前全部候选验收证据失效；先重建 APK/iOS artifact，再重跑 Task 11 全门禁和全部 required device rows，禁止把不同 code SHA 的证据拼成一份验收。

- [ ] **Step 2: Build and test Android**

```bash
cd AwesomeProject/android
./gradlew :app:testDebugUnitTest :app:compileDebugKotlin :app:assembleDebug --stacktrace
```

Expected: `BUILD SUCCESSFUL`；APK 位于 `AwesomeProject/android/app/build/outputs/apk/debug/app-debug.apk`。任何 compile/test failure 是 `FAIL`，不能因有 iOS PASS 而 waiver。

- [ ] **Step 3: Install on the Xiaomi 9 and prepare clean evidence**

```bash
adb -s c99afdd6 get-state
adb -s c99afdd6 shell getprop ro.build.version.release
adb -s c99afdd6 install -r AwesomeProject/android/app/build/outputs/apk/debug/app-debug.apk
adb -s c99afdd6 shell pm clear com.awesomeproject
adb -s c99afdd6 logcat -c
adb -s c99afdd6 shell am start -n com.awesomeproject/.core.MainActivity
```

Expected: device；install `Success`；package clear `Success`；Activity starts。若设备不在线，相关 Android real-device rows 标 `WAIVED`，reason 写 exact adb error、影响、owner 与补验日期；Android build 仍必须执行。

- [ ] **Step 4: Execute the Android real-user path matrix**

逐项记录屏幕录像/截图时间和 logcat anchor：

1. 冷启动：builtin 3D 先显示，导航 Home/能力/活动/设置均可达，无白屏。
2. 陪伴：点角色 → 请求麦克风 → 说普通问题；只产生对话 reply，logcat/测试 spy 无截图和动作。
3. 拒麦克风：显示“需要麦克风才能说话”，不出现演示句、不启动操作。
4. 云端一体：可运行时激活并创建 task/session；运行中改 draft 不改变当前 session revision。
5. 双云端：planner evidence 只有结构化脱敏观察，无 image/data URI。
6. 本地视觉：包 ready 时运行；人为使本地推理失败，任务停止且 cloud perception/direct 调用为零。
7. 不可运行模式：删除/禁用所需 model 或本地包，激活按钮 disabled 并显示 exact blocker。
8. 模型模式与厂商：Add/Edit 顶层只显示“热门厂商 / 完全自定义”；逐项确认 OpenAI、Anthropic、Gemini、DeepSeek、xAI、百炼 Qwen、智谱、Kimi、MiniMax、火山 Doubao，ModelScope 标为兼容；API Key Guide 与选择器使用同一顺序和 canonical ID，外链只打开 preset allowlist HTTPS host；无硬编码 chips；统一/视觉/编排/本地编排/陪伴列表可按 bindingId 选择、编辑、删除并在 revision 冲突时安全刷新。
9. 模型目录：用当前凭证分别制造 loading/ready/unsupported/auth_failed/network_failed/empty；每态文案不同且均可手输 ID；快速 OpenAI → Anthropic 切换并让旧请求后返回，最终目录/选择仍属于 Anthropic，旧响应记为 stale。
10. 模型凭据：编辑页不显示旧 secret；keep 保存不改 CredentialStore，replace 用 sentinel 后输入框立即清空并提交旧 ref retirement，remove 二次确认后 CAS 为 null 并提交 retirement；运行中 task 仍能使用快照旧 ref。结束 task、冷启动后确认 GC 才删除无引用旧 ref；页面返回、日志和 app-private scan 均无 sentinel 明文。
11. 自定义模型：custom 可输入 provider label/base URL/任意 model ID 并保存；重新进入显示非敏感配置但不回填 credential；catalog unsupported/network failure 不阻止手输 ID 保存。
12. 视觉工具 profiles：分别用 Connector Bridge URL + binding ID 创建 OpenClaw、Codex、Cursor、dsh、Hermes 五个 profile 并保留多个；编辑页不回填 Bridge secret，keep 不写 CredentialStore，replace 使用 sentinel 后立即清空且只写一次新 ref + retirement，remove 二次确认、CAS 为 null + retirement，并使 profile 在需要认证时不可运行；非终态 task 仍能使用快照旧 ref，结束 task 后下一次冷启动 GC 才删除它。逐卡核对 readiness、maturity、image input、structured action、stream、approval、cancel、steer、resume、preferences；选择 active 后重启仍保持，日志/ViewState/app-private scan 无 sentinel 明文。
13. 视觉工具 fail-closed：对五个 built-in adapters 分别制造缺 image input、缺 structured action、disconnected；Home 均显示 blocked，所有 local/cloud fallback provider 调用为零，Companion 仍回复。
14. 视觉工具 snapshot：在 source config revision 3 以 OpenClaw profile 启动任务，运行中编辑该 profile 并切 active 到 Cursor；当前 task 继续显示/使用原 profileId、toolId、capabilities 与 sourceConfigRevision 3，下一 task 才使用 Cursor；supported approval/cancel/steer/resume 能执行，不支持项 disabled。
15. OpenClaw route alias：旧 OpenClaw deep link 只跳到 canonical VisualAgentTools 的 OpenClaw preset；返回栈、状态、埋点没有第二份 OpenClaw owner。
16. 交代 once：确认 proposal 后活动页出现；两个 due sweep 只执行一次；成功后进入完成历史。
17. 交代 schedule：成功推进 next due；失败保留并显示失败状态；编辑/取消操作真实仓储。
18. 取消：通知栏或 Home 取消 exact taskId；其他任务历史、errand lease、Companion 状态不变。
19. 前后台：运行时 Home → 其他 app → Home；只有一个 runner owner，终态和成功/失败提示各一次。
20. Activity：Preference、Errand、Task 三组来自真实数据；清空后无 seed 数据重新出现。
21. Avatar：确认下载后才请求网络；SHA/manifest fail 回滚 builtin；飞行模式冷启动仍为 3D。
22. ASR：飞行模式使用 builtin Zipformer；Wi-Fi upgrade 可静默 ready；移动网络不下载 upgrade；损坏 upgrade 回退 builtin。

完成后导出过滤日志：

```bash
adb -s c99afdd6 logcat -d -v threadtime | rg "NonoTaskEventV1|NonoTaskCancelRequestedV1|OperateTaskRunner|visual_agent_not_ready|visual_agent_capability_missing|local_model_not_ready|model_catalog|avatar-load-failed|engine_failed"
```

Expected: task events 每条带 exact taskId/sessionRevision/sequence；没有 raw instruction、API key、Authorization、截图/data URI、provider response。

- [ ] **Step 5: Scan app-private Android persistence for a sentinel and forbidden payloads**

先用测试凭据 `nono-acceptance-secret-7f3d1a` 配置一个模型并执行最小路径，然后运行：

```bash
adb -s c99afdd6 shell run-as com.awesomeproject sh -c \
  'toybox grep -R -n -E "nono-acceptance-secret-7f3d1a|Bearer |data:image|modelResponse|finalScreenshot|screenshotUri" shared_prefs files 2>/dev/null; scan_status=$?; [ "$scan_status" -eq 1 ]'
```

Expected: exit 0、无输出。CredentialStore ciphertext/alias 可以存在，但 sentinel 明文不得出现。命中任何明文为 `FAIL`，需删除测试 secret、修复、重装清数据并重跑。

- [ ] **Step 6: Install iOS dependencies and compile simulator target**

```bash
cd AwesomeProject
bundle install
cd ios
bundle exec pod install
cd ..
xcodebuild -workspace ios/AwesomeProject.xcworkspace \
  -scheme AwesomeProject \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Expected: pod install succeeds and xcodebuild ends `** BUILD SUCCEEDED **`。Xcode/CocoaPods/network unavailable may be `WAIVED` only with exact command error、impact、owner、follow-up date；source compile error is `FAIL`。

- [ ] **Step 7: Run iOS tests and smoke the supported scope**

```bash
cd AwesomeProject
xcodebuild -workspace ios/AwesomeProject.xcworkspace \
  -scheme AwesomeProject \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  CODE_SIGNING_ALLOWED=NO \
  test
```

Expected when the named simulator exists: `** TEST SUCCEEDED **`。Smoke：App 启动、builtin Avatar 显示、导航和真实 ViewState 页面不崩溃、CredentialStore/通知 exact task identifier 编译路径有效。Android-only ASR/可下载 Avatar rows 标 `WAIVED`，reason 为本版明确范围，不把它们写成 iOS PASS。

- [ ] **Step 8: Have the independent testing Agent finalize the report**

testing Agent 必须记录：test plan、全部命令/exit、用户路径 actual、设备/OS、日志 anchors、gaps，并按以下规则给唯一结果：

- `PASS`：所有 release-required 自动化、隐私扫描、Android build、Android 真机和 iOS build均通过；仅允许“本版明确 Android-only”的 iOS ASR/下载 Avatar 行保持已批准 scope waiver。
- `FAIL`：任一 required test/build/privacy/device path 失败、存在 P0/P1 finding、任一证据的 code SHA 与 Candidate code SHA 不同、或 waiver 缺 owner/date。
- `WAIVED`：没有已知失败，但一个 release-required 环境 gate 因真实外部环境不可运行，且报告完整记录影响、负责人和补验日期。未安装依赖、命令写错、代码编译失败不能用 WAIVED 掩盖。

- [ ] **Step 9: Record the agent-workflow testing gate**

```bash
agent-runtime test-gate --record docs/superpowers/reports/2026-08-20-v1-ui-integration-and-acceptance-verification.md
agent-runtime research --record docs/superpowers/reports/2026-08-20-v1-visual-agent-provider-research.md
```

Expected: test gate recorded for current candidate/report worktree；research gate points to the pre-candidate immutable protocol/provider record, whose anchors and checked versions match the adapters/catalog strategy actually present in the Candidate code SHA。若官方协议在 candidate 后变化，只记录 drift finding and FAIL/WAIVED decision；不得在验收分支修改 adapter 后继续复用旧 candidate evidence。

- [ ] **Step 10: Run Kimi K3-first review against the unchanged Candidate code SHA**

```bash
git status --short
git rev-parse HEAD
git diff --name-only "$V1_CANDIDATE_REF"
agent-runtime review
```

Expected: report 尚未提交时 status 只能包含该 report；先用 `git diff --name-only "$V1_CANDIDATE_REF"` 验证仅报告变化，再让 review 明确以 report 中记录的 Candidate code SHA 为代码输入；review 无 unresolved P0/P1。两轮同一 snapshot 仍有 finding 时必须修改实现或把 finding 写入 FAIL，禁止重复 review 直到模型同意。

- [ ] **Step 11: Re-run after any review fix and commit final report facts**

若修复代码：先写复现测试、提交单独 fix，把该 commit 冻结为新的 suffixed candidate branch，`export V1_CANDIDATE_REF=<该新分支>`，从 Step 1 重跑 Task 11 full gate + Android/iOS build + 全部 required device path，更新 report，再重新记录 test gate/review。禁止只重跑“受影响”子集。每次 Task 12 只在最后提交一次 report；master Task 9 Step 7 只读验证，不再提交。最后：

```bash
: "${V1_CANDIDATE_REF:?export the exact immutable candidate branch}"
candidate_sha=$(git rev-parse "$V1_CANDIDATE_REF")
test "$(git rev-parse HEAD)" = "$candidate_sha"
git add docs/superpowers/reports/2026-08-20-v1-ui-integration-and-acceptance-verification.md
git commit -m "docs: record V1 integration acceptance evidence"
evidence_commit_sha=$(git rev-parse HEAD)
git status --short
test "$(git rev-parse "$evidence_commit_sha^")" = "$candidate_sha"
git diff --name-only "$V1_CANDIDATE_REF".."$evidence_commit_sha"
agent-runtime status --json
```

Expected: report 的 required 字段均为实际证据且无 `NOT_*_PRE_CANDIDATE`；确实不可执行的环境项已转成带 reason/impact/owner/date 的 `WAIVED` row；report-only commit 后，diff 精确只有 verification report。将 literal `evidence_commit_sha` 保存到 coordinator evidence，供 master Task 10 的 handoff 文件写入，不 amend 自引用的 report commit；agent-runtime gate/status 清楚关联 code candidate 与 evidence commit。若 gate 按 changeHash 包含报告变化，对 Evidence commit 再运行 review/test-gate，但所有代码行为结论仍只引用同一 Candidate code SHA。

---

## Unified Acceptance Matrix

| ID | 场景 | 自动化 | Android 真机 | iOS | PASS 条件 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| NAV-1 | Root → MainTabs → Capabilities | `AppNavigatorTyping.test.tsx` + `tsc` | 四 Tab/回退 | 四 Tab/回退 | 无 TS2769，无伪 Root route | test output + screen record |
| HOME-1 | Home 无 demo、只接 Facade | architecture guard + Home integration | 无假话轮 | 无假话轮 | source guard 无命中，Facade calls exact | Jest + `rg` |
| HOME-2 | Companion 普通对话 | Companion facade test | 无 screenshot/action | 支持文本/页面不崩 | reply-only、zero operation calls | spy counts + log |
| HOME-3 | proposal confirmation | Companion/Errand tests | 确认前不落盘 | 同逻辑 | exactly one repository mutation | repository trace |
| OP-1 | cloud direct | runtime channel E2E | 完整一条任务 | build/supported smoke | direct=1，其他 pipeline=0 | Jest + event log |
| OP-2 | cloud split | runtime channel E2E | 完整一条任务 | build | planner 无原图 | sanitized payload evidence |
| OP-3 | local vision | local failure test | 成功/失败各一次 | scope waiver | screenshot 不离机，失败 zero cloud | provider counts + network/log |
| MODE-1 | 不可运行模式 | PhoneOperate ViewState test | 按钮 disabled | 页面一致 | blocker visible，activate=0 | Jest + screen record |
| MODE-2 | 运行中改配置 | recovery test | session revision 不变 | build | 只影响新 task | session dump/trace |
| MODEL-1 | preset/custom 与厂商 registry | ModelConfig ViewState + architecture guard | Add/Edit/Guide 完整 preset + custom | 页面一致 | 顶层仅两模式；10 热门厂商 + ModelScope compatibility；Guide canonical ID/allowlist 一致；无硬编码 chips | Jest + screen record + `rg` |
| MODEL-2 | 当前凭证目录与手输 ID | catalog typed-result tests | 七态逐态显示 | 页面一致 | loading/ready/unsupported/auth_failed/network_failed/empty/stale 不折叠；每态可手输 | Jest + UI/log |
| MODEL-3 | 快速切换目录竞态 | deferred race test | OpenAI → Anthropic 旧响应后到 | 页面一致 | 只接受最新 requestGeneration，旧响应 stale 且不覆盖 | Jest trace + screen record |
| MODEL-4 | credential edit intent | Facade/form/privacy/GC tests | keep/replace/remove + sentinel；结束 task 后冷启动 | Keychain compile/smoke | 不回填明文；三种 intent exact；旧 ref retirement；live-session pin；cold-start GC；持久/日志/UI zero plaintext | spy counts + sentinel scan |
| MODEL-5 | immutable provider protocol dispatch | SnapshotAgentRuntime + RuntimeChannel E2E | OpenAI-compatible/Anthropic/Gemini/custom 各一次最小运行 | build | exact registry transport=1，其他 transport=0，运行期 live config read=0，transport-ID mismatch 在 I/O 前失败 | Jest transport spies + sanitized trace |
| VA-1 | 多 profile 与 active selection | VisualAgentTools Facade/Screen tests | 保存多个、重启保持 active | 页面一致 | expected revision mutation；唯一 active；OpenClaw route 仅 alias | repository trace + navigation test |
| VA-2 | 五 built-in adapter metadata | registry projection test | 五张卡逐项核对 | 页面一致 | OpenClaw/Codex/Cursor/dsh/Hermes 均显示 readiness/maturity 和完整 canonical capabilities | registry snapshot + video |
| VA-3 | mandatory capability gate | five-adapter E2E matrix | 缺 image/structured action | build | blocked；所有 fallback calls=0；Companion usable | provider counts + UI/log |
| VA-4 | disconnect 与 optional actions | five-adapter E2E + action tests | disconnected/error；approval/cancel/steer/resume | build | disconnect zero fallback；支持项可用、不支持项 disabled | calls + action trace + UI |
| VA-5 | immutable task profile snapshot | recovery/concurrency test | 运行中编辑/切 active | build | 当前 task profileId/sourceConfigRevision/toolId/capabilities 不变，新 task 才更新 | session snapshot + repository trace |
| VA-6 | Connector Bridge profile credential intent | Facade/controller/form/GC tests | Bridge URL + binding ID；keep/replace/remove + sentinel；结束 task 后冷启动 | 页面一致 | secret 不回填；CAS/retirement exact；live-session pin；失败只清新 ref；cold-start GC 后删旧 ref；持久/日志/UI zero plaintext | credential spy + sentinel scan |
| ERR-1 | once 并发 sweep | concurrency test | 只执行一次 | build | one lease/one terminal | repository trace |
| ERR-2 | schedule retry/advance | scheduler tests | success/failed | build | success advances，failed retains | state snapshots |
| PRIV-1 | memory location | Privacy ViewState test | device/visual-agent profile blocker | 页面一致 | UI 与 config/policy一致 | Jest + UI |
| PRIV-2 | credential/screenshot/raw response | architecture guard + shell scan | app-private sentinel scan | build | zero plaintext/leak | command exit + excerpt |
| ACT-1 | three-source Activity | Activity test | preference/errand/task真实数据 | 页面一致 | no seeds，commands refresh | Jest + screen record |
| EVT-1 | task-scoped event | TaskUiEvents test | task/session/sequence | compile | foreign/duplicate ignored | Jest + log anchors |
| EVT-2 | exact cancel | cancel/recovery test | Home/通知 cancel exact task | compiled identifier | no `current`/wildcard | source scan + event log |
| BG-1 | foreground/background owner | Headless/recovery tests | 切后台/恢复/取消 | scope-limited build | one runner、one terminal | claim/terminal trace |
| ASR-1 | permission/builtin/upgrade | ASR + Home tests | 小米 9 all paths | Android-only WAIVED | no demo/system ASR；correct fallback | Jest + device log |
| AV-1 | builtin/download/hash rollback | Avatar tests | 飞行/下载/损坏 | builtin smoke，download WAIVED | no CDN/remote JS；rollback 3D | Jest + video/log |
| BUILD-A | Android build/test | Gradle tasks | APK installs | N/A | `BUILD SUCCESSFUL` | Gradle log |
| BUILD-I | iOS build/test | xcodebuild | N/A | simulator build/test | build succeeded or honest environment waiver | xcodebuild log |
| GATE-1 | unified candidate code SHA | status + artifact hashes | exact Candidate code SHA | exact Candidate code SHA | automation、两端 build、真机、privacy、test gate、Kimi review 全部针对同一 code SHA；evidence commit 只改报告 | agent-runtime status + report-only diff |

## Failure and Rollback Rules

| Failure point | Immediate action | Rollback | Resume condition |
| --- | --- | --- | --- |
| Wave 1 worker越权改热点 | 拒绝 cherry-pick | worker 重做单一 commit | diff 只含 owned files |
| Facade contract冲突 | 停止三 worker，集成 Agent裁决 Task 1 | revert dependent worker commits，不建双接口 shim | contract test + tsc green |
| cherry-pick conflict | `git cherry-pick --abort` | 原 worker基于最新 checkpoint重放 | conflict-free commit + same tests |
| Task 6/8/9 Screen regression | 不进入下一 Task | 刚提交即失败时执行 `git revert HEAD` | targeted UI + tsc green |
| model catalog 竞态/状态折叠 | 阻止 model UI 签发，不用 empty 掩盖 | revert Task 6 model wiring commit | 七态 + deferred race + manual ID tests green |
| visual tool profile/capability 漏门禁 | 立即停止任务，记录 zero-fallback 失败 | revert Task 9 UI；若 session snapshot 错误退回 runtime checkpoint | 五 adapter matrix + immutable snapshot test green |
| Task 7 JS/native mismatch | 禁止部分回滚/发布 | 整体 revert Task 7 atomic commit | JS/Jest + Android compile + iOS compile green |
| Headless/persistence隐私命中 | 立即 FAIL，清测试 secret | revert offending work package；保留旧安全格式 | sentinel scan zero hit + migration replay pass |
| session/config migration失败 | fail-closed，旧数据 byte-for-byte 保留 | revert migration commit；禁止清 key | retry/idempotence test pass |
| local vision/Avatar/ASR包失败 | 停任务或回 builtin | revert对应 domain commit；不影响 cloud runtime | focused pack tests + device path pass |
| Android真机不可用 | 不声称 PASS | 无代码 rollback | WAIVED 记录 owner/date 后补验 |
| iOS环境不可用 | 保留 exact command error | 无代码 rollback | WAIVED 或换可用 Mac 重跑 |
| P0/P1 review finding | 阻止 PR/merge | fix commit 或 revert相关 Task | RED/GREEN + full re-gate + review clean |

不要删除 worker branch/worktree，直到最终 report 签发且 final SHA 的 agent-workflow gates 有效。回滚顺序按 Task 11 → Task 10 → Task 9 → Task 8 → Task 7 → Task 6 → Task 5 逆序执行；Task 2-Task 4 可独立 revert，但 Task 5 composition 必须同步调整。

## Evidence Artifact Checklist

- [ ] Product base full SHA：`9ff7ba4cc4dc186b79b6e62181333ae6c9132f54`
- [ ] Runtime checkpoint full SHA
- [ ] 每个 Task base/commit SHA 与 owned-file list
- [ ] 每个 RED command、failure excerpt、GREEN command、exit code
- [ ] TypeScript、full Jest、lint、Prettier outputs
- [ ] Android Gradle test/compile/assemble output 与 APK path/hash
- [ ] iOS pod/xcodebuild output 或完整 WAIVED record
- [ ] Android device/OS、screen recording timestamps、logcat anchors
- [ ] Privacy static scans 与 app-private sentinel scan exit 0
- [ ] Session revision、event sequence、claim/terminal、errand lease traces
- [ ] MODEL-1..5 的 preset registry、目录七态/requestGeneration race、manual ID、credential intent/sentinel、immutable protocol dispatch 证据
- [ ] VA-1..6 的多 profile/active、五 adapter metadata/capabilities、Bridge profile credential intent、zero fallback、immutable snapshot 与 route alias 证据
- [ ] ASR engine/fallback/network evidence；Avatar hash/rollback/CDN-zero evidence
- [ ] `docs/superpowers/reports/2026-08-20-v1-ui-integration-and-acceptance-verification.md`
- [ ] `agent-runtime test-gate` record
- [ ] Kimi K3-first review result and resolved findings
- [ ] Candidate code SHA 对应全部代码验收；Evidence commit 与 candidate diff 只含 verification report；final `agent-runtime status --json` 同时记录二者

## Completion Gate

- 所有 Facade/ViewState contracts only have one canonical definition。
- Task 2-Task 4 是唯一并行 coding wave；Task 5 以后所有热点由同一集成 Agent 串行修改。
- Home 无 `DEMO_TURNS`、ModelService/NonoConfigService/TaskHistoryService、旧 hooks、global DeviceEventEmitter 或双 execution owner。
- PhoneOperate 三模式真实可运行性决定激活；不可运行明确 blocked，不回退。
- Add/Edit 通过唯一 `ModelConfigFacade/ViewState` 接通 selectors/catalog；顶层只有 preset/custom，完整厂商 registry + ModelScope compatibility、目录七态、manual ID 与 keep/replace/remove 均有证据，secret 不回填且旧目录响应不能覆盖新选择。
- `VisualAgentToolsFacade/ViewState/Screen` 是唯一视觉工具 UI 抽象；OpenClaw 仅 preset + 一版 route alias；五 built-in adapters、多个 profiles、唯一 active、readiness/maturity/capabilities、mandatory capability gate、disconnect zero fallback 与 task-owned immutable snapshot 均有证据。
- Errand、Privacy、Capabilities、Activity 均来自真实 ViewState，无 seed/static capability promise。
- 所有 UI/cancel/notification events 带 exact taskId/sessionRevision；progress events 还带单调 sequence；无 `current` wildcard。
- ASR final 经过 Companion Facade 意图路由；Avatar/ASR领域产物按既有计划接入且共享热点没有被 worker 覆盖。
- Full automated gates、privacy scans、Android build、iOS build和要求的 Android真机路径均得到真实 PASS/FAIL/WAIVED 证据。
- 独立 testing Agent、Kimi K3-first review、自动化、平台构建和真机矩阵针对同一 Candidate code SHA；Evidence commit 只允许修改验收报告；存在 required FAIL 或 unresolved P0/P1 时最终只能签 `FAIL`。
