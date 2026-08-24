# V1 Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在严格保留 V1 `9ff7ba4cc4dc186b79b6e62181333ae6c9132f54` UI 的前提下，选择性移植已验证的 phase1 Runtime 基础，并建立彼此独立的模型端点/角色绑定与视觉代理配置、安全凭据、版本化运行配置、不可变任务 session、唯一操作 runner、统一前后台/Headless 适配、串行任务历史与日志脱敏闭环。

**Architecture:** `AgentRuntime` 只负责一次“观察/推理 → 校验 → 旧动作 DTO 映射”，`OperateTaskRunner` 是唯一持有多步循环的 owner；模型 API 由 provider registry、协议 transport、凭据/区域感知 catalog、endpoint profile repository 和 role binding 组成，视觉工具由独立 `visualAgent` profile/adapter 配置组成，二者只在 session resolution 时汇合。`RuntimeConfigRepository` 原子管理 active/draft 配置，`OperateSessionStore` 在任务开始时持久化不可变的非敏感快照。前台与 Headless 只负责各自生命周期并调用同一 `OperateRuntime`/runner，任务指令从 `TaskRepository` 按 `taskId` 读取，Headless payload 不携带指令、模型或凭据。

**Tech Stack:** React Native 0.73.6、React 18.2、TypeScript 5.0.4、Jest 29.6.3、AsyncStorage 1.21、Android Kotlin/Keystore、iOS Objective-C/Keychain；不新增 npm 依赖。

**Primary Spec:** `docs/superpowers/specs/2026-08-20-v1-feature-gap-parallel-agent-delivery-design.md`

**Supporting Plan:** `docs/superpowers/plans/2026-08-19-nono-runtime-channel-refactor.md`

**Verified Donor:** `/private/tmp/a2a_ai_mobile-agent-runtime-phase1` at `ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b`

## Global Constraints

- 实现基线必须是 clean worktree 中的 V1 `9ff7ba4cc4dc186b79b6e62181333ae6c9132f54`；当前主工作树已有用户未提交文件，任何实现者不得在该 dirty tree 上执行移植或批量写入。
- 禁止 merge `codex/agent-runtime-phase1`，禁止 cherry-pick `e5bdbe1`；该提交修改 106 个文件并覆盖旧 UI，只允许按本计划列出的文件和行为选择性移植。
- phase1 提交和临时目录是移植来源，不是 V1 行为证明；每个移植包都必须在 V1 上重新经历 RED → GREEN 和 TypeScript/平台编译验证。
- 保留 V1 首页、能力页、设置、3D 角色和导航；本计划不实现真实 Companion/ASR、Errand 调度、OpenClaw 网络协议、模型配置 UI 接线或 Avatar 下载包。
- Companion 永不截图、永不执行设备动作；本计划不得把运行时能力接入 Companion 演示链。
- 一个 `taskId` 只能绑定一个 `ResolvedOperateSessionV1`；任务创建后配置、模型和密钥变化不能改变该 session。
- `OperateTaskRunner` 是唯一生产“截图 → 推理 → 校验 → 确认 → 动作 → 观察”循环；Hook、Headless、Screen 和兼容 `TaskExecutionEngine` 不得保留第二套循环。
- `visualAgent.enabled` 时必须通过 active profile 的 canonical `toolId + connector` 连接；registry、能力协商、认证、协议或连接失败只返回稳定 `visual_agent_*` 错误，禁止产生 `openclaw_*` 新错误或回退到模型 direct/split pipeline。
- 本地视觉不可用、推理失败或输出不合法时返回 `local_perception_unavailable`，云端视觉和 direct provider 调用次数必须为零。
- Headless task data 必须精确为 `{taskId, sessionRevision}`；不得出现 `instruction`、`model`、`apiKey`、`baseUrl`、截图或 provider response。
- 新 runtime 边界中的 API Key 只允许以瞬时输入、`CredentialStore` 方法参数或 provider 请求局部变量存在；RuntimeConfig/catalog cache/Task/session/事件/日志/错误/Headless payload 中只能保存 `secretRef`。现有 V1 model screen/service DTO 与 storage helper 是隔离的 legacy writer，本计划不读取它们执行任务；后续 UI 接线计划必须删除该例外，完成前不得把 foundation checkpoint 当作可发布的凭据闭环。
- 模型端点 profile 的配置模式只能是 `preset | custom`；“手动模型 ID”是 catalog 输入回退，不得成为第三种 profile mode。
- provider 模型目录表示“当前凭证、区域和渠道可用的模型”，不是厂商营销页的全局全集；远程目录必须完整遍历官方分页并用签名静态元数据补充能力，没有官方 list endpoint 时只能使用签名静态目录并允许手动 model ID。
- Android 使用 Keystore，iOS 使用 Keychain；任一平台安全存储不可用时 fail-closed，不允许 plaintext fallback。
- 所有历史写入通过一个串行 mutation queue；同一 `taskId` 幂等，`success`/`failed` 终态不可逆，查询按主任务列表派生，不维护易失配的二级 AsyncStorage 索引。
- 所有日志在传给平台 console、内存日志和 AsyncStorage 之前先经同一个 `sanitizeLog`；敏感字段、Authorization、data URI、截图、完整 instruction、完整 provider response 和 `Error.stack` 不得落盘。
- 每项生产行为必须先有会因缺失行为而失败的测试，再写最小实现；禁止通过删除断言、放宽 schema、跳过目录、吞掉损坏配置或添加任意 sleep 获绿。
- 不新增依赖；不得通过整仓格式化、无关重构或删除 V1 测试扩大改动面。
- 每个 Task 形成一个可独立审查和 revert 的 commit；commit 命令是后续执行说明，本计划编写阶段不执行 commit。

---

## Baseline And Donor Evidence

### Frozen SHAs

| Role | SHA | Meaning |
| --- | --- | --- |
| V1 target | `9ff7ba4cc4dc186b79b6e62181333ae6c9132f54` | 唯一允许的产品/UI 基线 |
| Branch merge-base | `380af4da82e9802c7dc293d9f87303fe5f071264` | 说明 V1 与 phase1 已分叉，不能整分支合并 |
| phase1 final | `ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b` | 纯新增文件取最终内容的 source SHA |
| execution donor | `e5bdbe1dd9c15fb4e0d5d1bafc62a97ae76f26a3` | 唯一 runner/适配器/历史/日志的行为与测试来源；禁止整提交移植 |

### Verified phase1 commands

在 donor worktree 上已于 2026-08-20 复验：

```bash
cd /private/tmp/a2a_ai_mobile-agent-runtime-phase1/AwesomeProject
npm test -- --runInBand --no-cache src/__tests__/core/engine/agentRuntime
```

Expected: `Test Suites: 14 passed, 14 total`；`Tests: 147 passed, 147 total`。

```bash
cd /private/tmp/a2a_ai_mobile-agent-runtime-phase1/AwesomeProject
npm test -- --runInBand --no-cache \
  src/__tests__/engine/TaskExecutionEngine.test.ts \
  src/__tests__/services/TaskExecutionRuntime.test.ts \
  src/__tests__/services/ForegroundTaskExecutionAdapter.test.ts \
  src/__tests__/services/HeadlessTaskExecutionAdapter.test.ts \
  src/__tests__/services/HeadlessTaskSessionCoordinator.test.ts
```

Expected: `Test Suites: 5 passed, 5 total`；`Tests: 88 passed, 88 total`。

### Exact phase1 provenance

| Commit chain | Allowed use in this plan | Explicit exclusion |
| --- | --- | --- |
| `4384ab4` → `2963cf8` → `7bb37b5` | action validator/adapter、direct/split providers、pipeline、`AgentRuntime` final files | 不移植 UI 或旧 `ModelInferenceModule` 路由 |
| `d130aee` → `0960537` → `86b15a2` | TS `CredentialStore`、Android secure bridge/storage final files | 不移植 phase1 `ModelService.toAIModel()`；它会重新暴露 plaintext key |
| `8d3ccfe` → `25809d6` → `58e3ac9` → `a0e025c` → `7299b72` → `99a4d8a` | local-model eligibility/store/download safety final files | 不宣称 MiniCPM artifact/JNI 已可用；unavailable operations 必须 fail-closed |
| `4463984` → `95d62d8` → `6b7befa` → `ce9e4a6` | config domain/controller、atomic activation、storage validation的实现思路与纯新增文件 | V1 有五个模型列表和更多配置键，不能原样使用 donor 的单列表 legacy migration |
| `7867991` | 原生模块注册的最小 hunk、unavailable local operations | 不覆盖整个 `AccessibilityPackage.kt` |
| `e5bdbe1` | engine/adapters/history/log tests、取消/terminal/lifecycle 行为、串行历史实现 | 不 restore Screen、Hook、原生生命周期或 package 文件的完整版本 |

## Exact File Graph

### Pure files copied from phase1 final state, then verified unchanged

`Task 1` owns the following production files:

```text
AwesomeProject/src/core/engine/agentRuntime/adapters/TaskActionAdapter.ts
AwesomeProject/src/core/engine/agentRuntime/contracts/AgentContracts.ts
AwesomeProject/src/core/engine/agentRuntime/contracts/PlannerPayload.ts
AwesomeProject/src/core/engine/agentRuntime/domain/AgentConfigMigration.ts
AwesomeProject/src/core/engine/agentRuntime/domain/AgentConfigState.ts
AwesomeProject/src/core/engine/agentRuntime/domain/AgentConfigValidation.ts
AwesomeProject/src/core/engine/agentRuntime/domain/AgentTypes.ts
AwesomeProject/src/core/engine/agentRuntime/domain/index.ts
AwesomeProject/src/core/engine/agentRuntime/index.ts
AwesomeProject/src/core/engine/agentRuntime/pipelines/DirectAgentPipeline.ts
AwesomeProject/src/core/engine/agentRuntime/pipelines/SplitAgentPipeline.ts
AwesomeProject/src/core/engine/agentRuntime/policy/ActionDecisionValidator.ts
AwesomeProject/src/core/engine/agentRuntime/policy/ActionPolicy.ts
AwesomeProject/src/core/engine/agentRuntime/providers/CloudPerceptionProvider.ts
AwesomeProject/src/core/engine/agentRuntime/providers/OpenAICompatibleDirectProvider.ts
AwesomeProject/src/core/engine/agentRuntime/providers/OpenAICompatiblePlannerProvider.ts
AwesomeProject/src/core/engine/agentRuntime/providers/OpenAICompatibleTransport.ts
AwesomeProject/src/core/engine/agentRuntime/runtime/AgentRuntime.ts
AwesomeProject/src/core/engine/agentRuntime/runtime/AgentRuntimeFactory.ts
```

`Task 1` owns matching tests under:

```text
AwesomeProject/src/__tests__/core/engine/agentRuntime/adapters/TaskActionAdapter.test.ts
AwesomeProject/src/__tests__/core/engine/agentRuntime/domain/AgentConfigMigration.test.ts
AwesomeProject/src/__tests__/core/engine/agentRuntime/domain/AgentConfigState.test.ts
AwesomeProject/src/__tests__/core/engine/agentRuntime/domain/AgentConfigValidation.test.ts
AwesomeProject/src/__tests__/core/engine/agentRuntime/pipelines/DirectAgentPipeline.test.ts
AwesomeProject/src/__tests__/core/engine/agentRuntime/pipelines/PlannerPrivacy.test.ts
AwesomeProject/src/__tests__/core/engine/agentRuntime/pipelines/ProviderAdapters.test.ts
AwesomeProject/src/__tests__/core/engine/agentRuntime/pipelines/SplitAgentPipeline.test.ts
AwesomeProject/src/__tests__/core/engine/agentRuntime/policy/ActionDecisionValidator.test.ts
AwesomeProject/src/__tests__/core/engine/agentRuntime/runtime/AgentRuntime.test.ts
AwesomeProject/src/__tests__/core/engine/agentRuntime/runtime/RuntimePrivacy.test.ts
```

### Credential and local-model native boundary

`Task 2` owns:

```text
AwesomeProject/src/core/engine/agentRuntime/credentials/CredentialStore.ts
AwesomeProject/src/core/engine/agentRuntime/credentials/NativeCredentialStore.ts
AwesomeProject/src/__tests__/core/engine/agentRuntime/credentials/NativeCredentialStore.test.ts
AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/SecureCredentialModule.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/security/AndroidAtomicFile.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/security/AndroidKeystoreCredentialStore.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/security/CredentialStore.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/security/KeystoreCipher.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/security/KeystoreFileCodec.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/security/KeystoreFilePublisher.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/security/LockedAliasInitializer.kt
AwesomeProject/android/app/src/test/java/com/awesomeproject/security/KeystoreFileCodecTest.kt
AwesomeProject/android/app/src/test/java/com/awesomeproject/security/KeystoreFilePublisherTest.kt
AwesomeProject/android/app/src/test/java/com/awesomeproject/security/LockedAliasInitializerTest.kt
AwesomeProject/ios/AwesomeProject/NoNoCredentialStore.h
AwesomeProject/ios/AwesomeProject/NoNoCredentialStore.m
AwesomeProject/ios/AwesomeProjectTests/NoNoCredentialStoreTests.m
AwesomeProject/ios/AwesomeProject.xcodeproj/project.pbxproj
```

`Task 3` owns:

```text
AwesomeProject/src/core/engine/agentRuntime/localModel/LocalModelBridge.ts
AwesomeProject/src/core/engine/agentRuntime/localModel/LocalModelEligibility.ts
AwesomeProject/src/__tests__/core/engine/agentRuntime/localModel/LocalModelEligibility.test.ts
AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/LocalModelEligibilityModule.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/localmodel/DownloadStateMachine.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/localmodel/EligibilityEvaluator.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/localmodel/LocalModelEligibilityService.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/localmodel/LocalModelModels.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/localmodel/MiniCpmJniRuntime.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/localmodel/MiniCpmModelDownloader.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/localmodel/MiniCpmModelStore.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/localmodel/MiniCpmModelVerifier.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/localmodel/MiniCpmRuntime.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/localmodel/UnavailableLocalModelOperations.kt
AwesomeProject/android/app/src/test/java/com/awesomeproject/bridge/AccessibilityPackageRegistrationTest.kt
AwesomeProject/android/app/src/test/java/com/awesomeproject/localmodel/DownloadStateMachineTest.kt
AwesomeProject/android/app/src/test/java/com/awesomeproject/localmodel/EligibilityEvaluatorTest.kt
AwesomeProject/android/app/src/test/java/com/awesomeproject/localmodel/LocalModelEligibilityServiceTest.kt
AwesomeProject/android/app/src/test/java/com/awesomeproject/localmodel/MiniCpmJniRuntimeTest.kt
AwesomeProject/android/app/src/test/java/com/awesomeproject/localmodel/MiniCpmModelDownloaderSafetyTest.kt
AwesomeProject/android/app/src/test/java/com/awesomeproject/localmodel/MiniCpmModelPipelineTest.kt
AwesomeProject/android/app/src/test/java/com/awesomeproject/localmodel/UnavailableLocalModelOperationsTest.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityPackage.kt
```

### V1-native configuration, session and execution files

| Task | File | Action and responsibility |
| --- | --- | --- |
| 0 | `AwesomeProject/package.json` / `AwesomeProject/package-lock.json` | remove invalid pseudo-package keys and web-only test dependency; regenerate deterministic metadata |
| 0 | `AwesomeProject/jest.setup.js` | narrow native/icon mocks; do not replace whole `react-native` module |
| 0 | `AwesomeProject/__tests__/App.test.tsx` | async render/unmount baseline |
| 0 | `AwesomeProject/src/__tests__/utils/{formatters,taskHelpers}.test.ts` | production alias imports |
| 0 | `AwesomeProject/src/__tests__/hooks/useTaskHistory.test.ts` | React Native hook renderer |
| 0 | `AwesomeProject/src/__tests__/services/TaskHistoryService.test.ts` | configured limit and key-based assertions |
| 0 | `AwesomeProject/src/features/task/screens/HomeScreen.tsx:334` | typed nested-tab navigation only; runtime edits wait until Task 8 |
| 4A | `AwesomeProject/src/core/engine/operateRuntime/model/ModelProviderContracts.ts` | standalone-only model authority; read-only Wave 0 input under the master plan |
| 4A | `AwesomeProject/src/core/engine/operateRuntime/model/{ModelProviderRegistry,ProviderModelCatalogService,index}.ts` | provider registry and catalog orchestration; the profile repository interface stays in the frozen contract |
| 4A | `AwesomeProject/src/core/engine/operateRuntime/model/ModelCatalogCache.ts` | generation-keyed sanitized catalog cache under its private V1 storage key |
| 4A | `AwesomeProject/src/core/engine/operateRuntime/model/transports/{OpenAI,Anthropic,Gemini,Custom}ProviderTransportAdapter.ts` | protocol-specific request/auth/list behavior; presets reuse the matching protocol adapter |
| 4A | `AwesomeProject/src/core/engine/operateRuntime/model/staticCatalog/ProviderCapabilityCatalogV1.ts` | exact-schema capability/model metadata trusted only from the platform-signed app bundle |
| 4B | `AwesomeProject/src/core/engine/agentRuntime/config/{AgentConfigController,AppAgentConfigController,NativeLocalModelEligibilityChecker,index}.ts` | port controller behavior; compose profile/binding repository, never an OpenAI-only tester |
| 4B | `AwesomeProject/src/core/engine/operateRuntime/config/{RuntimeConfigContracts,RuntimeConfigRepository,RuntimeConfigMigrationV1,RuntimeConfigStorageKeys}.ts` | independent model/visual route config, private versioned keys, serialized active/draft storage and exact legacy migration |
| 4B | `AwesomeProject/src/core/engine/operateRuntime/config/CredentialRetirementRepository.ts` | crash-recoverable staged/committed retirement queue for superseded model/Bridge secret refs; never deletes a ref during config mutation |
| 4B | `AwesomeProject/src/core/engine/operateRuntime/visualAgent/VisualAgentContracts.ts` | standalone-only authority for the nine canonical visual tool/profile/capability/protocol/execution contract names; read-only Wave 0 input under the master plan |
| 4B | `AwesomeProject/src/core/engine/operateRuntime/visualAgent/VisualAgentToolRegistry.ts` | immutable exact-tool registry constructor; imports the frozen registry/adapter interfaces |
| 4B | `AwesomeProject/src/core/engine/operateRuntime/config/LegacyOpenClawBindingPort.ts` | transactional legacy upstream-binding migration seam |
| 4B | `AwesomeProject/src/core/engine/operateRuntime/config/ConnectorBridgeLegacyOpenClawBindingClient.ts` | production HTTPS stage/read/commit/rollback client; moves the legacy upstream secret into a Bridge binding and stores only the short-lived Bridge credential by ref |
| 5 | `AwesomeProject/src/features/task/services/TaskHistoryService.ts:10` | serialized TaskRepository and instruction lookup |
| 5 | `AwesomeProject/src/core/engine/taskEngine/types/Task.ts:57` | add session revision and safe persisted-step contract |
| 5 | `AwesomeProject/src/core/engine/operateRuntime/ports/TaskInstructionPort.ts` | `load(taskId)` boundary |
| 5 | `AwesomeProject/src/__tests__/services/TaskHistoryService.test.ts` | concurrency, terminal and privacy invariants |
| 6 | `AwesomeProject/src/core/engine/operateRuntime/session/{OperateSessionContracts,OperateSessionResolver,OperateSessionStore,CredentialReferenceGarbageCollector}.ts` | immutable session, durable claim/terminal state, and cold-start-only retired-ref collection after session recovery |
| 6 | `AwesomeProject/src/core/engine/operateRuntime/OperateRuntime.ts` | create/claim/release façade and blocked outcomes |
| 6 | `AwesomeProject/src/__tests__/core/engine/operateRuntime/session/*.test.ts` | snapshot/restart/replay/config-change tests |
| 7 | `AwesomeProject/src/core/engine/operateRuntime/runner/{OperateTaskPorts,SnapshotAgentRuntimeAdapter,OperateTaskRunner,OperateTaskRunnerFactory}.ts` | the only task loop plus immutable snapshot-to-registry-transport execution join |
| 7 | `AwesomeProject/src/core/engine/operateRuntime/index.ts` | UI-independent public exports |
| 7 | `AwesomeProject/src/core/engine/taskEngine/task/TaskExecutionEngine.ts:39` | compatibility facade; no loop/native lifecycle |
| 7 | `AwesomeProject/src/core/engine/taskEngine/task/TaskExecutionContracts.ts` | legacy-facing adapter types only |
| 7 | `AwesomeProject/src/core/engine/taskEngine/index.ts` | publish facade and remove obsolete loop exports |
| 7 | `AwesomeProject/src/__tests__/core/engine/operateRuntime/runner/{OperateTaskRunner,SnapshotAgentRuntimeAdapter}.test.ts` | runner state machine and Anthropic/Gemini/custom snapshot-to-transport dispatch |
| 8 | `AwesomeProject/src/features/task/services/ForegroundTaskExecutionAdapter.ts` | foreground lifecycle over shared runner |
| 8 | `AwesomeProject/src/features/task/hooks/useTaskExecution.ts` | thin foreground Hook |
| 8 | `AwesomeProject/src/__tests__/services/ForegroundTaskExecutionAdapter.test.ts` | foreground owner/cancel tests |
| 8 | `AwesomeProject/src/__tests__/hooks/useTaskExecution.test.ts` | Hook delegation tests |
| 9 | `AwesomeProject/src/features/task/services/HeadlessTaskSessionCoordinator.ts` | task-scoped reserve/claim/cancel/replay lease |
| 9 | `AwesomeProject/src/features/task/services/HeadlessTaskExecutionAdapter.ts` | Headless lifecycle over shared runner |
| 9 | `AwesomeProject/src/features/task/services/TaskExecutionHeadless.ts:1` | strict minimal payload parser |
| 9 | `AwesomeProject/src/features/task/useTaskExecutionWithBackground.ts:92` | persist task/session before native start; no local fallback |
| 9 | `AwesomeProject/src/features/task/screens/HomeScreen.tsx` | consume finished foreground/background adapters; remove selected operate model and fallback orchestration |
| 9 | `AwesomeProject/index.js:19` | unchanged ABI, new handler implementation |
| 9 | `AwesomeProject/android/app/src/main/java/com/awesomeproject/service/TaskExecutionHeadlessService.kt` | remove raw payload log, preserve task-scoped start |
| 9 | `AwesomeProject/android/app/src/main/java/com/awesomeproject/utils/ServiceManager.kt` | no payload content logging |
| 9 | `AwesomeProject/src/__tests__/services/{HeadlessTaskExecutionAdapter,HeadlessTaskSessionCoordinator}.test.ts` | lifecycle/replay/cancel tests |
| 9 | `AwesomeProject/src/__tests__/features/task/TaskExecutionHeadlessSession.test.ts` | exact payload schema |
| 10 | `AwesomeProject/src/core/engine/privacy/sanitizeLog.ts` | one recursive sanitizer for every sink |
| 10 | `AwesomeProject/src/features/debug/services/logRedaction.ts` | compatibility re-export only |
| 10 | `AwesomeProject/src/features/debug/services/DebugLogService.ts:42` | sanitize before platform/memory/storage sinks |
| 10 | `AwesomeProject/src/__tests__/core/engine/privacy/sanitizeLog.test.ts` | secret/content/error/size tests |
| 10 | `AwesomeProject/src/__tests__/services/DebugLogService.test.ts` | sink ordering and legacy migration |
| 11 | `AwesomeProject/src/__tests__/integration/V1RuntimeFoundation.test.ts` | cross-layer channel/session/headless/history/privacy matrix |
| 11 | `docs/superpowers/reports/2026-08-20-v1-runtime-foundation-verification.md` | final commands, outputs, SHA and physical gaps |

---

### Task 0: Freeze V1 And Establish A Trustworthy Test Baseline

**Files:**

- Modify: `AwesomeProject/jest.setup.js`
- Modify: `AwesomeProject/package.json`
- Modify: `AwesomeProject/package-lock.json`
- Modify: `AwesomeProject/__tests__/App.test.tsx`
- Modify: `AwesomeProject/src/__tests__/utils/formatters.test.ts`
- Modify: `AwesomeProject/src/__tests__/utils/taskHelpers.test.ts`
- Modify: `AwesomeProject/src/__tests__/hooks/useTaskHistory.test.ts`
- Modify: `AwesomeProject/src/__tests__/services/TaskHistoryService.test.ts`
- Modify: `AwesomeProject/src/features/task/screens/HomeScreen.tsx:334-337`

**Interfaces:**

- Consumes: V1 `9ff7ba4…`, Babel aliases `@shared`/`@core`/`@features`, React Native Jest preset, `TASK_CONFIG.MAX_TASKS`.
- Produces: clean V1 baseline checkpoint `codex/checkpoint-v1-runtime-baseline` and a test environment that later phase1 suites can reuse without broad mocks.

- [ ] **Step 1: Create an isolated implementation worktree and prove its base**

Run from the repository root:

```bash
git worktree add /private/tmp/a2a_ai_mobile-v1-runtime-foundation -b codex/v1-runtime-foundation 9ff7ba4cc4dc186b79b6e62181333ae6c9132f54
git -C /private/tmp/a2a_ai_mobile-v1-runtime-foundation rev-parse HEAD
git -C /private/tmp/a2a_ai_mobile-v1-runtime-foundation status --short
```

Expected: first SHA is exactly `9ff7ba4cc4dc186b79b6e62181333ae6c9132f54`; status has no output. If the branch/worktree already exists, inspect it rather than deleting or resetting it.

- [ ] **Step 2: Capture the real RED baseline without excluding tests**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache
npx tsc --noEmit
```

Expected Jest baseline from the design audit: 5 suites fail and 4 pass; failures include three stale `TaskHistoryService` assertions, two old `src/utils/*` imports, a web hook-test renderer mismatch, and App/vector-icon transformation. Expected TypeScript includes the Root Stack → Tab `Capabilities` navigation error. Record exact output before editing; do not turn missing future Runtime modules into ignored paths.

- [ ] **Step 3: Repair deterministic dependency metadata**

Delete every `dependencies`/`devDependencies` key whose name starts with `//`, and delete the web-only package:

```json
"@testing-library/react": "^16.3.1"
```

Retain `@testing-library/react-native` at `^13.3.3`. Regenerate and verify without running postinstall scripts:

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm install --package-lock-only --ignore-scripts
npm ci --ignore-scripts
```

Expected: both commands exit 0 without `EINVALIDPACKAGENAME`, `react-dom` peer conflicts or `--legacy-peer-deps`.

- [ ] **Step 4: Repair only the test-environment and stale-import failures**

Use these imports:

```ts
import {formatTime, truncateText} from '@shared/utils/formatters';
import {
  getActionDescription,
  getStatusColor,
  getStatusText,
  getTaskTitle,
} from '@shared/utils/taskHelpers';
import type {Task, TaskAction, TaskStatus} from '@core/engine/taskEngine';
import {renderHook, act, waitFor} from '@testing-library/react-native';
```

Replace the whole-module React Native mock in `jest.setup.js` with application-owned native additions and the icon mock:

```js
const {NativeModules} = require('react-native');
NativeModules.AccessibilityModule = {};
NativeModules.AccessibilityActionModule = {};
NativeModules.ADBModule = {};

jest.mock('react-native-vector-icons/FontAwesome', () => 'Icon');
```

Keep the existing AsyncStorage mock. Do not mock the complete `react-native` export object.

- [ ] **Step 5: Correct current TaskHistory test expectations without hiding the later concurrency RED**

Use the configured maximum and find the global write by key:

```ts
const tasks = Array.from({length: TASK_CONFIG.MAX_TASKS}, (_, index) => ({
  ...mockTask,
  id: `task_${index}`,
  createdAt: index,
}));
const globalWrite = mockAsyncStorage.setItem.mock.calls.find(
  ([key]) => key === STORAGE_KEYS.TASKS,
);
expect(globalWrite).toBeDefined();
const savedTasks = JSON.parse(globalWrite![1] as string) as Task[];
expect(savedTasks).toHaveLength(TASK_CONFIG.MAX_TASKS);
```

The missing-task delete case must assert no write:

```ts
await taskHistoryService.deleteTask('non_existent');
expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
```

- [ ] **Step 6: Fix the nested-tab navigation type error**

At `HomeScreen.tsx:334`, replace the invalid Root Stack route call with:

```ts
navigation.navigate('MainTabs', {screen: 'Capabilities'});
```

No other Home behavior changes belong in this task.

- [ ] **Step 7: Verify GREEN baseline**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache
npx tsc --noEmit
npx eslint jest.setup.js __tests__/App.test.tsx \
  src/__tests__/utils/formatters.test.ts \
  src/__tests__/utils/taskHelpers.test.ts \
  src/__tests__/hooks/useTaskHistory.test.ts \
  src/__tests__/services/TaskHistoryService.test.ts \
  src/features/task/screens/HomeScreen.tsx
```

Expected: all tracked V1 suites pass, TypeScript exits 0, and focused ESLint exits 0. If newly restored Task 1 tests are already present, run the tracked V1 list explicitly and record future missing-module tests as pending Task 1 rather than deleting them.

- [ ] **Step 8: Commit the baseline**

```bash
git add AwesomeProject/package.json AwesomeProject/package-lock.json \
  AwesomeProject/jest.setup.js AwesomeProject/__tests__/App.test.tsx \
  AwesomeProject/src/__tests__/utils/formatters.test.ts \
  AwesomeProject/src/__tests__/utils/taskHelpers.test.ts \
  AwesomeProject/src/__tests__/hooks/useTaskHistory.test.ts \
  AwesomeProject/src/__tests__/services/TaskHistoryService.test.ts \
  AwesomeProject/src/features/task/screens/HomeScreen.tsx
git commit -m "test: stabilize V1 runtime baseline"
git branch codex/checkpoint-v1-runtime-baseline
git rev-parse HEAD
```

Expected: one commit; `git rev-parse codex/checkpoint-v1-runtime-baseline` exactly equals the printed `HEAD`. Never advance or rebase this checkpoint branch.

---

### Task 1: Port The Verified AgentRuntime Decision Core

**Files:**

- Create: the 19 production files listed in “Pure files copied from phase1 final state”.
- Test: the 11 corresponding test files listed in that section.

**Interfaces:**

- Consumes: existing `TaskAction`, `AbortSignal`, phase1 source SHA `ce9e4a6…`.
- Produces: `AgentRuntime.createTaskSnapshot()`, `AgentRuntime.decideStep(snapshot, input)`, `createAgentRuntime()`, `RuntimeTaskSnapshot`, `RuntimeStepResult`, provider pipelines, privacy projection, validation and `TaskAction` mapping.

The public shapes remain exactly:

```ts
export interface AgentTaskConfigSnapshot {
  readonly config: Readonly<AgentConfigV2>;
  readonly connections: Readonly<Record<string, ModelConnection>>;
  readonly eligibility?: Readonly<EligibilityReport>;
}

export interface RuntimeStepResult {
  readonly decision: ValidatedActionDecision;
  readonly observation?: Observation;
  readonly taskAction: TaskAction;
  readonly diagnostics: Readonly<{mode: AgentMode; durationMs: number}>;
}

export class AgentRuntime {
  createTaskSnapshot(): Promise<RuntimeTaskSnapshot>;
  decideStep(
    snapshot: RuntimeTaskSnapshot,
    input: RuntimeStepInput,
  ): Promise<RuntimeStepResult>;
}
```

- [ ] **Step 1: Restore tests only and capture missing-module RED**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
git restore --source ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b -- \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/adapters \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/domain \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/pipelines \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/policy \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/runtime
cd AwesomeProject
npm test -- --runInBand --no-cache src/__tests__/core/engine/agentRuntime
```

Expected: FAIL with missing modules below `src/core/engine/agentRuntime`; failures must not be config/React Native mock failures.

- [ ] **Step 2: Restore the exact decision-core production files**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
git restore --source ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b -- \
  AwesomeProject/src/core/engine/agentRuntime/adapters \
  AwesomeProject/src/core/engine/agentRuntime/contracts \
  AwesomeProject/src/core/engine/agentRuntime/domain \
  AwesomeProject/src/core/engine/agentRuntime/pipelines \
  AwesomeProject/src/core/engine/agentRuntime/policy \
  AwesomeProject/src/core/engine/agentRuntime/providers \
  AwesomeProject/src/core/engine/agentRuntime/runtime \
  AwesomeProject/src/core/engine/agentRuntime/index.ts
```

Expected: only new `agentRuntime` production/test paths are added. Do not restore `ModelService.ts`, package files, Screen/Hook files, or task engine files.

- [ ] **Step 3: Verify privacy and routing GREEN**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache \
  src/__tests__/core/engine/agentRuntime/adapters \
  src/__tests__/core/engine/agentRuntime/domain \
  src/__tests__/core/engine/agentRuntime/pipelines \
  src/__tests__/core/engine/agentRuntime/policy \
  src/__tests__/core/engine/agentRuntime/runtime
npx tsc --noEmit
npx eslint src/core/engine/agentRuntime src/__tests__/core/engine/agentRuntime
```

Expected: restored suites pass; `RuntimePrivacy` proves local screenshots never reach the cloud planner, local failure invokes no cloud planner, and abort does not return an action. TypeScript and ESLint exit 0.

- [ ] **Step 4: Verify exact donor content before local adaptations begin**

```bash
git diff --check
git diff --name-status codex/checkpoint-v1-runtime-baseline -- AwesomeProject/src/core/engine/agentRuntime AwesomeProject/src/__tests__/core/engine/agentRuntime
```

Expected: only the declared paths, no whitespace errors. Compare `AgentRuntime.ts` with donor:

```bash
git show ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b:AwesomeProject/src/core/engine/agentRuntime/runtime/AgentRuntime.ts | shasum -a 256
shasum -a 256 AwesomeProject/src/core/engine/agentRuntime/runtime/AgentRuntime.ts
```

Expected: both hashes equal `e833944838a1560a6e5575bd8dbafca77c20f8e51e33adb31e84941f4addb880`.

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/core/engine/agentRuntime AwesomeProject/src/__tests__/core/engine/agentRuntime
git commit -m "feat: port verified AgentRuntime decision core"
```

---

### Task 2: Port CredentialStore And Add The iOS Keychain Boundary

**Files:**

- Create: all Task 2 credential files from the exact file graph.
- Modify: `AwesomeProject/ios/AwesomeProject.xcodeproj/project.pbxproj`.
- Test: `NativeCredentialStore.test.ts`, Android security tests, and `AwesomeProject/ios/AwesomeProjectTests/NoNoCredentialStoreTests.m`.

**Interfaces:**

- Consumes: opaque `secretRef`, transient plaintext only at method call boundaries.
- Produces:

```ts
export interface CredentialStore {
  isAvailable(): Promise<boolean>;
  put(secretRef: string, plaintext: string): Promise<void>;
  get(secretRef: string): Promise<string | null>;
  delete(secretRef: string): Promise<void>;
}
```

Native module ABI on both platforms is `SecureCredentialModule` with the same four Promise methods. Stable errors are `E_INVALID_SECRET_REF`, `E_EMPTY_PLAINTEXT`, `E_KEYSTORE_UNAVAILABLE`, `E_CREDENTIAL_READ`, `E_CREDENTIAL_WRITE`, and `E_CREDENTIAL_DELETE`; errors contain no ref, key, cause or stack.

- [ ] **Step 1: Restore the TypeScript and Android tests first, then capture RED**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
git restore --source ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b -- \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/credentials/NativeCredentialStore.test.ts \
  AwesomeProject/android/app/src/test/java/com/awesomeproject/security
cd AwesomeProject
npm test -- --runInBand --no-cache src/__tests__/core/engine/agentRuntime/credentials/NativeCredentialStore.test.ts
```

Expected: FAIL because the credentials production module is missing.

- [ ] **Step 2: Restore the final phase1 TypeScript and Android implementation**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
git restore --source ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b -- \
  AwesomeProject/src/core/engine/agentRuntime/credentials \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/SecureCredentialModule.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/security
```

Expected: restored JS test passes. Do not register the native module yet; Task 3 is the sole owner of `AccessibilityPackage.kt`.

- [ ] **Step 3: Add iOS RED tests for stable Keychain behavior**

Create `AwesomeProject/ios/AwesomeProjectTests/NoNoCredentialStoreTests.m` in the existing `AwesomeProjectTests` target with methods `testPutGetDeleteRoundTrip`, `testPutOverwritesExistingValue`, `testMissingValueResolvesNull`, `testInvalidReferenceRejectsWithStableCode`, and `testErrorsDoNotContainReferenceOrPlaintext`. The bridge contract must be:

```objc
RCT_EXPORT_MODULE(SecureCredentialModule)
RCT_REMAP_METHOD(isAvailable,
                 isAvailableWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
RCT_REMAP_METHOD(put,
                 secretRef:(NSString *)secretRef
                 plaintext:(NSString *)plaintext
                 putResolver:(RCTPromiseResolveBlock)resolve
                 putRejecter:(RCTPromiseRejectBlock)reject)
RCT_REMAP_METHOD(get,
                 secretRef:(NSString *)secretRef
                 getResolver:(RCTPromiseResolveBlock)resolve
                 getRejecter:(RCTPromiseRejectBlock)reject)
RCT_REMAP_METHOD(delete,
                 secretRef:(NSString *)secretRef
                 deleteResolver:(RCTPromiseResolveBlock)resolve
                 deleteRejecter:(RCTPromiseRejectBlock)reject)
```

Run:

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
xcodebuild -project ios/AwesomeProject.xcodeproj -scheme AwesomeProject \
  -configuration Debug -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  test -only-testing:AwesomeProjectTests/NoNoCredentialStoreTests
```

Expected RED: the named Keychain test target is selected and compilation/linking fails because `NoNoCredentialStore` is missing before implementation. If Xcode, the test target or that simulator is unavailable, record `NOT RUN` plus the exact error; do not report PASS.

- [ ] **Step 4: Implement the iOS Keychain module**

Use Generic Password items with service `com.awesomeproject.nono.credentials`, account=`secretRef`, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, update-before-add, and fixed error codes. Never include `OSStatus`, ref or plaintext in the JavaScript rejection message. Add both files to the Xcode project.

- [ ] **Step 5: Verify JS, Android and iOS GREEN**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache src/__tests__/core/engine/agentRuntime/credentials
npx tsc --noEmit
cd android
./gradlew :app:testDebugUnitTest --tests 'com.awesomeproject.security.*'
./gradlew :app:compileDebugKotlin
```

Expected: JS suite passes, Android security tests pass, Kotlin compile exits 0. Re-run the Task 2 xcodebuild command; expected PASS or explicitly recorded `NOT RUN`.

- [ ] **Step 6: Scan the credential boundary and commit**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
if rg -n 'Log\.|println|console\.|Throwable|printStackTrace' \
  AwesomeProject/src/core/engine/agentRuntime/credentials \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/security \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/SecureCredentialModule.kt \
  AwesomeProject/ios/AwesomeProject/NoNoCredentialStore.*; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: no production logging match. Then:

```bash
git add AwesomeProject/src/core/engine/agentRuntime/credentials \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/credentials \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/SecureCredentialModule.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/security \
  AwesomeProject/android/app/src/test/java/com/awesomeproject/security \
  AwesomeProject/ios/AwesomeProject/NoNoCredentialStore.h \
  AwesomeProject/ios/AwesomeProject/NoNoCredentialStore.m \
  AwesomeProject/ios/AwesomeProjectTests/NoNoCredentialStoreTests.m \
  AwesomeProject/ios/AwesomeProject.xcodeproj/project.pbxproj
git commit -m "feat: add cross-platform secure credential store"
```

---

### Task 3: Port Local-Model Eligibility And Register Native Bridges

**Files:**

- Create: every Task 3 local-model file in the exact file graph.
- Modify: `AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityPackage.kt`.
- Test: local-model JS and Android tests.

**Interfaces:**

- Consumes: `localModelId: 'minicpm-v-4.6-q4'`, native device facts and explicit model operations.
- Produces: `LocalModelEligibility` DTO, `NativeLocalModelEligibilityChecker`, `SecureCredentialModule` and `LocalModelEligibilityModule` React packages.
- Failure contract: absent model operations or unavailable JNI returns a stable unavailable result; it must never invoke cloud perception.

- [ ] **Step 1: Restore tests and capture missing-module RED**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
git restore --source ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b -- \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/localModel \
  AwesomeProject/android/app/src/test/java/com/awesomeproject/localmodel \
  AwesomeProject/android/app/src/test/java/com/awesomeproject/bridge/AccessibilityPackageRegistrationTest.kt
cd AwesomeProject
npm test -- --runInBand --no-cache src/__tests__/core/engine/agentRuntime/localModel
```

Expected: FAIL because `LocalModelBridge`/`LocalModelEligibility` are missing.

- [ ] **Step 2: Restore final local-model implementation files**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
git restore --source ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b -- \
  AwesomeProject/src/core/engine/agentRuntime/localModel \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/LocalModelEligibilityModule.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/localmodel
```

- [ ] **Step 3: Apply only the two registration additions from `7867991`**

In V1 `AccessibilityPackage.createNativeModules`, append exactly:

```kotlin
SecureCredentialModule(reactContext),
LocalModelEligibilityModule(reactContext),
```

Do not restore the complete donor `AccessibilityPackage.kt`; retain every V1 module registration already present.

- [ ] **Step 4: Verify local fail-closed behavior and native compilation**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache \
  src/__tests__/core/engine/agentRuntime/localModel \
  src/__tests__/core/engine/agentRuntime/runtime/RuntimePrivacy.test.ts
npx tsc --noEmit
cd android
./gradlew :app:testDebugUnitTest --tests 'com.awesomeproject.localmodel.*'
./gradlew :app:compileDebugKotlin
```

Expected: all JS/local-model JVM tests pass and Kotlin compiles. `RuntimePrivacy` must assert cloud planner/direct call count is zero after local construction, inference or schema failure.

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/core/engine/agentRuntime/localModel \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/localModel \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityPackage.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/LocalModelEligibilityModule.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/localmodel \
  AwesomeProject/android/app/src/test/java/com/awesomeproject/localmodel \
  AwesomeProject/android/app/src/test/java/com/awesomeproject/bridge/AccessibilityPackageRegistrationTest.kt
git commit -m "feat: port local model eligibility foundation"
```

---

### Task 4A: Build Provider Registry, Protocol Transports And Model Catalog

**Contract checkpoint ownership:** When this runtime plan is executed independently, Task 4A creates `ModelProviderContracts.ts` and its validator tests before registry work. Under `2026-08-20-v1-complete-parallel-delivery.md`, Wave 0 already owns and freezes that file byte-for-byte; the Task 4A worker consumes it read-only, runs its tests, excludes it from `git add`, and stops on any signature mismatch instead of redefining or widening it.

**Files:**

- Create only in standalone execution; otherwise consume read-only: `AwesomeProject/src/core/engine/operateRuntime/model/ModelProviderContracts.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/model/ModelProviderRegistry.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/model/ProviderModelCatalogService.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/model/ModelCatalogCache.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/model/staticCatalog/ProviderCapabilityCatalogV1.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/model/transports/OpenAIProviderTransportAdapter.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/model/transports/AnthropicProviderTransportAdapter.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/model/transports/GeminiProviderTransportAdapter.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/model/transports/CustomProviderTransportAdapter.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/model/index.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/operateRuntime/model/ModelProviderRegistry.test.ts`
- Test only in standalone execution; otherwise run the frozen test read-only: `AwesomeProject/src/__tests__/core/engine/operateRuntime/model/ModelProviderContracts.test.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/operateRuntime/model/ProviderModelCatalogService.test.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/operateRuntime/model/ModelCatalogCache.test.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/operateRuntime/model/ProviderTransportAdapters.test.ts`

**Interfaces:**

- Consumes: `CredentialStore`, injected `fetch`, `AbortSignal`, monotonic clock and the platform-signed app bundle. Neither registry nor catalog depends on a React screen, selector or feature service.
- Produces:

```ts
export type ProviderPresetV1 =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'xai'
  | 'alibaba_bailian_qwen'
  | 'zhipu_glm'
  | 'moonshot_kimi'
  | 'minimax'
  | 'volcano_ark_doubao'
  | 'modelscope';

export type ProviderProtocolV1 =
  | 'openai_chat_completions'
  | 'openai_responses'
  | 'anthropic_messages'
  | 'gemini_generate_content'
  | 'custom_http_json';

export type ProviderAuthV1 =
  | {readonly kind: 'none'}
  | {readonly kind: 'bearer'}
  | {
      readonly kind: 'header';
      readonly headerName: string;
      readonly prefix: '' | 'Bearer ' | 'Token ' | 'Basic ';
    }
  | {readonly kind: 'query'; readonly queryName: string};

export interface ProviderCapabilityDeclarationV1 {
  readonly inputModalities: readonly ('text' | 'image' | 'audio' | 'video')[];
  readonly outputModalities: readonly ('text' | 'image' | 'audio')[];
  readonly capabilities: Readonly<{
    readonly chat: true;
    readonly vision: boolean | 'unknown';
    readonly toolCalls: boolean | 'unknown';
    readonly reasoning: boolean | 'unknown';
  }>;
}

export interface CustomProviderSpecV1 {
  readonly protocol: ProviderProtocolV1;
  readonly baseURL: string;
  readonly auth: ProviderAuthV1;
  readonly chatPath: string;
  readonly modelListPath: string | null;
  readonly declaredCapabilities: ProviderCapabilityDeclarationV1;
}

export interface ProviderExecutionTargetV1 {
  readonly provider: ProviderPresetV1 | 'custom';
  readonly transportAdapterId: 'openai' | 'anthropic' | 'gemini' | 'custom';
  readonly protocol: ProviderProtocolV1;
  readonly baseURL: string;
  readonly auth: ProviderAuthV1;
  readonly chatPath: string;
  readonly region: string | null;
  readonly channel: string | null;
  readonly secretRef: string | null;
  readonly inputModalities: Readonly<ProviderModelDescriptor['inputModalities']>;
  readonly outputModalities: Readonly<ProviderModelDescriptor['outputModalities']>;
  readonly capabilities: Readonly<ProviderModelDescriptor['capabilities']>;
  readonly capabilityTrust: 'verified_remote' | 'verified_signed' | 'user_declared_unverified';
}

export type ModelEndpointProfileV1 =
  | Readonly<{
      id: string;
      label: string;
      mode: 'preset';
      preset: ProviderPresetV1;
      baseURLOverride: string | null;
      region: string | null;
      channel: string | null;
      secretRef: string | null;
      generation: number;
    }>
  | Readonly<{
      id: string;
      label: string;
      mode: 'custom';
      custom: CustomProviderSpecV1;
      region: string | null;
      channel: string | null;
      secretRef: string | null;
      generation: number;
    }>;

export type ModelRole =
  | 'direct'
  | 'vision'
  | 'split_planner'
  | 'local_planner'
  | 'companion';

export interface ModelBindingV1 {
  readonly id: string;
  readonly role: ModelRole;
  readonly profileId: string;
  readonly modelId: string;
  readonly maxSteps: number;
}

export interface ProviderModelDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly inputModalities: readonly ('text' | 'image' | 'audio' | 'video')[];
  readonly outputModalities: readonly ('text' | 'image' | 'audio')[];
  readonly capabilities: Readonly<{
    chat: boolean | 'unknown';
    vision: boolean | 'unknown';
    toolCalls: boolean | 'unknown';
    reasoning: boolean | 'unknown';
  }>;
  readonly contextWindow: number | null;
  readonly maxOutputTokens: number | null;
  readonly metadataSource: 'remote' | 'signed_static' | 'manual';
}

export interface ProviderChatMessageV1 {
  readonly role: 'system' | 'user' | 'assistant';
  readonly text: string;
  readonly imageDataURI?: string;
}

export interface ProviderChatResultV1 {
  readonly text: string;
  readonly finishReason: string | null;
  readonly usage: Readonly<{
    inputTokens: number | null;
    outputTokens: number | null;
  }>;
}

export interface ProviderRegistrationV1 {
  readonly preset: ProviderPresetV1;
  readonly label: string;
  readonly defaultBaseURL: string;
  readonly protocol: ProviderProtocolV1;
  readonly chatPath: string;
  readonly auth: ProviderAuthV1;
  readonly credentialRequirement: 'required' | 'optional' | 'none';
  readonly transportAdapterId: ProviderTransportAdapter['id'];
  readonly catalog: Readonly<{
    kind: 'remote' | 'signed_static';
    modelListPath: string | null;
    pagination: 'none' | 'cursor' | 'page_token';
  }>;
}

export type ProviderModelCatalogResult =
  | Readonly<{
      status: 'ready';
      models: readonly ProviderModelDescriptor[];
      source: 'remote' | 'cache';
      stale: boolean;
      manualModelIdAllowed: true;
    }>
  | Readonly<{
      status: 'unsupported';
      models: readonly ProviderModelDescriptor[];
      source: 'signed_static' | 'none';
      manualModelIdAllowed: true;
    }>
  | Readonly<{
      status: 'auth_failed' | 'network_failed' | 'empty';
      models: readonly [];
      manualModelIdAllowed: true;
    }>;

export interface ProviderTransportAdapter {
  readonly id: 'openai' | 'anthropic' | 'gemini' | 'custom';
  sendChat(request: Readonly<{
    target: ProviderExecutionTargetV1;
    binding: ModelBindingV1;
    messages: readonly ProviderChatMessageV1[];
    signal: AbortSignal;
    timeoutMs: number;
  }>): Promise<ProviderChatResultV1>;
}

export interface ProviderModelCatalogPort {
  listModels(request: Readonly<{
    profile: ModelEndpointProfileV1;
    signal: AbortSignal;
    timeoutMs: number;
    requestGeneration: number;
  }>): Promise<ProviderModelCatalogResult>;
  describeManualModel(
    profile: ModelEndpointProfileV1,
    modelId: string,
  ): ProviderModelDescriptor;
}

export interface ModelCatalogCache {
  read(cacheKey: string): Promise<ProviderModelCatalogResult | null>;
  write(cacheKey: string, value: ProviderModelCatalogResult): Promise<void>;
  deleteProfile(profileId: string): Promise<void>;
}

export interface ModelProviderRegistry {
  listPresets(): readonly ProviderRegistrationV1[];
  resolveExecutionTarget(
    profile: ModelEndpointProfileV1,
    descriptor: ProviderModelDescriptor,
    capabilityTrust: ProviderExecutionTargetV1['capabilityTrust'],
  ): ProviderExecutionTargetV1;
  resolveTransport(target: ProviderExecutionTargetV1): ProviderTransportAdapter;
  resolveCatalog(profile: ModelEndpointProfileV1): ProviderModelCatalogPort;
}

export interface ModelEndpointProfileRepository {
  listProfiles(): Promise<readonly ModelEndpointProfileV1[]>;
  listBindings(): Promise<readonly ModelBindingV1[]>;
  putProfile(
    profile: ModelEndpointProfileV1,
    plaintextCredential?: string,
  ): Promise<void>;
  putBinding(binding: ModelBindingV1): Promise<void>;
  removeProfile(profileId: string): Promise<void>;
}

export function validateModelEndpointProfileV1(
  value: unknown,
): ModelEndpointProfileV1;
export function validateModelBindingV1(value: unknown): ModelBindingV1;
```

`putProfile` moves an optional transient credential to `CredentialStore`, verifies readback, and persists only nullable `secretRef`; it never returns the plaintext. Before any secure put it durably stages the generated opaque replacement ref in `CredentialRetirementRepository`, so a crash cannot orphan an untracked secret. Null is accepted only for `custom.auth.kind: 'none'`. `removeProfile` rejects `model_profile_in_use` while a binding references the profile, commits a retirement record with the config mutation, and never deletes an old ref inline; Task 6 GC deletes only after active/draft config and nonterminal sessions release it.

The built-in registry is exact and versioned:

| Preset | Default base URL | Protocol + execution path | Auth | Catalog strategy | Transport |
| --- | --- | --- | --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `openai_responses` + `/responses` | bearer | remote `GET /models` + signed capability enrichment | `openai` |
| Anthropic | `https://api.anthropic.com/v1` | `anthropic_messages` + `/messages` | `x-api-key` plus `anthropic-version` | remote paginated `GET /models` + signed capability enrichment | `anthropic` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta` | `gemini_generate_content` + `/models/{modelId}:generateContent` | `x-goog-api-key` | remote paginated `GET /models` + signed capability enrichment | `gemini` |
| DeepSeek | `https://api.deepseek.com` | `openai_chat_completions` + `/chat/completions` | bearer | remote `GET /models` + signed capability enrichment | `openai` |
| xAI | `https://api.x.ai/v1` | `openai_chat_completions` + `/chat/completions` | bearer | remote `GET /models` + signed capability enrichment | `openai` |
| Alibaba Bailian/Qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `openai_chat_completions` + `/chat/completions` | bearer | signed static catalog + manual model ID; region may replace the base URL | `openai` |
| Zhipu GLM | `https://open.bigmodel.cn/api/paas/v4` | `openai_chat_completions` + `/chat/completions` | bearer | signed static catalog + manual model ID | `openai` |
| Moonshot/Kimi | `https://api.moonshot.cn/v1` | `openai_chat_completions` + `/chat/completions` | bearer | remote `GET /models` + signed capability enrichment | `openai` |
| MiniMax | `https://api.minimax.io/v1` | `openai_chat_completions` + `/chat/completions` | bearer | remote `GET /models` + signed capability enrichment | `openai` |
| Volcano Ark/Doubao | `https://ark.cn-beijing.volces.com/api/v3` | `openai_chat_completions` + `/chat/completions` | bearer | signed static catalog + manual endpoint/model ID; region may replace the base URL | `openai` |
| ModelScope | `https://api-inference.modelscope.cn/v1` | `openai_chat_completions` + `/chat/completions` | bearer | signed static catalog + manual model ID | `openai` |

The table is a protocol/catalog bootstrap, not a promise that every account can call every listed model. `ready` is reserved for a successful remote enumeration scoped to the profile's current credential, region and channel. Every catalog result carries `manualModelIdAllowed: true`: the user may always enter an exact model ID, including when enumeration succeeds, fails, returns empty, or is unsupported. Without an official list endpoint, return `unsupported` together with verified signed candidates; candidates/manual IDs are explicitly unverified until an actual provider request succeeds. Provider responses generally do not expose dependable vision/tool/reasoning flags; `Gemini` metadata is richer, but every preset still uses `ProviderCapabilityCatalogV1` for missing fields and leaves unverified fields as `'unknown'`. A custom profile has no trusted provider metadata, so its explicit `declaredCapabilities` is user-authored input: validate its modality literals and `chat:true`, carry it into the immutable session snapshot, label it unverified in UI, and never upgrade an `'unknown'` flag based on a successful text request.

`ProviderCapabilityCatalogV1` is an exact-schema, versioned asset included in the platform-signed application bundle; runtime validates its schema/version/provider IDs and therefore trusts only the installed app signature. This foundation does not download a replacement static catalog. Online refresh means calling the official account-scoped list endpoint through `ProviderModelCatalogPort`; a later remotely delivered static asset must add detached-signature verification and cannot reuse the app-bundle trust flag.

- [ ] **Step 1: Write registry and profile-contract RED tests**

Assert all eleven presets, their exact default URL/auth/catalog/transport registration, strict URL/path validation, unique profile/binding IDs, referential integrity, positive `generation`, positive `maxSteps`, and the discriminated union rule: preset profiles have no `custom`, custom profiles have no `preset`, and only `mode: 'preset' | 'custom'` is accepted. Assert `resolveExecutionTarget(profile, descriptor, capabilityTrust)` returns a recursively frozen exact protocol/base/auth/chat-path/region/channel/ref/modality/capability/trust DTO, and mutating/replacing any source argument or registry fixture afterward cannot change that target. Assert custom profiles cover protocol, base URL, auth and chat/model-list paths; model ID exists only in `ModelBindingV1`. `auth.kind: 'none'` requires `secretRef: null`; every built-in preset in this registry has `credentialRequirement: 'required'` and rejects a null/missing secure ref before catalog or chat I/O; header/query/bearer custom auth also requires a ref. Reject URL userinfo/fragments, non-HTTPS endpoints except loopback in development builds, absolute/cross-origin/path-traversal request paths, forbidden cookie/proxy auth header names, and redirects that would forward credentials to a different origin.

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache \
  src/__tests__/core/engine/operateRuntime/model/ModelProviderContracts.test.ts \
  src/__tests__/core/engine/operateRuntime/model/ModelProviderRegistry.test.ts
```

Expected: FAIL because the model contracts, registry and repository port do not exist.

- [ ] **Step 2: Implement protocol-specific transport adapters**

Write adapter RED tests before production code. `ModelProviderRegistry.resolveExecutionTarget(profile, descriptor, capabilityTrust)` is the only normalization step from mutable endpoint/profile/preset/model metadata to `ProviderExecutionTargetV1`; it copies the exact protocol/base/auth/chat path/region/channel/ref/modality/capability/trust used by execution. `OpenAIProviderTransportAdapter` owns OpenAI request/response shapes and is reused by the OpenAI-compatible presets; `AnthropicProviderTransportAdapter` owns Messages payloads plus `x-api-key`/version headers; `GeminiProviderTransportAdapter` owns `generateContent` payloads and Google auth; `CustomProviderTransportAdapter` applies the target protocol and configured paths/auth without guessing provider identity. `resolveTransport(target)` selects only by `target.transportAdapterId` and rejects protocol/adapter mismatches. Required-auth adapters resolve non-null `target.secretRef` inside the request boundary and create auth headers/query values only in a local variable; custom no-auth requires null and performs no credential-store read or auth injection. All adapters use only the supplied immutable target—never a live registry/profile lookup—disable automatic cross-origin credential redirects, apply the caller signal plus timeout, cap catalog responses at 4 MiB/chat responses at 16 MiB, and return sanitized stable errors without raw response bodies. No transport receives or returns a plaintext API key in a persisted DTO.

```bash
npm test -- --runInBand --no-cache \
  src/__tests__/core/engine/operateRuntime/model/ProviderTransportAdapters.test.ts
```

Expected: adapter suite passes for exact normalized-target snapshots across OpenAI, Anthropic, Gemini and custom payload/auth/path differences; a registry/preset change after target creation cannot alter that request, mismatch fails before I/O, timeout/cancellation abort the underlying request, and serialized snapshots contain no authorization value.

- [ ] **Step 3: Write catalog pagination, state and race RED tests**

Cover every terminal state (`ready`, `unsupported`, `auth_failed`, `network_failed`, `empty`), multi-page Anthropic/Gemini traversal, repeated-cursor and 100-page loop guards, remote de-duplication, signed metadata enrichment, static/manual fallback, timeout/cancel, cache expiry and an old refresh completing after a new profile generation:

```ts
it('ignores a late response from an older profile generation', async () => {
  const oldProfile = profile({generation: 4});
  const currentProfile = profile({generation: 5});
  const oldRefresh = catalog.listModels(requestFor(oldProfile, 4));
  const current = await catalog.listModels(requestFor(currentProfile, 5));
  oldPage.resolve(remoteModels(['obsolete-model']));
  await oldRefresh;
  expect(await cache.read(cacheKeyFor(currentProfile))).toEqual(current);
});
```

Expected RED: catalog service and signed static source are missing.

- [ ] **Step 4: Implement complete remote enumeration and signed fallback**

For a registration with an official list endpoint, follow every documented cursor/page token until exhausted; never treat the first page as “all models”. Merge by exact model ID with the verified signed catalog, preferring remote availability and signed capability facts. A 2xx response with zero models is `empty`; 401/403 is `auth_failed`; abort/timeout/DNS/5xx is `network_failed`. A provider without an official list endpoint returns `unsupported`, loads verified signed candidates and permits an explicit manual model ID; a bad/expired signature yields no candidate and can never become `ready`.

`ModelCatalogCache` uses the private key `@nono:model_catalog_cache:v1`. Use a cache key of `profileId + profile.generation + registryVersion + catalogSchemaVersion`; repository writes must increment `profile.generation` whenever credential, base URL, region, channel, protocol, auth or path changes. Do not include the secret value, `secretRef`, headers or response bodies in cache data. Remote `ready` entries are fresh for 15 minutes and may be served stale for at most 24 hours only after `network_failed`; `empty` is memory-cached for 60 seconds; `auth_failed`, `network_failed` and `unsupported` are not durably cached. Enforce 10 seconds per page, 30 seconds total and 100 pages maximum. Each refresh owns an `AbortController` and monotonic request generation; profile edit/delete, new refresh and consumer unmount cancel the old request, and a late generation may neither overwrite cache nor publish state.

- [ ] **Step 5: Verify model foundation GREEN and commit**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache src/__tests__/core/engine/operateRuntime/model
npx tsc --noEmit
rg -n 'Authorization|x-api-key|x-goog-api-key|apiKey|token|password' \
  src/core/engine/operateRuntime/model --glob '!**/__tests__/**' || {
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
}
```

Expected: model suites and TypeScript pass. Scan matches are limited to auth field-name constants and local request construction; no match is in a profile, binding, cache record, error or log serializer.

Standalone execution stages the frozen contract and implementation together:

```bash
git add AwesomeProject/src/core/engine/operateRuntime/model \
  AwesomeProject/src/__tests__/core/engine/operateRuntime/model
git commit -m "feat: add provider registry transports and model catalog"
```

Master-plan Wave 1B first proves the checkpoint-owned files are untouched, then stages only implementations:

```bash
git diff --exit-code -- \
  AwesomeProject/src/core/engine/operateRuntime/model/ModelProviderContracts.ts \
  AwesomeProject/src/__tests__/core/engine/operateRuntime/model/ModelProviderContracts.test.ts
git add \
  AwesomeProject/src/core/engine/operateRuntime/model/ModelProviderRegistry.ts \
  AwesomeProject/src/core/engine/operateRuntime/model/ProviderModelCatalogService.ts \
  AwesomeProject/src/core/engine/operateRuntime/model/ModelCatalogCache.ts \
  AwesomeProject/src/core/engine/operateRuntime/model/staticCatalog \
  AwesomeProject/src/core/engine/operateRuntime/model/transports \
  AwesomeProject/src/core/engine/operateRuntime/model/index.ts \
  AwesomeProject/src/__tests__/core/engine/operateRuntime/model/ModelProviderRegistry.test.ts \
  AwesomeProject/src/__tests__/core/engine/operateRuntime/model/ProviderModelCatalogService.test.ts \
  AwesomeProject/src/__tests__/core/engine/operateRuntime/model/ModelCatalogCache.test.ts \
  AwesomeProject/src/__tests__/core/engine/operateRuntime/model/ProviderTransportAdapters.test.ts
git commit -m "feat: add provider registry transports and model catalog"
```

---

### Task 4B: Persist Independent Model And Visual-Agent Runtime Configuration

**Contract checkpoint ownership:** When this runtime plan is executed independently, Task 4B creates `VisualAgentContracts.ts` and its strict validator test from the Frozen block below. Under the master parallel plan, Wave 0 has already frozen both `ModelProviderContracts.ts` and `VisualAgentContracts.ts`; the Task 4B worker consumes them read-only, excludes them from its commit, and stops if either file differs from these interfaces. Registry, repository, config and migration implementations import the frozen types and never redeclare them.

**Files:**

- Create: `AwesomeProject/src/core/engine/agentRuntime/config/AgentConfigController.ts`
- Create: `AwesomeProject/src/core/engine/agentRuntime/config/AppAgentConfigController.ts`
- Create: `AwesomeProject/src/core/engine/agentRuntime/config/NativeLocalModelEligibilityChecker.ts`
- Create: `AwesomeProject/src/core/engine/agentRuntime/config/index.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/config/RuntimeConfigContracts.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/config/RuntimeConfigRepository.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/config/RuntimeConfigMigrationV1.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/config/RuntimeConfigStorageKeys.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/config/CredentialRetirementRepository.ts`
- Create only in standalone execution; otherwise consume read-only: `AwesomeProject/src/core/engine/operateRuntime/visualAgent/VisualAgentContracts.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/visualAgent/VisualAgentToolRegistry.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/config/LegacyOpenClawBindingPort.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/config/ConnectorBridgeLegacyOpenClawBindingClient.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/agentRuntime/config/*.test.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/operateRuntime/config/RuntimeConfigRepository.test.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/operateRuntime/config/CredentialRetirementRepository.test.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/operateRuntime/config/RuntimeConfigMigrationV1.test.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/operateRuntime/config/ConnectorBridgeLegacyOpenClawBindingClient.test.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/operateRuntime/model/ModelEndpointProfileRepository.test.ts`
- Test only in standalone execution; otherwise run the frozen test read-only: `AwesomeProject/src/__tests__/core/engine/operateRuntime/visualAgent/VisualAgentContracts.test.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/operateRuntime/visualAgent/VisualAgentToolRegistry.test.ts`
- Test: `AwesomeProject/src/__tests__/services/AgentConfigExports.test.ts`
- Test: `AwesomeProject/src/__tests__/services/AppAgentConfigController.test.ts`

**Interfaces:**

- Consumes: Task 4A profile/binding contracts, `CredentialStore`, an injected Connector Bridge origin plus `bridgeAuthSecretRef`, phase1 controller semantics, five legacy V1 model lists and legacy capability/privacy/mode/OpenClaw keys. If Bridge onboarding is unavailable, legacy OpenClaw migration fails closed and preserves every legacy byte; the checkpoint is not release-eligible until retry succeeds or the user explicitly disables/removes that legacy connector.
- Produces two independent groups inside the route config:

```ts
// AwesomeProject/src/core/engine/operateRuntime/visualAgent/VisualAgentContracts.ts
export type VisualAgentErrorCode =
  | 'visual_agent_invalid_profile'
  | 'visual_agent_adapter_not_found'
  | 'visual_agent_adapter_duplicate'
  | 'visual_agent_capability_unsupported'
  | 'visual_agent_not_ready'
  | 'visual_agent_auth_failed'
  | 'visual_agent_protocol_error'
  | 'visual_agent_disconnected'
  | 'visual_agent_execution_failed'
  | 'visual_agent_cancel_timeout'
  | 'visual_agent_approval_required'
  | 'visual_agent_resume_unsupported';

export type VisualAgentToolId =
  | 'openclaw'
  | 'codex'
  | 'cursor'
  | 'dsh'
  | 'hermes'
  | `custom:${string}`;

export interface VisualAgentCapabilitySet {
  readonly imageInput: boolean;
  readonly structuredAction: boolean;
  readonly stream: boolean;
  readonly cancel: boolean;
  readonly approval: boolean;
  readonly resume: boolean;
  readonly steer: boolean;
  readonly preferences: boolean;
}

export interface VisualAgentToolManifestV1 {
  readonly toolId: VisualAgentToolId;
  readonly displayName: string;
  readonly maturity: 'stable' | 'beta' | 'experimental';
  readonly adapterVersion: string;
  readonly protocolVersions: readonly [1];
  readonly declaredCapabilities: VisualAgentCapabilitySet;
}

export interface VisualAgentProfileV1 {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly toolId: VisualAgentToolId;
  readonly enabled: boolean;
  readonly connector: {
    readonly kind: 'connector_bridge';
    readonly bridgeUrl: string;
    readonly bindingId: string;
    readonly secretRef: string | null;
  };
  readonly requestedCapabilities: VisualAgentCapabilitySet;
}

export type VisualAgentRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type VisualAgentConnectionState =
  | {readonly status: 'disabled'}
  | {readonly status: 'disconnected'}
  | {readonly status: 'connecting'}
  | {readonly status: 'authenticating'}
  | {readonly status: 'negotiating'}
  | {
      readonly status: 'ready';
      readonly negotiatedCapabilities: VisualAgentCapabilitySet;
    }
  | {readonly status: 'failed'; readonly errorCode: VisualAgentErrorCode};

export interface VisualAgentTaskEnvelopeV1 {
  readonly protocolVersion: 1;
  readonly taskId: string;
  readonly sessionRevision: number;
  readonly profileId: string;
  readonly instruction: string;
  readonly idempotencyKey: string;
  readonly requiredCapabilities: VisualAgentCapabilitySet;
  readonly image?: {
    readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    readonly base64: string;
    readonly sharingConfirmed: true;
  };
}

export type VisualAgentJson =
  | null
  | boolean
  | number
  | string
  | readonly VisualAgentJson[]
  | {readonly [key: string]: VisualAgentJson};

export interface VisualAgentStructuredAction {
  readonly name: string;
  readonly arguments: Readonly<Record<string, VisualAgentJson>>;
}

export interface VisualAgentResultV1 {
  readonly summary: string;
  readonly visualUnderstanding?: {
    readonly description: string;
    readonly observations: readonly string[];
  };
  readonly structuredActions?: readonly VisualAgentStructuredAction[];
}

export type VisualAgentPreferenceCommand =
  | {readonly type: 'list'}
  | {
      readonly type: 'upsert';
      readonly preference: {
        readonly id: string;
        readonly kind: 'name' | 'preference';
        readonly title: string;
        readonly summary: string;
      };
    }
  | {readonly type: 'delete'; readonly preferenceId: string}
  | {readonly type: 'clear'};

export interface VisualAgentPreferenceRecord {
  readonly id: string;
  readonly kind: 'name' | 'preference';
  readonly title: string;
  readonly summary: string;
  readonly createdAtEpochMs: number;
  readonly updatedAtEpochMs: number;
}

export type VisualAgentPreferenceResult =
  | {
      readonly type: 'list';
      readonly preferences: readonly VisualAgentPreferenceRecord[];
    }
  | {readonly type: 'upsert'; readonly preference: VisualAgentPreferenceRecord}
  | {readonly type: 'delete'; readonly preferenceId: string}
  | {readonly type: 'clear'};

export type VisualAgentTaskEvent =
  | {
      readonly type: 'status';
      readonly taskId: string;
      readonly sessionRevision: number;
      readonly sequence: number;
      readonly status: 'queued' | 'running';
    }
  | {
      readonly type: 'status';
      readonly taskId: string;
      readonly sessionRevision: number;
      readonly sequence: number;
      readonly status: 'waiting_approval';
      readonly approvalId: string;
    }
  | {
      readonly type: 'delta';
      readonly taskId: string;
      readonly sessionRevision: number;
      readonly sequence: number;
      readonly textDelta?: string;
      readonly visualUnderstandingDelta?: string;
      readonly structuredAction?: VisualAgentStructuredAction;
    }
  | {
      readonly type: 'terminal';
      readonly taskId: string;
      readonly sessionRevision: number;
      readonly sequence: number;
      readonly status: 'completed';
      readonly result: VisualAgentResultV1;
    }
  | {
      readonly type: 'terminal';
      readonly taskId: string;
      readonly sessionRevision: number;
      readonly sequence: number;
      readonly status: 'failed';
      readonly errorCode: VisualAgentErrorCode;
      readonly resumeToken?: string;
    }
  | {
      readonly type: 'terminal';
      readonly taskId: string;
      readonly sessionRevision: number;
      readonly sequence: number;
      readonly status: 'cancelled';
      readonly resumeToken?: string;
    };

export type VisualAgentProtocolV1 =
  | {readonly version: 1; readonly type: 'session.open'; readonly requestId: string; readonly profileId: string; readonly toolId: VisualAgentToolId; readonly requestedCapabilities: VisualAgentCapabilitySet}
  | {readonly version: 1; readonly type: 'task.start'; readonly requestId: string; readonly envelope: VisualAgentTaskEnvelopeV1}
  | {readonly version: 1; readonly type: 'task.cancel'; readonly requestId: string; readonly taskId: string; readonly sessionRevision: number}
  | {readonly version: 1; readonly type: 'task.approval.resolve'; readonly requestId: string; readonly taskId: string; readonly sessionRevision: number; readonly approvalId: string; readonly decision: 'approve' | 'reject'}
  | {readonly version: 1; readonly type: 'task.resume'; readonly requestId: string; readonly taskId: string; readonly sessionRevision: number; readonly resumeToken: string}
  | {readonly version: 1; readonly type: 'task.steer'; readonly requestId: string; readonly taskId: string; readonly sessionRevision: number; readonly instruction: string}
  | {readonly version: 1; readonly type: 'preference.request'; readonly requestId: string; readonly command: VisualAgentPreferenceCommand}
  | {readonly version: 1; readonly type: 'session.ready'; readonly requestId: string; readonly negotiatedCapabilities: VisualAgentCapabilitySet}
  | {readonly version: 1; readonly type: 'session.failed'; readonly requestId: string; readonly errorCode: VisualAgentErrorCode}
  | {readonly version: 1; readonly type: 'task.status'; readonly requestId: string; readonly event: Extract<VisualAgentTaskEvent, {readonly type: 'status'}>}
  | {readonly version: 1; readonly type: 'task.event'; readonly requestId: string; readonly event: Extract<VisualAgentTaskEvent, {readonly type: 'delta'}>}
  | {readonly version: 1; readonly type: 'task.completed'; readonly requestId: string; readonly event: Extract<VisualAgentTaskEvent, {readonly type: 'terminal'; readonly status: 'completed'}>}
  | {readonly version: 1; readonly type: 'task.failed'; readonly requestId: string; readonly event: Extract<VisualAgentTaskEvent, {readonly type: 'terminal'; readonly status: 'failed'}>}
  | {readonly version: 1; readonly type: 'task.cancelled'; readonly requestId: string; readonly event: Extract<VisualAgentTaskEvent, {readonly type: 'terminal'; readonly status: 'cancelled'}>}
  | {readonly version: 1; readonly type: 'preference.result'; readonly requestId: string; readonly result: VisualAgentPreferenceResult}
  | {readonly version: 1; readonly type: 'protocol.error'; readonly requestId: string; readonly errorCode: 'visual_agent_protocol_error'};

export interface VisualAgentExecutionPort {
  getConnectionState(): VisualAgentConnectionState;
  connect(
    profile: VisualAgentProfileV1,
    signal: AbortSignal,
  ): Promise<VisualAgentCapabilitySet>;
  disconnect(): Promise<void>;
  execute(
    envelope: VisualAgentTaskEnvelopeV1,
    signal: AbortSignal,
  ): Promise<{taskId: string}>;
  cancel(
    input: {taskId: string; sessionRevision: number},
    signal: AbortSignal,
  ): Promise<void>;
  resolveApproval(
    input: {
      taskId: string;
      sessionRevision: number;
      approvalId: string;
      decision: 'approve' | 'reject';
    },
    signal: AbortSignal,
  ): Promise<void>;
  resume(
    input: {taskId: string; sessionRevision: number; resumeToken: string},
    signal: AbortSignal,
  ): Promise<void>;
  steer(
    input: {taskId: string; sessionRevision: number; instruction: string},
    signal: AbortSignal,
  ): Promise<void>;
  requestPreferences(
    command: VisualAgentPreferenceCommand,
    signal: AbortSignal,
  ): Promise<unknown>;
  subscribe(listener: (event: VisualAgentTaskEvent) => void): () => void;
}

export interface VisualAgentToolAdapter {
  readonly toolId: VisualAgentToolId;
  readonly manifest: VisualAgentToolManifestV1;
  create(profile: VisualAgentProfileV1): VisualAgentExecutionPort;
}

export interface VisualAgentToolRegistry {
  require(toolId: VisualAgentToolId): VisualAgentToolAdapter;
  list(): readonly VisualAgentToolId[];
}

export function validateVisualAgentCapabilitySet(
  value: unknown,
): VisualAgentCapabilitySet;
export function validateVisualAgentProfileV1(
  value: unknown,
): VisualAgentProfileV1;

// AwesomeProject/src/core/engine/operateRuntime/config/LegacyOpenClawBindingPort.ts
export interface LegacyOpenClawBindingPort {
  read(bindingId: string): Promise<
    | {readonly status: 'absent'}
    | {
        readonly status: 'staged' | 'committed';
        readonly stageId: string;
        readonly bridgeSecretRef: string;
      }
  >;
  stage(input: {
    bindingId: 'legacy-openclaw-gateway';
    toolId: 'openclaw';
    protocol: 'gateway_ws';
    gatewayUrl: string;
    deviceId: string;
    cluster: string;
    upstreamSecretRef: string;
  }): Promise<{readonly stageId: string; readonly bridgeSecretRef: string}>;
  commit(stageId: string): Promise<void>;
  rollback(stageId: string): Promise<void>;
}

export interface ConnectorBridgeLegacyBindingClientOptions {
  readonly bridgeUrl: string;
  readonly bridgeAuthSecretRef: string;
  readonly timeoutMs: 10_000;
  readonly fetch: typeof fetch;
  readonly credentials: CredentialStore;
}

export class ConnectorBridgeLegacyOpenClawBindingClient
  implements LegacyOpenClawBindingPort {
  constructor(options: ConnectorBridgeLegacyBindingClientOptions);
  read(bindingId: string): ReturnType<LegacyOpenClawBindingPort['read']>;
  stage(
    input: Parameters<LegacyOpenClawBindingPort['stage']>[0],
  ): ReturnType<LegacyOpenClawBindingPort['stage']>;
  commit(stageId: string): Promise<void>;
  rollback(stageId: string): Promise<void>;
}

// AwesomeProject/src/core/engine/operateRuntime/config/RuntimeConfigContracts.ts
export interface RuntimeRouteConfigV1 {
  readonly capabilities: Readonly<{
    phoneOperate: boolean;
    errands: boolean;
  }>;
  readonly privacy: Readonly<{
    memoryEnabled: boolean;
    memoryLocation: 'device' | 'visual_agent';
    memoryProfileId: string | null;
  }>;
  readonly modelAPI: Readonly<{
    agentConfig: Readonly<AgentConfigV2>;
    profiles: readonly ModelEndpointProfileV1[];
    bindings: readonly ModelBindingV1[];
  }>;
  readonly visualAgent: Readonly<{
    enabled: boolean;
    activeProfileId: string | null;
    profiles: readonly VisualAgentProfileV1[];
  }>;
}

export interface RuntimeConfigEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly active: RuntimeRouteConfigV1;
  readonly draft: RuntimeRouteConfigV1;
}

export interface RuntimeConfigRepository extends ModelEndpointProfileRepository {
  load(): Promise<RuntimeConfigEnvelopeV1>;
  mutateDraft(
    mutation: (draft: RuntimeRouteConfigV1) => RuntimeRouteConfigV1,
  ): Promise<RuntimeConfigEnvelopeV1>;
  activateDraft(expectedRevision: number): Promise<RuntimeConfigEnvelopeV1>;
  compareAndActivate(
    expectedRevision: number,
    mutation: (active: RuntimeRouteConfigV1) => RuntimeRouteConfigV1,
  ): Promise<RuntimeConfigEnvelopeV1>;
}

// AwesomeProject/src/core/engine/operateRuntime/config/CredentialRetirementRepository.ts
export interface CredentialRetirementRecordV1 {
  readonly schemaVersion: 1;
  readonly retirementId: string;
  readonly state: 'staged' | 'committed';
  readonly oldSecretRef: string | null;
  readonly replacementSecretRef: string | null;
  readonly createdAtMs: number;
}

export interface CredentialRetirementRepository {
  stage(input: Omit<CredentialRetirementRecordV1, 'schemaVersion' | 'state'>): Promise<void>;
  commit(retirementId: string): Promise<void>;
  rollback(retirementId: string): Promise<void>;
  list(): Promise<readonly CredentialRetirementRecordV1[]>;
  complete(retirementId: string): Promise<void>;
}
```

There is deliberately no compound persisted “model” DTO. A reusable endpoint and nullable secure `secretRef` live in `ModelEndpointProfileV1`; a selected model and runtime purpose live only in `ModelBindingV1`. Visual profiles do not masquerade as model providers and model transports do not know `toolId`, connector or upstream protocol. `CredentialRetirementRepository` persists only opaque refs under private key `@nono:credential_retirements:v1`; it never reads or deletes a credential. It accepts replacement `(old|null,new)` and removal `(old,null)` only when at least one ref is non-null, and rejects `(null,null)` as `runtime_config_invalid`. A staged record is written before a config CAS and committed after it. Immediate CAS failure may delete only the newly staged replacement and then rollback the record; a crash leaves enough information for Task 6 cold-start reconciliation without risking the old ref.

- [ ] **Step 1: Restore only reusable controller tests/modules and capture RED**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
git restore --source ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b -- \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/config \
  AwesomeProject/src/__tests__/services/AgentConfigExports.test.ts \
  AwesomeProject/src/__tests__/services/AppAgentConfigController.test.ts \
  AwesomeProject/src/core/engine/agentRuntime/config/AgentConfigController.ts \
  AwesomeProject/src/core/engine/agentRuntime/config/AppAgentConfigController.ts \
  AwesomeProject/src/core/engine/agentRuntime/config/NativeLocalModelEligibilityChecker.ts \
  AwesomeProject/src/core/engine/agentRuntime/config/index.ts
cd AwesomeProject
npm test -- --runInBand --no-cache \
  src/__tests__/core/engine/agentRuntime/config \
  src/__tests__/services/AgentConfigExports.test.ts \
  src/__tests__/services/AppAgentConfigController.test.ts
```

Expected: RED from the missing V1 repository adapter and outdated `ModelConnection` fixtures. Do not restore `AsyncStorageAgentConfigRepository.ts`, any donor connection tester or phase1 `ModelService.ts`. Rewrite controller fixtures to profile/binding IDs and inject `ModelProviderRegistry`; connection testing now normalizes `ProviderExecutionTargetV1`, resolves its OpenAI, Anthropic, Gemini or custom `ProviderTransportAdapter`, and sends that exact target.

- [ ] **Step 2: Write exact-envelope and separation RED tests**

Cover strict unknown-key rejection, profile/binding referential integrity, independent model/visual edits, frozen reads, expected-revision conflict, mutation-queue recovery, exactly-one-winner CAS, and retirement stage/commit/rollback crash states:

```ts
it('does not change visualAgent when a model binding is activated', async () => {
  const before = await repository.load();
  await repository.compareAndActivate(before.revision, active =>
    replaceBinding(active, plannerBinding),
  );
  const after = await repository.load();
  expect(after.active.visualAgent).toEqual(before.active.visualAgent);
});

it('rejects model credentials and visual tokens embedded in JSON', async () => {
  storage.getItem.mockResolvedValue(envelopeWithUnknownKey('apiKey'));
  await expect(repository.load()).rejects.toMatchObject({
    code: 'runtime_config_corrupt',
  });
});

it.each([
  capabilities({imageInput: false, structuredAction: true}),
  capabilities({imageInput: true, structuredAction: false}),
])('rejects an operation-ineligible visual profile', async requested => {
  const draft = routeWithVisualProfile(profile({requestedCapabilities: requested}));
  await expect(
    repository.compareAndActivate(0, () => draft),
  ).rejects.toMatchObject({
    code: 'visual_agent_capability_unsupported',
  });
});

it('keeps one immutable registry contract with canonical tool ids', () => {
  const registry = createVisualAgentToolRegistry(adapters);
  expect(registry.list()).toEqual([
    'openclaw',
    'codex',
    'cursor',
    'dsh',
    'hermes',
  ]);
  expect(() => registry.require('custom:missing')).toThrow(
    'visual_agent_adapter_not_found',
  );
  expect(() => createVisualAgentToolRegistry([...adapters, adapters[0]]))
    .toThrow('visual_agent_adapter_duplicate');
});

it('never deletes a superseded secret during the config CAS', async () => {
  await modelProfiles.putProfile(replacementProfile, 'new-secret');
  expect(retirements.stage).toHaveBeenCalledWith(expect.objectContaining({
    oldSecretRef: 'model:old', replacementSecretRef: expect.stringMatching(/^model:/),
  }));
  expect(retirements.stage.mock.invocationCallOrder[0])
    .toBeLessThan(credentials.put.mock.invocationCallOrder[0]);
  expect(retirements.commit.mock.invocationCallOrder[0])
    .toBeGreaterThan(runtimeStorage.setItem.mock.invocationCallOrder[0]);
  expect(credentials.delete).not.toHaveBeenCalledWith('model:old');
});
```

Expected RED: runtime config, visual contracts and `VisualAgentToolRegistry` are missing.

- [ ] **Step 3: Implement serialized repository and profile projection**

Use one rejection-safe `mutationQueue`. `mutateDraft` clones/freezes without changing revision; `activateDraft(expectedRevision)` validates both groups, clones draft to active and writes `revision + 1` once; `compareAndActivate` reads, compares, mutates and writes within one queued operation, never as `mutateDraft` followed by `activateDraft`. Reject duplicate profile IDs, dangling binding/profile references, a visual active profile not present/enabled in `visualAgent.profiles`, invalid `custom:` IDs, non-Connector-Bridge connectors, non-HTTPS/WSS bridge URLs, URL userinfo/fragments, blank binding IDs, custom model URL/path traversal, missing/invalid custom `protocol`/`auth`/`chatPath`/`modelListPath`/`declaredCapabilities`, and any model profile mode other than `preset | custom`. Custom header/query names must be bounded RFC-token identifiers; header prefix is one of the frozen non-secret literals and cannot carry arbitrary credential bytes. Custom declared modalities must be nonempty, contain only the frozen literals, include text input/output, and keep `capabilities.chat === true`; they are declarations rather than remotely verified facts. When `visualAgent.enabled` is true, its active profile must request both `imageInput: true` and `structuredAction: true`; false or unknown-equivalent input blocks activation. `privacy.memoryLocation: 'visual_agent'` requires a non-null `memoryProfileId` pointing to an enabled saved profile; `device` requires `memoryProfileId: null`.

Implement the `ModelEndpointProfileRepository` methods as an immediate atomic projection over `modelAPI.profiles`/`bindings`: each method enters the repository queue, reads the latest revision, applies one validated `compareAndActivate` mutation and leaves active/draft equal while preserving the unrelated visual group. Credential replacement is `generate new ref → retirement.stage(old|null,new) → CredentialStore.put → exact get/readback → queued config commit → retirement.commit`; a no-auth custom profile skips the secure store and does not create `(null,null)`. Stage failure performs no secure write. Put/readback/CAS failure deletes only the unreferenced new ref, verifies `get(newRef) === null`, and only then rolls back the retirement record; deletion/readback failure leaves the staged record for Task 6 crash recovery. The repository assigns `generation + 1` and invalidates the old catalog generation. Profile removal rejects any active/draft binding reference and uses `retirement.stage(old,null) → config commit → retirement.commit`; it never deletes the old ref inline because a nonterminal immutable session may still reference it. `credential_cleanup_required` is emitted only by the cold-start collector after a real secure deletion failure, without resurrecting the profile.

Adapt `AppAgentConfigController` to read/write `active.modelAPI.agentConfig` and resolve connections from `ModelBindingV1 + ModelEndpointProfileV1 + ModelProviderRegistry`. Local eligibility remains transient controller state and is not serialized into RuntimeConfig. Implement `createVisualAgentToolRegistry(adapters)` in `operateRuntime/visualAgent/VisualAgentToolRegistry.ts` as the only registry constructor: validate the five built-in IDs or a nonempty `custom:` suffix, require `adapter.toolId === adapter.manifest.toolId`, nonblank display/version, exact protocol version `[1]`, all eight declared booleans, reject duplicate IDs with `visual_agent_adapter_duplicate`, freeze a copy and make `require` throw `visual_agent_adapter_not_found` for unknown IDs. The shared adapter-conformance assertions must validate manifest/version truthfulness and reject any operation fixture whose negotiated set exceeds declared capabilities or lacks `imageInput && structuredAction`; only adapters that passed that gate may be supplied to the production factory. The public registry has no mutable `register`, default selection or OpenClaw branch. Preserve the Frozen signatures of `VisualAgentToolAdapter`, `VisualAgentToolRegistry`, `VisualAgentExecutionPort` and `VisualAgentProtocolV1` verbatim; Bridge upstream ports are defined only in the capability plan and are not added to Runtime contracts.

- [ ] **Step 4: Write transactional migration RED tests**

`RuntimeConfigMigrationV1.test.ts` owns fixtures for this exact legacy read surface and no other production file reads it:

```text
@autoglm:models
@autoglm:selected_model
@autoglm:selectedModel
@nono:models:splitVision
@nono:models:splitPlanner
@nono:models:localPlanner
@nono:models:companion
@nono:selected:splitVision
@nono:selected:splitPlanner
@nono:selected:localPlanner
@nono:selected:companion
@nono:capabilities
@nono:privacy
@nono:agent_mode
@nono:openclaw
```

Assert all five model lists map respectively to `direct`, `vision`, `split_planner`, `local_planner`, and `companion` bindings; duplicate endpoint/credential tuples reuse one profile; selected records become bindings; unselected records still become available profiles. Map the exact legacy IDs `openai → openai`, `anthropic → anthropic`, `deepseek → deepseek`, `zhipu → zhipu_glm`, `moonshot → moonshot_kimi`, and `modelscope → modelscope`; retain a non-default legacy URL as `baseURLOverride`. A recognized preset with a blank credential fails migration as required-auth. Map `custom` and every unknown legacy provider to `mode: 'custom'` with `protocol: 'openai_chat_completions'`, the legacy `apiUrl` as `baseURL`, `chatPath: '/chat/completions'`, `modelListPath: null`, and conservative `declaredCapabilities={inputModalities:['text'],outputModalities:['text'],capabilities:{chat:true,vision:'unknown',toolCalls:'unknown',reasoning:'unknown'}}`; nonblank legacy credentials use bearer auth/ref, while blank credentials use `auth.kind:'none'` plus `secretRef:null`. Put legacy `modelName` only in the corresponding `ModelBindingV1.modelId`. Never guess an unknown provider preset or infer a legacy custom profile's modalities.

Assert `@nono:openclaw` stages its gateway/device/cluster/upstream `secretRef` through `LegacyOpenClawBindingPort` under deterministic binding ID `legacy-openclaw-gateway`, then creates exactly `{schemaVersion:1,profileId:'legacy-openclaw',toolId:'openclaw',enabled,connector:{kind:'connector_bridge',bridgeUrl:injectedBridgeUrl,bindingId:'legacy-openclaw-gateway',secretRef:bridgeSecretRef},requestedCapabilities}`. The requested set has `imageInput` and `structuredAction` true and every other boolean explicit. `visualAgent.activeProfileId` points to it when the old capability was enabled. Legacy `memoryLocation: 'openclaw'` becomes `memoryLocation: 'visual_agent'` plus `memoryProfileId: 'legacy-openclaw'`; other locations set `memoryProfileId: null`. Runtime JSON never contains gateway/device/cluster, an upstream credential, `adapterId`, endpoint or the old top-level `openClaw` object. A plaintext legacy OpenClaw token fails migration instead of being copied into the mobile profile.

Inject failures at legacy read, secure put, readback, envelope write, envelope re-read and legacy scrub. Expected RED: migration module is missing.

`ConnectorBridgeLegacyOpenClawBindingClient.test.ts` separately asserts one stage POST with a request-local upstream credential, deterministic local Bridge credential storage/readback, idempotent `read`, exact commit/rollback URLs, rollback cleanup ordering, redirect rejection, timeout abort, 64 KiB response cap and sanitized failures. A sentinel upstream token, Bridge token, gateway URL, device and cluster must be absent from every serialized profile, thrown error, logger call and test snapshot.

- [ ] **Step 5: Implement the exact migration transaction**

Export only these constants from new `RuntimeConfigStorageKeys.ts`; existing shared storage files remain untouched in both execution modes:

```ts
export const RUNTIME_STORAGE_KEYS = {
  RUNTIME_CONFIG_V1: '@nono:runtime_config:v1',
  OPERATE_SESSIONS_V1: '@nono:operate_sessions:v1',
  RUNTIME_CONFIG_MIGRATION_V1: '@nono:runtime_config_migration:v1',
  CREDENTIAL_RETIREMENTS_V1: '@nono:credential_retirements:v1',
} as const;
```

`RuntimeConfigRepository.load()` invokes `RuntimeConfigMigrationV1.run()` when `RUNTIME_CONFIG_V1` is absent or the migration marker is cleanup-pending. A valid envelope with a completed marker bypasses all legacy model-key reads; a cleanup-pending marker performs scrub only. Read and byte-buffer the complete legacy set before the first write. For every distinct model API plaintext credential, execute `CredentialStore.put(secretRef, plaintext)`, `CredentialStore.get(secretRef)` and exact readback verification. For legacy OpenClaw, call `LegacyOpenClawBindingPort.read`, then `stage` with the upstream ref and gateway metadata; build the runtime profile only from the injected Connector Bridge URL, deterministic binding ID and returned bridge secret ref. Write and re-read/validate the envelope, then commit the staged bridge binding, write the migration marker and scrub legacy keys. Envelope/CAS or readback failure calls `rollback(stageId)` and preserves legacy bytes; binding commit failure retains a cleanup-pending marker and retries by deterministic IDs without duplicating a binding. A legacy scrub failure retains the verified envelope/committed binding and retries only remaining scrub. Unknown model providers migrate as custom profiles, never as guessed presets.

`ConnectorBridgeLegacyOpenClawBindingClient` is the production implementation of that port, so the capability wave does not create a second migration owner. It accepts only an injected HTTPS/WSS Bridge origin without userinfo or fragment. `stage` reads both `upstreamSecretRef` and `bridgeAuthSecretRef` from `CredentialStore` at the request boundary, sends the upstream credential exactly once to `POST /v1/visual-agent/bindings/stages` under Bridge bearer authentication, caps the response at 64 KiB, stores the returned short-lived Bridge credential under the deterministic local ref `visual-agent-bridge:legacy-openclaw-gateway`, verifies readback, and returns only `{stageId, bridgeSecretRef}`. `read` calls `GET /v1/visual-agent/bindings/legacy-openclaw-gateway`, maps only `absent | staged | committed`, and rejects a remote binding whose local Bridge credential is missing. `commit` and `rollback` call the matching stage endpoint with the same 10-second abort timeout; rollback deletes the local Bridge credential only after the server acknowledges rollback. A timeout, non-2xx response, malformed JSON, cross-origin redirect, missing secure value, or credential readback failure returns a sanitized stable migration error, leaves legacy bytes untouched, and never logs a URL query, auth header, upstream credential, Bridge token, gateway/device/cluster value, or raw body.

- [ ] **Step 6: Verify config/migration GREEN and commit**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache \
  src/__tests__/core/engine/agentRuntime/config \
  src/__tests__/core/engine/operateRuntime/config \
  src/__tests__/core/engine/operateRuntime/model/ModelEndpointProfileRepository.test.ts \
  src/__tests__/core/engine/operateRuntime/visualAgent/VisualAgentContracts.test.ts \
  src/__tests__/core/engine/operateRuntime/visualAgent/VisualAgentToolRegistry.test.ts \
  src/__tests__/services/AgentConfigExports.test.ts \
  src/__tests__/services/AppAgentConfigController.test.ts
npx tsc --noEmit
rg -n 'openClaw\s*:|adapterId|gatewayUrl|deviceId|cluster|apiKey\s*:|token\s*:|password\s*:' \
  src/core/engine/operateRuntime src/core/engine/agentRuntime/config \
  src/core/engine/operateRuntime/visualAgent \
  --glob '!**/RuntimeConfigMigrationV1.ts' \
  --glob '!**/LegacyOpenClawBindingPort.ts' \
  --glob '!**/__tests__/**' || {
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
}
```

Expected: suites and TypeScript pass. The scan has no persisted DTO match; any auth-name match is confined to strict rejection constants or request-local transport code already classified in Task 4A.

Standalone execution stages the frozen visual contract and implementation together:

```bash
git add AwesomeProject/src/core/engine/agentRuntime/config \
  AwesomeProject/src/core/engine/operateRuntime/visualAgent/VisualAgentToolRegistry.ts \
  AwesomeProject/src/core/engine/operateRuntime/config \
  AwesomeProject/src/core/engine/operateRuntime/visualAgent/VisualAgentContracts.ts \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/config \
  AwesomeProject/src/__tests__/core/engine/operateRuntime/config \
  AwesomeProject/src/__tests__/core/engine/operateRuntime/model/ModelEndpointProfileRepository.test.ts \
  AwesomeProject/src/__tests__/core/engine/operateRuntime/visualAgent/VisualAgentContracts.test.ts \
  AwesomeProject/src/__tests__/core/engine/operateRuntime/visualAgent/VisualAgentToolRegistry.test.ts \
  AwesomeProject/src/__tests__/services/AgentConfigExports.test.ts \
  AwesomeProject/src/__tests__/services/AppAgentConfigController.test.ts
git commit -m "feat: persist model profiles and visual agent routes"
```

Master-plan Wave 1B first proves both Wave 0 contracts are untouched, then stages only implementations:

```bash
git diff --exit-code -- \
  AwesomeProject/src/core/engine/operateRuntime/model/ModelProviderContracts.ts \
  AwesomeProject/src/core/engine/operateRuntime/visualAgent/VisualAgentContracts.ts \
  AwesomeProject/src/__tests__/core/engine/operateRuntime/model/ModelProviderContracts.test.ts \
  AwesomeProject/src/__tests__/core/engine/operateRuntime/visualAgent/VisualAgentContracts.test.ts
git add AwesomeProject/src/core/engine/agentRuntime/config \
  AwesomeProject/src/core/engine/operateRuntime/visualAgent/VisualAgentToolRegistry.ts \
  AwesomeProject/src/core/engine/operateRuntime/config \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/config \
  AwesomeProject/src/__tests__/core/engine/operateRuntime/config \
  AwesomeProject/src/__tests__/core/engine/operateRuntime/model/ModelEndpointProfileRepository.test.ts \
  AwesomeProject/src/__tests__/core/engine/operateRuntime/visualAgent/VisualAgentToolRegistry.test.ts \
  AwesomeProject/src/__tests__/services/AgentConfigExports.test.ts \
  AwesomeProject/src/__tests__/services/AppAgentConfigController.test.ts
git commit -m "feat: persist model profiles and visual agent routes"
```

The existing `ApiProviderSelector`, `ModelNameSelector`, `ModelListService`, `ModelService`, `AddModelScreen`, `EditModelScreen`, `CompanionConfigScreen`, `NonoConfigService` and `PhoneOperateScreen` are not modified by Tasks 4A/4B. A later UI integration plan must wire those selectors/services/screens to `ModelProviderRegistry`, `ProviderModelCatalogPort` and `ModelEndpointProfileRepository`; this foundation delivers contracts, repositories, migration, catalog and transports only.

---

### Task 5: Serialize Task History And Expose TaskInstructionPort

**Files:**

- Modify: `AwesomeProject/src/features/task/services/TaskHistoryService.ts`
- Modify: `AwesomeProject/src/core/engine/taskEngine/types/Task.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/ports/TaskInstructionPort.ts`
- Modify: `AwesomeProject/src/__tests__/services/TaskHistoryService.test.ts`

**Interfaces:**

- Consumes: one `STORAGE_KEYS.TASKS` array and existing Task history screens.
- Produces:

```ts
export interface TaskInstructionPort {
  load(taskId: string): Promise<string | null>;
}

export interface PersistedTaskV2 extends Task {
  readonly schemaVersion: 2;
  readonly sessionRevision: number;
}
```

`TaskHistoryService` remains compatible with `saveTask`, `getAllTasks`, `getTaskById`, `getTasksByModelId`, `deleteTask`, and `deleteTasksByModelId`; `load(taskId)` returns only the trimmed instruction or `null`.

- [ ] **Step 1: Add concurrency/terminal/privacy RED tests**

```ts
it('does not lose either task across concurrent read-modify-write calls', async () => {
  await Promise.all([service.saveTask(taskA), service.saveTask(taskB)]);
  expect(await service.getAllTasks()).toEqual(
    expect.arrayContaining([taskA, taskB]),
  );
});

it('keeps the queue usable after a failed write', async () => {
  storage.setItem.mockRejectedValueOnce(new Error('write failed'));
  await expect(service.saveTask(taskA)).rejects.toThrow('write failed');
  await expect(service.saveTask(taskB)).resolves.toBeUndefined();
});

it('rejects a terminal task transition back to running', async () => {
  await service.saveTask(successTask);
  await expect(service.saveTask({...successTask, status: 'running'})).rejects
    .toMatchObject({code: 'task_terminal_transition_rejected'});
});
```

Also assert no write to `TASKS_BY_MODEL_PREFIX`, same-id idempotency, deterministic oldest trimming, instruction lookup, and serialized stored JSON without `apiKey`, `secretRef`, `data:image`, screenshot URI or raw provider response fixtures.

Run:

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache src/__tests__/services/TaskHistoryService.test.ts
```

Expected: concurrent save loses one record or writes an inconsistent secondary index; terminal regression is accepted.

- [ ] **Step 2: Port the verified queue pattern, not the donor file wholesale**

Use `e5bdbe1` lines 10–24 as the behavioral source. Every mutating method goes through `enqueueMutation`; reads inside a mutation call `readAllTasksStrict()` and never the forgiving public `getAllTasks()`. Derive `getTasksByModelId` from the primary list and stop writing/removing model index keys.

- [ ] **Step 3: Enforce terminal and safe-step serialization**

Before replacing an existing task, reject `success|failed → idle|waiting|running`. Serialize history steps through a projection that keeps step number, timestamp, safe action description/details and bounded summary, but drops `screenshotUri` and `modelResponse`. Preserve full instruction in the Task repository because the runner loads it by `taskId`; logs and Headless payload still may not carry it.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- --runInBand --no-cache \
  src/__tests__/services/TaskHistoryService.test.ts \
  src/__tests__/hooks/useTaskHistory.test.ts
npx tsc --noEmit
```

Expected: both suites and TypeScript pass; concurrent operations retain both records, failed writes do not poison the queue, terminal regressions reject with the stable code, and model queries use the main list.

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/features/task/services/TaskHistoryService.ts \
  AwesomeProject/src/core/engine/taskEngine/types/Task.ts \
  AwesomeProject/src/core/engine/operateRuntime/ports/TaskInstructionPort.ts \
  AwesomeProject/src/__tests__/services/TaskHistoryService.test.ts
git commit -m "fix: serialize task history and protect terminal state"
```

---

### Task 6: Persist Immutable Operate Sessions

**Parallel-plan ownership:** Standalone execution creates the collector/test in this Task after Task 4B exists. Under `2026-08-20-v1-complete-parallel-delivery.md`, the Wave 1B session worker owns session contracts/resolver/store only and does not create or import `CredentialReferenceGarbageCollector`; after config and session commits are cherry-picked, the integration coordinator creates the collector/test serially from the exact Task 4B repository and Task 6 store APIs. This prevents sibling branches from inventing a retirement-port alias.

**Files:**

- Create: `AwesomeProject/src/core/engine/operateRuntime/session/OperateSessionContracts.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/session/OperateSessionResolver.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/session/OperateSessionStore.ts`
- Create in standalone execution; under master integration coordinator owns: `AwesomeProject/src/core/engine/operateRuntime/session/CredentialReferenceGarbageCollector.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/OperateRuntime.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/operateRuntime/session/OperateSessionResolver.test.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/operateRuntime/session/OperateSessionStore.test.ts`
- Test in standalone execution; under master integration coordinator owns: `AwesomeProject/src/__tests__/core/engine/operateRuntime/session/CredentialReferenceGarbageCollector.test.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/operateRuntime/session/OperateRuntime.test.ts`

**Interfaces:**

- Consumes: active `RuntimeConfigEnvelopeV1`, `ModelProviderRegistry`, frozen `VisualAgentToolRegistry`/`VisualAgentToolAdapter`/`VisualAgentExecutionPort`, safe profile/role bindings, local eligibility, `TaskInstructionPort`, Task 4B `CredentialRetirementRepository`, and `CredentialStore` only inside the cold-start collector.
- Produces:

```ts
export interface ResolvedModelBindingSnapshotV1 extends ProviderExecutionTargetV1 {
  readonly role: ModelRole;
  readonly bindingId: string;
  readonly profileId: string;
  readonly modelId: string;
  readonly maxSteps: number;
}

export interface ResolvedVisualAgentSnapshotV1 {
  readonly profileId: string;
  readonly toolId: VisualAgentToolId;
  readonly connector: Readonly<VisualAgentProfileV1['connector']>;
  readonly negotiatedCapabilities: Readonly<VisualAgentCapabilitySet>;
}

export interface ResolvedOperateSessionV1 {
  readonly schemaVersion: 1;
  readonly taskId: string;
  readonly sessionRevision: number;
  readonly configRevision: number;
  readonly channel:
    | 'cloud_direct'
    | 'cloud_split'
    | 'local_vision_cloud_planner'
    | 'visual_agent';
  readonly modelBindings: Readonly<{
    direct?: ResolvedModelBindingSnapshotV1;
    vision?: ResolvedModelBindingSnapshotV1;
    planner?: ResolvedModelBindingSnapshotV1;
  }>;
  readonly localModelId?: 'minicpm-v-4.6-q4';
  readonly visualAgent?: ResolvedVisualAgentSnapshotV1;
  readonly createdAtMs: number;
}

export type OperateSessionOwner = 'foreground' | 'headless';

export interface OperateSessionLease {
  readonly session: ResolvedOperateSessionV1;
  readonly owner: OperateSessionOwner;
  readonly signal: AbortSignal;
  cancel(reason?: string): boolean;
  markTerminal(kind: 'success' | 'failed' | 'cancelled'): Promise<boolean>;
  release(): Promise<void>;
}

export class CredentialReferenceGarbageCollector {
  constructor(
    runtimeConfig: RuntimeConfigRepository,
    sessions: OperateSessionStore,
    retirements: CredentialRetirementRepository,
    credentials: CredentialStore,
  );
  reconcileBeforeAcceptingTasks(): Promise<void>;
}
```

- [ ] **Step 1: Write immutable-resolution RED tests**

Cover all four channels, missing role bindings, required-auth versus no-auth profiles, stale/missing credentials by ref, local eligibility, visual-agent priority, registry miss, failed capability negotiation, disconnection and later model/visual config mutation:

```ts
it('does not change a session after config and model edits', async () => {
  const created = await runtime.createSession({taskId: 'task-1'});
  expect(created.ok).toBe(true);
  await configRepository.mutateDraft(changeEveryBinding);
  await configRepository.activateDraft(1);
  const loaded = await sessionStore.load('task-1');
  expect(loaded?.session).toEqual(created.ok ? created.session : undefined);
  expect(Object.isFrozen(loaded?.session)).toBe(true);
});

it('snapshots every custom execution field before later profile edits', async () => {
  const created = await runtime.createSession({taskId: 'custom-task'});
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error(created.code);
  await configRepository.compareAndActivate(created.session.configRevision, replaceCustomProfile({
    baseURL: 'https://changed.example', chatPath: '/changed', auth: {kind: 'none'},
  }));
  const target = created.session.modelBindings.direct!;
  expect(target).toEqual(expect.objectContaining({
    provider: 'custom', bindingId: 'binding:custom-direct', baseURL: 'https://custom.example',
    protocol: 'custom_http_json',
    auth: {kind: 'header', headerName: 'X-API-Key', prefix: ''},
    chatPath: '/v2/agent/run', region: 'cn', channel: 'mobile',
  }));
  expect(modelProviderRegistry.resolveExecutionTarget).toHaveBeenCalledWith(
    customProfile,
    customDescriptor,
    'user_declared_unverified',
  );
  expect(executionTargetFromModelSnapshot(target)).toEqual(expect.objectContaining({
    provider: 'custom', secretRef: 'model:custom-secret',
  }));
});

it('snapshots the negotiated visual authority fields only', async () => {
  visualAdapter.create.mockReturnValue(visualExecution);
  visualExecution.connect.mockResolvedValue(operationCapabilities);
  const result = await runtime.createSession({taskId: 'task-1'});
  expect(result).toEqual(expect.objectContaining({
    ok: true,
    session: expect.objectContaining({
      channel: 'visual_agent',
      visualAgent: {
        profileId: 'profile-1',
        toolId: 'openclaw',
        connector: connectorBridgeRef,
        negotiatedCapabilities: operationCapabilities,
      },
    }),
  }));
});

it('blocks a disconnected visual agent without model fallback', async () => {
  visualExecution.connect.mockRejectedValue(
    capabilityError('visual_agent_disconnected'),
  );
  const result = await runtime.createSession({taskId: 'task-1'});
  expect(result).toEqual({ok: false, code: 'visual_agent_disconnected'});
  expect(modelBindingResolver.resolve).not.toHaveBeenCalled();
});

it('keeps a retired ref while a nonterminal session pins it, then collects it on a later cold start', async () => {
  retirements.list.mockResolvedValue([committedRetirement('model:old')]);
  sessions.listNonterminal.mockResolvedValue([sessionUsing('model:old')]);
  await collector.reconcileBeforeAcceptingTasks();
  expect(credentials.delete).not.toHaveBeenCalled();

  sessions.listNonterminal.mockResolvedValue([]);
  await collector.reconcileBeforeAcceptingTasks();
  expect(credentials.delete).toHaveBeenCalledWith('model:old');
  expect(retirements.complete).toHaveBeenCalled();
});
```

Expected RED: session modules are missing.

- [ ] **Step 2: Implement a strict resolver with no live lookups after creation**

When `active.visualAgent.enabled` is true, resolve and validate the enabled `activeProfileId`, call `VisualAgentToolRegistry.require(profile.toolId)`, create the canonical execution port through `VisualAgentToolAdapter.create(profile)`, then call `VisualAgentExecutionPort.connect(profile, signal)`. Negotiated values must be a subset of requested values and must include `imageInput: true` plus `structuredAction: true`; otherwise return `visual_agent_capability_unsupported`. Produce `channel: 'visual_agent'` and snapshot exactly `profileId`, `toolId`, the connector object and `negotiatedCapabilities`; never add adapter-specific endpoints or resolve model profiles. Registry miss, auth, protocol, not-ready and disconnect remain generic `visual_agent_*` codes with no tool-name branch and no model fallback.

Otherwise resolve the roles required by `active.modelAPI.agentConfig`: `direct`, `vision` plus `split_planner`, or `local_planner`. Join each `ModelBindingV1` to one `ModelEndpointProfileV1` and one effective `ProviderModelDescriptor`, determine its trust label, call `ModelProviderRegistry.resolveExecutionTarget(profile, descriptor, capabilityTrust)` exactly once, and copy that normalized immutable target plus binding/model identity into the session. `modelListPath`, display label and catalog cache generation are deliberately excluded because they cannot affect an already-created chat task. Preset facts come from remote/signed descriptors and receive the matching verified trust label; a custom profile copies its complete `declaredCapabilities` into a manual descriptor and is always labeled `user_declared_unverified`. Before snapshot, reject a binding whose role needs image input when its target modality declaration omits image or whose target transport cannot express the required request. A null ref is valid only for `mode:'custom'` plus `auth.kind:'none'`; every required-auth preset/custom profile blocks before network work. If local eligibility is not `ready`, return `local_model_not_ready`; never substitute direct or cloud vision for a failed branch. Export pure `executionTargetFromModelSnapshot`/`bindingFromModelSnapshot` helpers that reconstruct exactly the frozen DTOs required by `ProviderTransportAdapter.sendChat`; the former copies only `ProviderExecutionTargetV1` fields and the latter preserves `bindingId`. Neither helper reads RuntimeConfig, the provider registry or a profile repository.

Allocate `sessionRevision` from the session store's monotonic counter; do not reuse `configRevision`, because multiple tasks may start under the same active config. Preserve the source config revision separately in `ResolvedOperateSessionV1.configRevision`.

- [ ] **Step 3: Implement durable records with immutable payload and mutable metadata**

Persist one versioned session envelope under `RUNTIME_STORAGE_KEYS.OPERATE_SESSIONS_V1`. A record contains immutable `session` and separate `claim`/`terminal` metadata. Serialize create/claim/terminal/release mutations, compare `taskId + sessionRevision`, reject a second active task, and keep the newest 100 terminal tombstones to reject replay after restart.

`CredentialReferenceGarbageCollector.reconcileBeforeAcceptingTasks()` runs only during production cold-start composition, after RuntimeConfig migration/load and session recovery, before any `createSession` call is admitted. Build a set from every non-null ref in active and draft model profiles, active and draft visual profiles, and every nonterminal session's model/visual snapshot. For a committed retirement with non-null `oldSecretRef`, delete it only when absent from that set, then complete the record; a committed create record with null old ref completes without deletion. For a staged replacement, a referenced replacement means the CAS committed and the nullable old ref follows committed logic; an unreferenced replacement is a CAS/crash orphan, so delete only the replacement and rollback the record. For a staged removal, `(null,null)` is invalid; a non-null old ref still in config rolls back safely, one present only in a nonterminal session becomes committed and waits, and an entirely unreferenced old ref is deleted and completed. Each delete must be followed by `get(ref) === null` verification; failure leaves the record intact, returns sanitized `credential_cleanup_required`, and prevents accepting a new operation task until a retry succeeds. Logs contain only reason code/count, never a ref. Runtime edits never invoke this collector, so an in-flight immutable session cannot lose its credential mid-task.

- [ ] **Step 4: Verify restart, claim and terminal GREEN**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache src/__tests__/core/engine/operateRuntime/session
npx tsc --noEmit
```

Expected: session suites pass, including restart claim, stale revision, duplicate owner, terminal replay, duplicate terminal/release, bounded tombstone eviction, staged-retirement crash recovery, live-session ref retention and post-terminal cold-start collection. Serialized fixture contains neither resolved secret nor instruction/screenshot/response.

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/core/engine/operateRuntime/session \
  AwesomeProject/src/core/engine/operateRuntime/OperateRuntime.ts \
  AwesomeProject/src/__tests__/core/engine/operateRuntime/session
git commit -m "feat: persist immutable operate sessions"
```

---

### Task 7: Build The Only OperateTaskRunner

**Parallel-plan ownership:** standalone execution owns every Task 7 file below. Under `2026-08-20-v1-complete-parallel-delivery.md`, Agent C owns only `operateRuntime/runner/**` and its two tests; after cherry-picking that branch, the integration coordinator alone modifies `operateRuntime/index.ts`, the three listed `taskEngine` files and donor `TaskExecutionEngine.test.ts`. Neither side edits Task 4A provider/transport files.

**Files:**

- Create: `AwesomeProject/src/core/engine/operateRuntime/runner/OperateTaskPorts.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/runner/SnapshotAgentRuntimeAdapter.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/runner/OperateTaskRunner.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/runner/OperateTaskRunnerFactory.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/index.ts`
- Modify: `AwesomeProject/src/core/engine/taskEngine/task/TaskExecutionContracts.ts`
- Replace: `AwesomeProject/src/core/engine/taskEngine/task/TaskExecutionEngine.ts`
- Modify: `AwesomeProject/src/core/engine/taskEngine/index.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/operateRuntime/runner/OperateTaskRunner.test.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/operateRuntime/runner/SnapshotAgentRuntimeAdapter.test.ts`
- Adapt test donor: `AwesomeProject/src/__tests__/engine/TaskExecutionEngine.test.ts`

**Interfaces:**

- Consumes: `ResolvedOperateSessionV1`, donor `AgentRuntime.decideStep`, exact `ModelProviderRegistry`/`ProviderTransportAdapter`, `executionTargetFromModelSnapshot`/`bindingFromModelSnapshot`, exact lease, instruction port, frozen `VisualAgentToolRegistry`/`VisualAgentExecutionPort`, screenshot/action/confirmation/history/event/lifecycle ports.
- Produces:

```ts
export interface OperateTaskEventBase {
  readonly taskId: string;
  readonly sessionRevision: number;
  readonly sequence: number;
}

export interface RegistryModelChatPort {
  send(
    snapshot: ResolvedModelBindingSnapshotV1,
    messages: readonly ProviderChatMessageV1[],
    signal: AbortSignal,
  ): Promise<ProviderChatResultV1>;
}

export class RegistryModelChatAdapter implements RegistryModelChatPort {
  constructor(registry: ModelProviderRegistry);
  send(
    snapshot: ResolvedModelBindingSnapshotV1,
    messages: readonly ProviderChatMessageV1[],
    signal: AbortSignal,
  ): Promise<ProviderChatResultV1>;
}

export interface SnapshotAgentRuntimePort {
  decideStep(
    session: ResolvedOperateSessionV1,
    input: RuntimeStepInput,
  ): Promise<RuntimeStepResult>;
}

export class SnapshotAgentRuntimeAdapter implements SnapshotAgentRuntimePort {
  constructor(
    chat: RegistryModelChatPort,
    localPerceptionProviderFactory: AgentRuntimeFactoryDependencies['localPerceptionProviderFactory'],
    viewportAdapter: RuntimeViewportAdapter,
    invalidateLocalEligibility: AgentRuntimeFactoryDependencies['invalidateLocalEligibility'],
  );
  decideStep(
    session: ResolvedOperateSessionV1,
    input: RuntimeStepInput,
  ): Promise<RuntimeStepResult>;
}

export interface OperateTaskRunnerPorts {
  readonly instruction: TaskInstructionPort;
  readonly screenshot: {
    capture(signal: AbortSignal): Promise<string>;
  };
  readonly snapshotAgentRuntime: SnapshotAgentRuntimePort;
  readonly visualAgentRegistry: VisualAgentToolRegistry;
  readonly visualAgentImage: {
    capture(signal: AbortSignal): Promise<
      NonNullable<VisualAgentTaskEnvelopeV1['image']>
    >;
  };
  readonly visualAgentApproval: {
    decide(approvalId: string, signal: AbortSignal): Promise<
      'approve' | 'reject'
    >;
  };
  readonly action: {
    execute(action: TaskAction, signal: AbortSignal): Promise<void>;
  };
  readonly confirmation: {
    confirm(action: TaskAction, signal: AbortSignal): Promise<boolean>;
  };
  readonly history: Pick<
    typeof taskHistoryService,
    'saveTask' | 'getTaskById'
  >;
  readonly events: {emit(event: OperateTaskEvent): void | Promise<void>};
  readonly now: () => number;
  readonly delay: (ms: number, signal: AbortSignal) => Promise<void>;
}

export class OperateTaskRunner {
  run(lease: OperateSessionLease): Promise<OperateTaskOutcome>;
}
```

- [ ] **Step 1: Port behavior tests from `e5bdbe1`, rewrite them against runner ports, and capture RED**

Required cases: complete stops after one inference; running/action/terminal persistence order; consecutive error reset; confirmation rejection; max steps; cancel during screenshot/inference/confirmation/action/delay; terminal persistence failure never emits success; history contains no images; event sequence strictly increases; terminal called exactly once.

Add channel tests:

```ts
import fs from 'node:fs';
import path from 'node:path';

it.each(['cloud_direct', 'cloud_split', 'local_vision_cloud_planner'] as const)(
  'runs %s through the snapshot-bound AgentRuntime adapter and the same action port',
  async channel => {
    const lease = createLease({channel});
    await runner.run(lease);
    expect(snapshotAgentRuntime.decideStep).toHaveBeenCalledWith(
      lease.session,
      expect.objectContaining({signal: lease.signal}),
    );
    expect(action.execute).toHaveBeenCalledTimes(1);
  },
);

it.each([
  ['openai-compatible', openAICompatibleSnapshot, openAITransport],
  ['anthropic', anthropicSnapshot, anthropicTransport],
  ['gemini', geminiSnapshot, geminiTransport],
  ['custom', customSnapshot, customTransport],
] as const)('dispatches the immutable %s snapshot through its exact registry transport', async (_name, snapshot, transport) => {
  registry.resolveTransport.mockReturnValue(transport);
  await new RegistryModelChatAdapter(registry).send(
    snapshot,
    [{role: 'user', text: 'safe prompt'}],
    signal,
  );
  expect(registry.resolveTransport).toHaveBeenCalledWith(
    executionTargetFromModelSnapshot(snapshot),
  );
  expect(transport.sendChat).toHaveBeenCalledWith({
    target: executionTargetFromModelSnapshot(snapshot),
    binding: bindingFromModelSnapshot(snapshot),
    messages: [{role: 'user', text: 'safe prompt'}],
    signal,
    timeoutMs: 30_000,
  });
});

it('passes every literal immutable execution field to transport without re-normalizing the preset', async () => {
  const snapshot: ResolvedModelBindingSnapshotV1 = {
    role: 'direct', bindingId: 'binding:anthropic-direct', profileId: 'profile:anthropic',
    provider: 'anthropic', transportAdapterId: 'anthropic', protocol: 'anthropic_messages',
    baseURL: 'https://snapshot.anthropic.example/v1',
    auth: {kind: 'header', headerName: 'x-api-key', prefix: ''},
    chatPath: '/snapshot/messages', region: 'us', channel: 'mobile',
    secretRef: 'model:anthropic-old', modelId: 'claude-snapshot', maxSteps: 8,
    inputModalities: ['text', 'image'], outputModalities: ['text'],
    capabilities: {chat: true, vision: true, toolCalls: false, reasoning: 'unknown'},
    capabilityTrust: 'verified_signed',
  };
  registry.resolveTransport.mockReturnValue(anthropicTransport);
  await new RegistryModelChatAdapter(registry).send(snapshot, [{role: 'user', text: 'safe prompt'}], signal);
  expect(registry.resolveExecutionTarget).not.toHaveBeenCalled();
  expect(anthropicTransport.sendChat).toHaveBeenCalledWith(expect.objectContaining({
    target: {
      provider: 'anthropic', transportAdapterId: 'anthropic', protocol: 'anthropic_messages',
      baseURL: 'https://snapshot.anthropic.example/v1',
      auth: {kind: 'header', headerName: 'x-api-key', prefix: ''},
      chatPath: '/snapshot/messages', region: 'us', channel: 'mobile',
      secretRef: 'model:anthropic-old',
      inputModalities: ['text', 'image'], outputModalities: ['text'],
      capabilities: {chat: true, vision: true, toolCalls: false, reasoning: 'unknown'},
      capabilityTrust: 'verified_signed',
    },
  }));
});

it('fails closed when registry transport identity differs from the immutable snapshot', async () => {
  registry.resolveTransport.mockReturnValue(geminiTransport);
  await expect(new RegistryModelChatAdapter(registry).send(
    {...anthropicSnapshot, transportAdapterId: 'anthropic'},
    [{role: 'user', text: 'safe prompt'}],
    signal,
  )).rejects.toThrow('model_transport_snapshot_mismatch');
  expect(geminiTransport.sendChat).not.toHaveBeenCalled();
});

it.each([
  ['cloud_direct', directSession, ['direct'], 0],
  ['cloud_split', cloudSplitSession, ['vision', 'planner'], 0],
  ['local_vision_cloud_planner', localPlannerSession, ['planner'], 1],
] as const)('maps %s to only its frozen provider roles', async (_channel, session, roles, localCalls) => {
  chat.send.mockClear();
  localPerceptionProviderFactory.mockClear();
  await snapshotRuntime.decideStep(session, runtimeInput);
  expect(chat.send.mock.calls.map(([snapshot]) => snapshot)).toEqual(
    roles.map(role => session.modelBindings[role]),
  );
  expect(localPerceptionProviderFactory).toHaveBeenCalledTimes(localCalls);
});

it('has no live config, profile repository, catalog, or feature-model dependency', () => {
  const source = fs.readFileSync(path.resolve(
    'src/core/engine/operateRuntime/runner/SnapshotAgentRuntimeAdapter.ts',
  ), 'utf8');
  expect(source).not.toMatch(/RuntimeConfigRepository|ModelEndpointProfileRepository|ProviderModelCatalogPort|ModelService/);
});

it('executes visual_agent through the frozen task envelope contract', async () => {
  const lease = createLease({channel: 'visual_agent'});
  visualAdapter.create.mockReturnValue(visualAgent);
  await runner.run(lease);
  expect(visualAgentRegistry.require).toHaveBeenCalledWith(
    lease.session.visualAgent!.toolId,
  );
  expect(visualAgent.connect).toHaveBeenCalledWith(
    profileFromSnapshot(lease.session.visualAgent!),
    lease.signal,
  );
  expect(visualAgent.execute).toHaveBeenCalledWith(
    expect.objectContaining({
      protocolVersion: 1,
      taskId: 'task-1',
      sessionRevision: lease.session.sessionRevision,
      profileId: lease.session.visualAgent!.profileId,
      instruction: 'stored instruction',
      requiredCapabilities:
        lease.session.visualAgent!.negotiatedCapabilities,
      image: expect.objectContaining({sharingConfirmed: true}),
    }),
    lease.signal,
  );
  expect(snapshotAgentRuntime.decideStep).not.toHaveBeenCalled();
  expect(screenshot.capture).not.toHaveBeenCalled();
  expect(visualAgentImage.capture).toHaveBeenCalledWith(lease.signal);
});

it('loads instruction only from TaskInstructionPort', async () => {
  await runner.run(createLease());
  expect(instruction.load).toHaveBeenCalledWith('task-1');
  expect(snapshotAgentRuntime.decideStep).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({instruction: 'stored instruction'}),
  );
});
```

Expected RED: missing runner modules.

- [ ] **Step 2: Implement the single loop**

For the three model channels, the only production `while` loop for task execution belongs in `OperateTaskRunner.run`. At each step: check abort; capture screenshot; call `SnapshotAgentRuntimePort.decideStep(lease.session, input)`; confirm high-risk action; execute; persist a safe step; emit a task-scoped event; delay with the same signal. Never persist screenshot URI, raw observation or raw provider response.

For `visual_agent`, rebuild only the canonical profile fields from the immutable snapshot (`schemaVersion:1`, enabled, profile/tool/connector and requested capabilities equal to the snapshot's negotiated set), resolve the same canonical adapter with `visualAgentRegistry.require(toolId)`, call `adapter.create(profile)`, then `connect`; reject if the new negotiated set no longer contains the snapshotted `imageInput && structuredAction` authority. Capture one consent-marked image through `visualAgentImage`, subscribe before starting, and call `execute` once with `VisualAgentTaskEnvelopeV1`; `idempotencyKey` is `${taskId}:${sessionRevision}`. Correlate every event by task/session, require strictly increasing sequence and exactly one terminal event. On `waiting_approval`, call `visualAgentApproval.decide` then the frozen `resolveApproval`; on abort call frozen `cancel` for the exact task/session. Map terminal events to the runner outcome and unsubscribe in `finally`. Never call an upstream protocol, execute a structured action locally or fall back to a model pipeline.

`RegistryModelChatAdapter` is the only Task 7 owner of the model execution join. For every call it reconstructs `ProviderExecutionTargetV1` and `ModelBindingV1` only through `executionTargetFromModelSnapshot`/`bindingFromModelSnapshot`, calls `ModelProviderRegistry.resolveTransport(target)`, verifies `transport.id === target.transportAdapterId`, and then calls that exact `ProviderTransportAdapter.sendChat({target,binding,messages,signal,timeoutMs:30_000})`. It never calls `resolveExecutionTarget` at run time: that normalization already happened before the session was persisted. The Task 4A transport alone resolves `target.secretRef` at its request boundary and applies exactly `target.protocol/auth/chatPath/baseURL`; mismatch, missing credential, timeout, abort and protocol parsing fail closed with sanitized errors.

`SnapshotAgentRuntimeAdapter` creates a session-bound donor `RuntimePipelineFactory`: direct uses one registry-backed direct provider; cloud split uses a registry-backed vision provider plus a registry-backed planner provider; local split uses the existing guarded local perception provider plus the registry-backed planner provider. These providers translate the donor prompt into `ProviderChatMessageV1`, call `RegistryModelChatPort.send` with the exact role snapshot, and parse only `ProviderChatResultV1.text` through the existing action/observation validators. Direct/cloud-vision may include the current consented image; cloud/local planner receives only the existing sanitized structured payload. The adapter reconstructs and recursively freezes the donor `RuntimeTaskSnapshot`, invokes the existing `AgentRuntime.decideStep(runtimeSnapshot,input)`, and never reads RuntimeConfig, `ModelEndpointProfileRepository`, catalog state or a feature model service. Thus OpenAI-compatible, Anthropic, Gemini and custom execution share one runner while retaining protocol-specific transports and immutable auth/path semantics.

`OperateTaskRunnerFactory` owns construction of `RegistryModelChatAdapter` and `SnapshotAgentRuntimeAdapter` from the already-integrated Task 4A registry plus local-perception dependencies; it injects only `SnapshotAgentRuntimePort` into the runner. No Task 7 file edits or wraps the Task 4A transport implementations.

`finish` returns success without executing an action. `ask_user` uses the confirmation port. Any local perception error terminates; it never changes the session or constructs a different pipeline.

- [ ] **Step 3: Make `TaskExecutionEngine` a compatibility facade**

Its constructor receives an `OperateTaskRunner` and session lease/provider. `execute` delegates once and maps the outcome for legacy callers. Remove imports of screenshot/model/action modules, service/WakeLock lifecycle, `while`, and direct `modelInferenceModule.infer` calls.

- [ ] **Step 4: Verify runner and unique-owner GREEN**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache \
  src/__tests__/core/engine/operateRuntime/runner \
  src/__tests__/engine/TaskExecutionEngine.test.ts \
  src/__tests__/core/engine/agentRuntime
npx tsc --noEmit
rg -n 'while\s*\(|modelInferenceModule\.infer\(|\.decideStep\(' \
  src/core/engine src/features/task \
  --glob '!**/__tests__/**' || {
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
}
```

Expected: all tests pass. Source scan shows the task loop only in `OperateTaskRunner.ts`; the runner calls `SnapshotAgentRuntimePort.decideStep`, and the sole donor `AgentRuntime.decideStep` invocation is in `SnapshotAgentRuntimeAdapter.ts`. There is no direct `modelInferenceModule.infer` in Task Screen/Hook/Headless/engine compatibility code, and adapter tests prove Anthropic/Gemini/custom snapshots reach their exact Task 4A transport.

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/core/engine/operateRuntime \
  AwesomeProject/src/core/engine/taskEngine/task/TaskExecutionContracts.ts \
  AwesomeProject/src/core/engine/taskEngine/task/TaskExecutionEngine.ts \
  AwesomeProject/src/core/engine/taskEngine/index.ts \
  AwesomeProject/src/__tests__/core/engine/operateRuntime/runner \
  AwesomeProject/src/__tests__/engine/TaskExecutionEngine.test.ts
git commit -m "refactor: converge device operation on one runner"
```

---

### Task 8: Route Foreground Through OperateRuntime

**Files:**

- Create: `AwesomeProject/src/features/task/services/ForegroundTaskExecutionAdapter.ts`
- Modify: `AwesomeProject/src/features/task/hooks/useTaskExecution.ts`
- Test: `AwesomeProject/src/__tests__/services/ForegroundTaskExecutionAdapter.test.ts`
- Test: `AwesomeProject/src/__tests__/hooks/useTaskExecution.test.ts`

**Interfaces:**

- Consumes: `OperateRuntime.createSession({taskId})`, `OperateSessionLease`, shared runner, foreground confirmation/UI callbacks.
- Produces: existing `useTaskExecution` public callback surface and exact `taskId` cancellation, without model/provider/screenshot/action loop ownership.

- [ ] **Step 1: Port phase1 foreground tests as lifecycle RED and add session invariants**

Restore only the donor tests, then update dependencies to `OperateRuntime` and runner. Assert create-session happens before accessibility/screenshot work, blocked config calls no runner, config changes during execution do not replace the lease, callbacks are isolated, cancellation targets the active task ID, and cleanup happens once.

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
git restore --source ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b -- \
  AwesomeProject/src/__tests__/services/ForegroundTaskExecutionAdapter.test.ts \
  AwesomeProject/src/__tests__/hooks/useTaskExecution.test.ts
cd AwesomeProject
npm test -- --runInBand --no-cache \
  src/__tests__/services/ForegroundTaskExecutionAdapter.test.ts \
  src/__tests__/hooks/useTaskExecution.test.ts
```

Expected: FAIL until the new foreground adapter API replaces donor engine/model dependencies.

- [ ] **Step 2: Implement the foreground adapter over the shared runtime**

The adapter creates/persists the initial task, asks `OperateRuntime` for a session, claims it as `foreground`, attaches one AbortController, invokes the shared runner, translates events to callbacks, and releases in `finally`. It owns Alert confirmation but no provider, screenshot loop, history schema or native background service.

- [ ] **Step 3: Reduce `useTaskExecution` to a thin state adapter**

Keep its existing options/callback names. Remove imports and calls for `modelInferenceModule`, screenshot capture, action switch, conversation history, selected `AIModel`, service/WakeLock and per-step loop. Its `executeTask(instruction)` creates a task ID and delegates once; `cancelTask()` targets that task.

- [ ] **Step 4: Preserve the current Home call site until the Headless adapter is ready**

Keep the Hook options source-compatible for this checkpoint by accepting the existing `model?: unknown` property as deprecated and ignoring it; do not import `AIModel`. Do not modify `HomeScreen.tsx` in this task; Task 9 removes the model argument only after both foreground and background adapters share the new Runtime contract.

- [ ] **Step 5: Verify foreground GREEN and Hook ownership**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache \
  src/__tests__/services/ForegroundTaskExecutionAdapter.test.ts \
  src/__tests__/hooks/useTaskExecution.test.ts
npx tsc --noEmit
if rg -n 'modelInferenceModule|captureScreen|while\s*\(|apiKey|TaskCancelRequested.*current' \
  src/features/task/hooks/useTaskExecution.ts \
  src/features/task/services/ForegroundTaskExecutionAdapter.ts; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: tests and TypeScript pass; source scan has no match. Home still compiles through the deprecated ignored option and is rewired exactly once in Task 9.

- [ ] **Step 6: Commit**

```bash
git add AwesomeProject/src/features/task/services/ForegroundTaskExecutionAdapter.ts \
  AwesomeProject/src/features/task/hooks/useTaskExecution.ts \
  AwesomeProject/src/__tests__/services/ForegroundTaskExecutionAdapter.test.ts \
  AwesomeProject/src/__tests__/hooks/useTaskExecution.test.ts
git commit -m "refactor: route foreground operation through shared runtime"
```

---

### Task 9: Route Background And Headless Through The Same Session And Runner

**Files:**

- Create: `AwesomeProject/src/features/task/services/HeadlessTaskSessionCoordinator.ts`
- Create: `AwesomeProject/src/features/task/services/HeadlessTaskExecutionAdapter.ts`
- Replace: `AwesomeProject/src/features/task/services/TaskExecutionHeadless.ts`
- Modify: `AwesomeProject/src/features/task/useTaskExecutionWithBackground.ts`
- Modify: `AwesomeProject/src/features/task/screens/HomeScreen.tsx`
- Verify: `AwesomeProject/index.js`
- Modify: `AwesomeProject/android/app/src/main/java/com/awesomeproject/service/TaskExecutionHeadlessService.kt`
- Modify: `AwesomeProject/android/app/src/main/java/com/awesomeproject/utils/ServiceManager.kt`
- Test: Headless tests in the exact file graph.

**Interfaces:**

- Consumes: persisted task instruction, immutable session, shared runner, native `TaskExecution` ABI.
- Produces:

```ts
export interface HeadlessTaskExecutionData {
  readonly taskId: string;
  readonly sessionRevision: number;
}

export function parseTaskExecutionData(
  taskDataString: string,
): HeadlessTaskExecutionData | null;
```

Parser requires exactly those two own keys, nonblank `taskId`, and a positive safe integer revision.

- [ ] **Step 1: Restore donor lifecycle tests and add minimal-payload RED**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
git restore --source ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b -- \
  AwesomeProject/src/__tests__/services/HeadlessTaskExecutionAdapter.test.ts \
  AwesomeProject/src/__tests__/services/HeadlessTaskSessionCoordinator.test.ts
```

Adapt them to session/runner dependencies and add:

```ts
expect(JSON.parse(serializedTaskData)).toEqual({
  taskId: 'task-1',
  sessionRevision: 7,
});
expect(serializedTaskData).not.toMatch(
  /instruction|model|apiKey|baseUrl|secretRef|screenshot|response/i,
);
```

Add parser cases for extra keys, stale revision, malformed JSON, blank task ID and replay. Run the three Headless suites; expected RED because V1 payload currently contains instruction and a full `AIModel` including `apiKey`.

- [ ] **Step 2: Port the coordinator state machine, then bind it to durable sessions**

Use phase1 reserve/claim/cancel/generation/waiter/tombstone behavior. The coordinator must claim `taskId + sessionRevision`, call `OperateSessionStore.claim`, reject other active tasks and released replays, and release both memory and durable leases in `finally`.

- [ ] **Step 3: Implement Headless adapter over the shared runner**

The adapter accepts only minimal data, loads the exact persisted session, claims as `headless`, attaches task-scoped cancel listeners, starts native service/WakeLock ownership once, invokes the same runner as foreground, presents terminal notification, and performs idempotent cleanup. It never constructs `AIModel`, calls `modelInferenceModule`, reads current RuntimeConfig or starts a second engine.

- [ ] **Step 4: Change background start order and remove fallback**

`startBackgroundTask(instruction)` must:

```text
create taskId
save initial Task including instruction
create immutable session
reserve exact session
serialize {taskId, sessionRevision}
start native background task
wait for exact claim acknowledgement
```

If any step fails, release only that reservation and return a stable failure. It must not call foreground execution automatically.

- [ ] **Step 5: Remove native raw-payload logging**

Delete `Log.d(TAG, "任务数据: $taskData")` from `TaskExecutionHeadlessService.kt`. Native logs may include a hashed/truncated task ID category only after parsing; they must not print the JSON. `ServiceManager` must not print its `taskData` argument.

- [ ] **Step 6: Rewire Home after both adapters expose the same contract**

Remove the selected operate `model` state and `modelService.getSelectedModel()` call. Keep `modelService.getSelectedModel('companion')` only until the later Companion plan. `handleStartTask` checks capability ViewState, then invokes the configured foreground/background path without a model object. Remove background-failure → foreground fallback. Replace `TaskCancelRequested {taskId:'current'}` and global native cleanup with exact active-task cancellation exposed by the adapters. Preserve all companion/demo/avatar rendering.

- [ ] **Step 7: Verify Headless GREEN**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache \
  src/__tests__/services/HeadlessTaskExecutionAdapter.test.ts \
  src/__tests__/services/HeadlessTaskSessionCoordinator.test.ts \
  src/__tests__/features/task/TaskExecutionHeadlessSession.test.ts \
  src/__tests__/core/engine/operateRuntime/runner \
  src/__tests__/features/task/HomeScreenCompanionAlert.test.ts
npx tsc --noEmit
rg -n 'instruction|apiKey|baseUrl|secretRef|modelInferenceModule|while\s*\(' \
  src/features/task/services/TaskExecutionHeadless.ts \
  src/features/task/services/HeadlessTaskExecutionAdapter.ts \
  src/features/task/useTaskExecutionWithBackground.ts || {
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
}
cd android
./gradlew :app:testDebugUnitTest :app:compileDebugKotlin
```

Expected: tests, TypeScript and Android compile pass. The production source scan may match `instruction` only in the foreground method parameter before it is persisted; no serialized payload or Headless adapter type may contain it. Existing companion/avatar behavior remains green, and Home has no selected operate model or automatic fallback.

- [ ] **Step 8: Commit**

```bash
git add AwesomeProject/src/features/task/services/HeadlessTaskSessionCoordinator.ts \
  AwesomeProject/src/features/task/services/HeadlessTaskExecutionAdapter.ts \
  AwesomeProject/src/features/task/services/TaskExecutionHeadless.ts \
  AwesomeProject/src/features/task/useTaskExecutionWithBackground.ts \
  AwesomeProject/src/features/task/screens/HomeScreen.tsx \
  AwesomeProject/src/__tests__/services/HeadlessTaskExecutionAdapter.test.ts \
  AwesomeProject/src/__tests__/services/HeadlessTaskSessionCoordinator.test.ts \
  AwesomeProject/src/__tests__/features/task/TaskExecutionHeadlessSession.test.ts \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/service/TaskExecutionHeadlessService.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/utils/ServiceManager.kt
git commit -m "refactor: run Headless tasks from immutable sessions"
```

---

### Task 10: Sanitize Every Log Sink

**Files:**

- Create: `AwesomeProject/src/core/engine/privacy/sanitizeLog.ts`
- Create: `AwesomeProject/src/__tests__/core/engine/privacy/sanitizeLog.test.ts`
- Replace: `AwesomeProject/src/features/debug/services/logRedaction.ts` with compatibility re-exports.
- Modify: `AwesomeProject/src/features/debug/services/DebugLogService.ts`
- Adapt: `AwesomeProject/src/__tests__/services/logRedaction.test.ts`
- Adapt: `AwesomeProject/src/__tests__/services/DebugLogService.test.ts`
- Adapt: `AwesomeProject/src/__tests__/services/privacyBoundaries.test.ts`

**Interfaces:**

- Consumes: arbitrary console arguments, Error objects and legacy persisted logs.
- Produces:

```ts
export interface SanitizedLogEntry {
  readonly message: string;
  readonly data?: unknown;
}

export function sanitizeLog(
  message: unknown,
  data?: unknown,
): SanitizedLogEntry;

export function sanitizeLogValue(value: unknown): unknown;

export function sanitizeLogText(value: string): string;
```

Limits: maximum recursion depth 6, maximum array/object entries 50, maximum individual string 512 characters, maximum final serialized entry 16 KiB. Sensitive content becomes fixed markers (`[REDACTED]`, `[CONTENT_REDACTED]`, `[Circular]`, `[Truncated]`).

- [ ] **Step 1: Restore donor tests as a floor and add stronger RED cases**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
git restore --source ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b -- \
  AwesomeProject/src/__tests__/services/logRedaction.test.ts \
  AwesomeProject/src/__tests__/services/DebugLogService.test.ts \
  AwesomeProject/src/__tests__/services/privacyBoundaries.test.ts
```

Add cases for nested `screenshot`, `image`, `instruction`, `prompt`, `response`, `conversationHistory`, `Authorization`, tokens, `data:image`, raw `Error.stack`, cyclic values, deep/large structures and 16 KiB cap. Assert the original object is not mutated.

Run:

```bash
cd AwesomeProject
npm test -- --runInBand --no-cache \
  src/__tests__/core/engine/privacy/sanitizeLog.test.ts \
  src/__tests__/services/logRedaction.test.ts \
  src/__tests__/services/DebugLogService.test.ts \
  src/__tests__/services/privacyBoundaries.test.ts
```

Expected RED: phase1 regex-only sanitizer does not remove screenshots/full instructions/responses/Error stacks or enforce bounds.

- [ ] **Step 2: Implement one recursive sanitizer**

Sensitive key matching includes credential keys plus `/screenshot|image|instruction|prompt|response|history|stack/i`. Strings redact Authorization/secret assignments and any `data:image/...;base64,` payload. Error objects become `{name, message: sanitizedMessage}` with no stack or cause. Walk values into new objects, enforce limits during traversal, then cap the serialized entry.

- [ ] **Step 3: Sanitize before every DebugLogService sink**

`interceptConsole` calls `sanitizeLogValue` before invoking original platform console. `addLog` calls `sanitizeLog` before adding to memory. `saveLogs` serializes only already sanitized entries and uses a rejection-safe write queue so concurrent additions cannot overwrite newer logs. `loadLogs` sanitizes/migrates legacy data before assigning `this.logs` and before rewriting AsyncStorage.

- [ ] **Step 4: Make the old module a compatibility re-export**

```ts
export {
  sanitizeLogValue as redactSensitiveData,
  sanitizeLogText as redactSensitiveText,
} from '@core/engine/privacy/sanitizeLog';
```

No independent sanitizer implementation remains under `features/debug`.

- [ ] **Step 5: Verify privacy GREEN and scan production sinks**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache \
  src/__tests__/core/engine/privacy/sanitizeLog.test.ts \
  src/__tests__/services/logRedaction.test.ts \
  src/__tests__/services/DebugLogService.test.ts \
  src/__tests__/services/privacyBoundaries.test.ts
npx tsc --noEmit
if rg -n 'console\.(log|info|warn|error|debug).*\b(error|instruction|response|screenshot|apiKey|taskData)\b' \
  src --glob '!**/__tests__/**'; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: tests and TypeScript pass. Every source-scan match is changed to a stable category or routed through the installed sanitized console; no raw error object or content variable is passed directly.

- [ ] **Step 6: Commit**

```bash
git add AwesomeProject/src/core/engine/privacy \
  AwesomeProject/src/features/debug/services/logRedaction.ts \
  AwesomeProject/src/features/debug/services/DebugLogService.ts \
  AwesomeProject/src/__tests__/core/engine/privacy \
  AwesomeProject/src/__tests__/services/logRedaction.test.ts \
  AwesomeProject/src/__tests__/services/DebugLogService.test.ts \
  AwesomeProject/src/__tests__/services/privacyBoundaries.test.ts
git commit -m "fix: sanitize runtime logs before every sink"
```

---

### Task 11: Run The Foundation Integration Gate

**Files:**

- Create: `AwesomeProject/src/__tests__/integration/V1RuntimeFoundation.test.ts`
- Create: `docs/superpowers/reports/2026-08-20-v1-runtime-foundation-verification.md`
- Modify only if a new failing test proves a defect: files owned by Tasks 1–10.

**Interfaces:**

- Consumes: the frozen V1 UI, safe RuntimeConfig, CredentialStore, immutable session, one runner, both entry adapters, TaskRepository and `sanitizeLog`.
- Produces: `FOUNDATION_SHA` and an evidence report with automated PASS/FAIL plus truthful physical-device gaps.

- [ ] **Step 1: Write cross-layer integration RED tests**

Use injected in-memory ports and cover this exact matrix:

| Scenario | Required assertion |
| --- | --- |
| cloud direct | unified binding snapshot is used and one runner owns all steps |
| provider protocol dispatch | OpenAI-compatible, Anthropic, Gemini and custom snapshots each resolve and call only their recorded transport with immutable auth/chat path; a transport-ID mismatch performs zero I/O |
| cloud split | planner request contains sanitized observation and no image/data URI |
| local vision | local failure terminates; cloud vision/direct calls are zero |
| config edit during task | existing session remains byte-equal; new task gets new revision |
| visual-agent profile enabled/disconnected | session resolution returns `visual_agent_disconnected`; model providers/runner are not called |
| visual-agent capability negotiation | false `imageInput` or `structuredAction` blocks activation/session; no execute or model fallback |
| foreground → background | one session/runner/terminal record; no second owner |
| Headless replay | stale or terminal `{taskId,sessionRevision}` is rejected |
| cancel | only exact target task aborts and terminal persists once |
| concurrent history | no lost task, no index divergence, terminal irreversible |
| credential/privacy | no plaintext in config/session/task/event/log/headless fixtures |

Run the new test before wiring its harness; expected RED from missing composition or an invariant violation, not a skipped test.

- [ ] **Step 2: Run the full JavaScript gate**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache
npx tsc --noEmit
npm run lint
npx prettier --check \
  src/core/engine/agentRuntime \
  src/core/engine/operateRuntime/visualAgent \
  src/core/engine/operateRuntime \
  src/core/engine/privacy \
  src/features/task \
  src/features/debug/services
```

Expected: all Jest suites pass, TypeScript exits 0, lint exits 0, and Prettier reports every listed path formatted. Existing unrelated lint debt must be normalized against Task 0; do not claim it was introduced or hide it.

- [ ] **Step 3: Run the native gates**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject/android
./gradlew :app:testDebugUnitTest :app:compileDebugKotlin :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

On macOS/Xcode:

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
xcodebuild -project ios/AwesomeProject.xcodeproj -scheme AwesomeProject \
  -configuration Debug -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 15' build
```

Expected: build succeeds. Missing Xcode/simulator is `NOT RUN` with exact command error and a named manual follow-up; it is not PASS.

- [ ] **Step 4: Run architecture and privacy scans**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
rg -n 'while\s*\(|modelInferenceModule\.infer\(|\.decideStep\(' \
  src/core/engine src/features/task --glob '!**/__tests__/**' || {
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
}
rg -n 'apiKey|Authorization|Bearer|data:image|screenshotUri|modelResponse|conversationHistory|taskData' \
  src/core/engine/operateRuntime src/features/task/services src/features/debug/services \
  --glob '!**/__tests__/**' || {
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
}
if rg -n "TaskCancelRequested.*current|taskId:\\s*['\\\"]current['\\\"]" src --glob '!**/__tests__/**'; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected:

- The first scan identifies the operation loop in `OperateTaskRunner.ts`, its call to `SnapshotAgentRuntimePort.decideStep`, and the one donor `AgentRuntime.decideStep` invocation in `SnapshotAgentRuntimeAdapter.ts`; other matches must be unrelated bounded parsing loops and manually classified in the report.
- The second scan has no persisted DTO or log sink containing forbidden data; transient sanitizer/provider type/property names are manually classified.
- The third scan has no match.

- [ ] **Step 5: Perform Android user-path checks**

On one Android 8+ ARM64 device/emulator with accessibility enabled, record:

```text
cloud direct start → background → foreground → cancel
cloud split planner payload inspection through mock transport
local model unavailable → visible blocked/failure and no network call
visual-agent profile disconnected/capability-ineligible → generic visible blocker and no model fallback
activate a changed profile/binding while a task runs → current task unchanged
kill/restart before Headless claim → exact session recovery or explicit rejection
debug log export → no instruction, screenshot, provider response or credential
```

Each row is `PASS`, `FAIL`, or `NOT RUN` with reason. A missing device cannot be converted to release PASS.

- [ ] **Step 6: Write the verification report**

The report contains: the literal full SHA from `codex/checkpoint-v1-runtime-baseline`, every Task commit SHA, final dirty status, command/output summaries, suite/test counts, native results, scan classifications, manual matrix, known gaps and rollback order. It must state that real Companion/ASR, live OpenClaw, Errand scheduler and Avatar packs remain outside this foundation, and that the untouched legacy model UI/service writer is a release blocker until the later UI integration plan moves it to the profile repository.

- [ ] **Step 7: Commit the integration tests and evidence**

```bash
git add AwesomeProject/src/__tests__/integration/V1RuntimeFoundation.test.ts \
  docs/superpowers/reports/2026-08-20-v1-runtime-foundation-verification.md
git commit -m "test: verify V1 runtime foundation"
git rev-parse HEAD
git status --short
```

Expected: status has no output. Record the final SHA as `FOUNDATION_SHA`; do not merge, push, release or deploy without separate authorization.

## Completion Gate

- V1 UI/3D/ability pages remain present and their pre-existing tests pass.
- The phase1-derived AgentRuntime suite passes at least the verified `14 suites / 147 tests` after V1 integration.
- The runner/entry adapter behavior retains at least the verified `5 suites / 88 tests`, with new session/payload assertions added rather than old assertions removed.
- The provider registry contains all eleven declared presets; `RegistryModelChatAdapter` dispatches each immutable OpenAI-compatible/Anthropic/Gemini/custom snapshot through `resolveTransport(...).sendChat(...)`, rejects a transport-ID mismatch before I/O, and never represents a custom endpoint with a profile mode other than `preset | custom`.
- Model IDs exist only in `ModelBindingV1`; endpoint `secretRef` is nullable only for an explicitly no-auth custom profile, while every required-auth preset/custom profile fails validation before I/O.
- Model/Visual credential replace/remove commits a durable retirement record and never deletes an old ref inline; cold-start GC preserves refs held by active/draft config or nonterminal sessions, verifies deletion after terminal recovery, and retains a retry record on failure.
- Catalog results distinguish `ready`, `unsupported`, `auth_failed`, `network_failed` and `empty`; remote endpoints traverse all pages, missing endpoints use verified signed static data plus manual IDs, and cache/cancel/timeout/generation tests pass.
- RuntimeConfig migration covers all five model lists and every routing-affecting legacy key; active revision changes atomically and corrupt data fails closed. The legacy `@nono:openclaw` record is staged behind `LegacyOpenClawBindingPort` and becomes a Connector-Bridge profile with `toolId: 'openclaw'`, never an OpenClaw-shaped runtime record.
- RuntimeConfig contains separate `modelAPI` profiles/bindings and `visualAgent` profiles; model/visual profile repositories, session, Task, events, Headless payload and logs contain no plaintext credential, and no planned compound stored-model structure exists.
- A `visual_agent` session snapshots exactly profile ID, tool ID, connector and negotiated `VisualAgentCapabilitySet`; activation and negotiation both require `imageInput && structuredAction`, and model bindings are not resolved for that channel.
- One task has one immutable session and one exact owner; foreground/background transitions do not start a second runner.
- Headless payload is exactly `{taskId, sessionRevision}` and the runner obtains instruction only through `TaskInstructionPort.load(taskId)`.
- Task history mutations serialize, failed writes do not poison the queue, model queries derive from the primary list, and terminal state is irreversible.
- `sanitizeLog` runs before platform console, memory and persistence sinks and enforces sensitive-field/content/size bounds.
- Full Jest, TypeScript, lint/touched-format, Android unit/compile/assemble and available iOS build gates are recorded truthfully.

## Explicitly Out Of Scope

- Replacing the homepage `DEMO_TURNS` with production ASR/Companion inference.
- Preference/Errand repository split, scheduling, lease/due sweep and background alarms.
- Live OpenClaw authentication, WebSocket/HTTP session, heartbeat, remote action protocol or reconnect.
- Wiring `ApiProviderSelector`, `ModelNameSelector`, `ModelListService`, `ModelService`, Add/Edit model screens, Companion settings, `NonoConfigService` or `PhoneOperateScreen` to the new registries/repositories; that belongs to the later UI integration plan.
- Downloading or shipping the MiniCPM model artifact and claiming JNI inference availability; this plan preserves safe eligibility/download boundaries and fail-closed unavailable behavior.
- Offline ASR and downloadable Avatar/GLB packs.
- PR creation, merge, push, release, deployment or modifying the user's existing dirty worktree.

## Plan Self-Review

- **Spec coverage:** Tasks 0–11 plus independently revertible Tasks 4A/4B cover baseline, exact phase1 source/provenance, AgentRuntime, CredentialStore, local eligibility, provider registry/transports/catalog, profile/binding repository, visual-agent registry/config, RuntimeConfig migration, immutable session, unique runner, foreground/Headless, history serialization and log sanitization.
- **Placeholder scan:** `if rg -n 'T[B]D|T[O]DO|i[m]plement later|f[i]ll in details|s[i]milar to Task' docs/superpowers/plans/2026-08-20-v1-runtime-foundation.md; then exit 1; else scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"; fi` must exit 0 with no output.
- **Legacy-shape scan:** `if rg -n 'VisualAgentEndpointV[1]|VisualAgentExecutionResul[t]|adapterI[d]:|readonly (endpoint|capabilities): Readonly<VisualAgent|openclaw_no[t]_|modelI[D]' docs/superpowers/plans/2026-08-20-v1-runtime-foundation.md; then exit 1; else scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"; fi` must exit 0 with no output; `gatewayUrl|deviceId|cluster|memoryLocation: 'openclaw'` may appear only in the explicitly named legacy migration port/test prose, never the canonical profile/config/session/runner contracts.
- **Type consistency:** `RuntimeConfigEnvelopeV1.revision` becomes `ResolvedOperateSessionV1.configRevision`; the per-task `sessionRevision` is present in session, Task, events and Headless payload; `ModelEndpointProfileV1.mode` is only `preset | custom`, its ref is nullable, and model ID appears only in `ModelBindingV1`; every model session freezes normalized auth/chat-path/region/channel plus model/modality/capability data and reconstructs transport DTOs without a live config read; model/visual code shares the exact Frozen `VisualAgentToolId`, profile, capability, protocol/upstream, registry, adapter and execution signatures without aliases; the session visual snapshot is only profile/tool/connector/negotiated capabilities.
- **Ownership consistency:** in standalone execution Tasks 4A/4B create the two pure contract files and validator tests; under the master plan Wave 0 owns them and workers prove zero diff before staging implementation files. `AccessibilityPackage.kt` belongs only to Task 3, model registry/catalog/transports only to Task 4A, RuntimeConfig/migration/visual registry only to Task 4B, runner/engine only to Task 7, foreground adapter/Hook only to Task 8, and Home/Headless files only to Task 9. Existing storage, model/capability selectors, services and screens have no writer in this plan.
- **Migration safety:** all destructive legacy scrubs occur only after model credential readback, Connector Bridge binding stage, versioned envelope re-read validation and binding commit; pre-commit failure rolls back the binding and preserves legacy records.
- **Execution safety:** phase1 commits are copied only into declared pure-new paths or used as behavioral donors; no command merges the donor branch or restores donor UI/shared hotspots wholesale.
