# NoNo Runtime 通道与任务会话重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to execute this plan by dependency wave. Each worker uses an isolated worktree and returns one reviewed commit SHA. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 NoNo 的陪伴、手机操作、交代和 OpenClaw 收敛到可恢复、不可中途换道、无明文凭证的统一 runtime，同时最大化安全并行开发。

**Architecture:** 先冻结纯契约，再并行建设 provider、凭证迁移和安全映射；随后并行建设 session runtime、Companion/Errand 和 OpenClaw；最后由唯一 runner 收敛执行循环，并将前台、Headless、交代入口分域并行接入。所有共享热点只在指定 wave 由一个 owner 修改。

**Tech Stack:** React Native 0.73、TypeScript、Jest、AsyncStorage、Android Kotlin/Keystore、iOS Objective-C/Keychain。除原生安全存储实现外不新增 npm 依赖；MiniCPM JNI/下载沿用独立计划。

**Spec:** `docs/superpowers/specs/2026-08-19-nono-runtime-channel-refactor-design.md`

## Global Constraints

- Companion 永不截图、永不执行设备动作。
- 一个 taskId 只绑定一个 `ResolvedOperateSessionV1`；配置变化不能改变进行中任务。
- OpenClaw 开启时优先，未连接显式 blocked，禁止回退。
- 本地视觉失败不得调用云端视觉或 unified direct。
- Headless taskData 只允许 `{taskId, sessionRevision}`。
- API Key 只存在于 Android Keystore/iOS Keychain 支持的 `CredentialStore` 边界。
- 操作输出先经 schema 校验、隐私投影和坐标映射，再进入旧 action executor。
- Preference 与 Errand 分仓储、分 schema、分生命周期。
- 每项行为必须经历真实 RED → GREEN；不允许通过删除断言、放宽隐私规则或增加任意 sleep 获绿。
- 当前工作树有用户未提交修改。开始实现前必须从用户批准的 clean checkpoint SHA 建立集成 worktree，禁止在当前 dirty tree 中让多个代理直接写文件。

## Multi-Agent Execution Protocol

### Worktree and commit protocol

1. 主协调代理记录 `INTEGRATION_BASE_SHA`，创建 `codex/nono-runtime-integration` worktree。
2. 每个工作包从该 wave 的 checkpoint SHA 创建独立分支：`codex/nono-runtime-wpNN-<name>`。
3. 子代理只能修改本工作包列出的文件；发现共享热点需求时先报告，不越界修改。
4. 子代理交付：RED 证据、GREEN 命令、完整测试结果、diff/ownership 检查、单一 commit SHA、已知 gap。
5. 主协调代理按矩阵顺序 cherry-pick；每个 wave 完成后跑集成门禁并产生下一个 checkpoint SHA。
6. 同一 wave 的代理不得修改同一生产文件。共享热点只在串行 integration window 开放。

### Dependency waves

| Wave | 可并行工作包 | 最大 worker | 前置 | 集成输出 |
|---|---|---:|---|---|
| 0 | WP0 契约冻结 | 1 | clean base | `CORE_CONTRACT_SHA` |
| 1 | WP1 Provider、WP2 Credential、WP3 Safety | 3 | WP0 | `FOUNDATION_SHA` |
| 2 | WP4 Session、WP5 Companion/Errand、WP6 OpenClaw | 3 | Wave 1 | `CHANNELS_SHA` |
| 3 | WP7 唯一 Runner | 1 | Wave 2 | `RUNNER_SHA` |
| 4 | WP8 Foreground、WP9 Headless、WP10 Errand Sweep | 3 | WP7 | `ENTRYPOINTS_SHA` |
| 5 | WP11 迁移/全量集成/真机 | 1 + read-only reviewers | Wave 4 | release candidate |

### Shared-hotspot ownership

| 文件 | 唯一 owner |
|---|---|
| `Model.ts`, `ModelService.ts`, `storage.ts`, native registration | WP2 |
| `NonoConfigService.ts`, session storage keys | WP4 |
| `TaskExecutionEngine.ts`, new `OperateTaskRunner.ts` | WP7 |
| `HomeScreen.tsx`, `useTaskExecution.ts`, `TaskHistoryScreen.tsx` | WP8 |
| `TaskExecutionHeadless.ts`, `useTaskExecutionWithBackground.ts`, `index.js` | WP9 |
| `App.tsx` / foreground errand sweep composition | WP10 |

---

### WP0: Freeze contracts and test fixtures

**Mode:** serial

**Files:**
- Create: `AwesomeProject/src/core/engine/agentRuntime/contracts/AgentContracts.ts`
- Create: `AwesomeProject/src/core/engine/agentRuntime/domain.ts`
- Create: `AwesomeProject/src/core/engine/agentRuntime/contracts/RuntimePorts.ts`
- Create: `AwesomeProject/src/__tests__/core/engine/agentRuntime/contracts/AgentContracts.test.ts`

**Produces:** stable types used by every parallel worker.

```ts
export interface RuntimeModelBinding {
  list: ModelListKey;
  modelId: string;
  providerId: string;
  baseUrl: string;
  modelName: string;
  maxSteps: number;
  capabilities: ModelCapabilities;
  secretRef: string;
}

export interface ResolvedOperateSessionV1 {
  schemaVersion: 1;
  taskId: string;
  sessionRevision: number;
  configRevision: number;
  channel: 'cloud_direct' | 'cloud_split' | 'local_vision_cloud_planner' | 'openclaw';
  bindings: {direct?: RuntimeModelBinding; vision?: RuntimeModelBinding; planner?: RuntimeModelBinding};
  localVision: boolean;
  openClawRef?: {gateway: string; deviceId: string; cluster: string};
  createdAtMs: number;
}
```

- [ ] Add runtime validators for `Observation`, `PlannerObservation`, `ActionDecision`, `RuntimeModelBinding` and `ResolvedOperateSessionV1`; reject unknown keys, non-finite numbers and unsupported schema versions.
- [ ] Define discriminated action variants with mandatory `targetId`, `text`, coordinates or `appName` where required.
- [ ] Define ports: `CredentialResolver`, `RuntimeConfigReader`, `OperateSessionPort`, `TaskPipeline`, `TaskActionPort`, `TaskEventPort`, `TaskInstructionPort.load(taskId)`, `ScreenshotPort.capture(): {screenshotUri, coordinateSpace}`, `ConfirmationPort.confirm(...)`, and `TaskLifecyclePort`. Runner code must depend on these ports instead of React/native singletons.
- [ ] Run `npx jest src/__tests__/core/engine/agentRuntime/contracts/AgentContracts.test.ts --runInBand`; first capture missing-module RED, then PASS.
- [ ] Run `npx tsc --noEmit` and focused ESLint/Prettier.
- [ ] Commit `feat: freeze NoNo runtime contracts`; report `CORE_CONTRACT_SHA`.

### WP1: OpenAI-compatible providers and pipelines

**Mode:** parallel Wave 1, new-file domain

**Files:**
- Create: `AwesomeProject/src/core/engine/agentRuntime/pipelines/DirectAgentPipeline.ts`
- Create: `AwesomeProject/src/core/engine/agentRuntime/pipelines/SplitAgentPipeline.ts`
- Create: `AwesomeProject/src/core/engine/agentRuntime/providers/OpenAICompatibleTransport.ts`
- Create: `AwesomeProject/src/core/engine/agentRuntime/providers/OpenAICompatibleDirectProvider.ts`
- Create: `AwesomeProject/src/core/engine/agentRuntime/providers/CloudPerceptionProvider.ts`
- Create: `AwesomeProject/src/core/engine/agentRuntime/providers/OpenAICompatiblePlannerProvider.ts`
- Test: existing four `AwesomeProject/src/__tests__/core/engine/agentRuntime/pipelines/*.test.ts`

**Consumes:** WP0 contracts only. **Must not modify WP0 files.**

- [ ] Run existing four suites and capture module-not-found RED.
- [ ] Implement direct and split pipelines; split must call perception before planner and skip planner after perception failure.
- [ ] Normalize endpoints: existing `/chat/completions` remains unchanged; base ending `/v1` or `/v1/` becomes `/v1/chat/completions`; reject non-http(s) URL.
- [ ] Resolve credentials for every request; do not cache plaintext.
- [ ] Preserve AbortSignal cancellation; map other transport/HTTP/parse failures to fixed `AgentProviderError` values without URL, secretRef, body or raw response.
- [ ] Ensure planner request accepts `PlannerObservation`, instruction hash/context and bounded outcome history only; its type has no screenshot field.
- [ ] Run the four suites, TypeScript and focused lint/format.
- [ ] Commit `feat: add NoNo provider pipelines`.

### WP2: Cross-platform CredentialStore and model migration

**Mode:** parallel Wave 1, exclusive storage/native-registration domain

**Files:**
- Create: `AwesomeProject/src/core/security/CredentialStore.ts`
- Create: `AwesomeProject/android/app/src/main/java/com/awesomeproject/security/CredentialStoreModule.kt`
- Create: Android credential unit tests under `android/app/src/test/java/com/awesomeproject/security/`
- Create: `AwesomeProject/ios/AwesomeProject/NoNoCredentialStore.h`
- Create: `AwesomeProject/ios/AwesomeProject/NoNoCredentialStore.m`
- Modify: `AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityPackage.kt`
- Modify: `AwesomeProject/ios/AwesomeProject.xcodeproj/project.pbxproj`
- Modify: `AwesomeProject/src/shared/types/Model.ts`
- Modify: `AwesomeProject/src/shared/utils/storage.ts`
- Modify: `AwesomeProject/src/features/model/services/ModelService.ts`
- Modify: `AwesomeProject/src/shared/constants/storage.config.ts`
- Test: `AwesomeProject/src/__tests__/features/model/ModelCredentialMigration.test.ts`

**Produces:** `StoredModelV2` without `apiKey`, `CredentialStore`, idempotent migration.

- [ ] Write RED tests: key set/resolve/remove; no secret in thrown errors; migration success removes AsyncStorage plaintext; failure preserves original record and marks model unavailable; rerun is idempotent.
- [ ] Android: generate/get an AES-GCM key from Android Keystore, persist ciphertext/IV in private SharedPreferences, and expose Promise-based RN methods. Never log alias/value/Throwable stack.
- [ ] iOS: use Keychain Generic Password keyed by secretRef; expose Promise-based RN methods and fixed safe errors.
- [ ] Define `StoredModelV2` with `secretRef`, `credentialState: 'ready' | 'migration_required' | 'unavailable'`, and no `apiKey`. Define transient form credential intent as `{action:'keep'} | {action:'replace'; apiKey:string} | {action:'remove'}`; add requires replace, edit defaults keep, and no edit screen may receive the resolved key.
- [ ] Migrate per `{list,id}` using write → read verify → model rewrite → version record. Do not delete old secret until verification succeeds.
- [ ] Remove model name/API URL/form data console logging.
- [ ] Run JS tests, Android unit/compile, and `xcodebuild` compile when Xcode is available; otherwise record iOS build as an explicit environment gap, not PASS.
- [ ] Scan persisted-model fixtures and Headless fixtures for plaintext key markers.
- [ ] Commit `feat: move model credentials to platform secure storage`.

### WP3: Planner privacy and action safety

**Mode:** parallel Wave 1, new-file domain

**Files:**
- Create: `AwesomeProject/src/core/engine/agentRuntime/privacy/ObservationProjection.ts`
- Create: `AwesomeProject/src/core/engine/agentRuntime/session/mapDecisionToTaskAction.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/agentRuntime/privacy/ObservationProjection.test.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/agentRuntime/session/mapDecisionToTaskAction.test.ts`

**Consumes:** WP0 contracts only. **Must not modify provider or engine files.**

- [ ] Capture RED for screenshot/data URI removal, OTP/token/card masking, per-field limits and total serialized-size limit.
- [ ] Capture RED for unknown/disabled/low-confidence target, malformed bbox, invalid geometry, rotation/inset mapping, missing action parameters and out-of-viewport result.
- [ ] Implement `CoordinateSpace` with screenshot width/height/rotation and viewport width/height/insets.
- [ ] Treat bbox as screenshot-space `[x,y,width,height]`; confidence threshold is `0.70`; mapper never guesses coordinates/text/app names.
- [ ] Map `risk: high` to existing `requiresConfirmation: true`.
- [ ] Run focused suites, TypeScript and lint/format.
- [ ] Commit `feat: add private observations and safe action mapping`.

### Wave 1 integration gate

- [ ] Cherry-pick WP1, WP2 and WP3 onto `CORE_CONTRACT_SHA`.
- [ ] Resolve conflicts only in the integration worktree; do not amend child commits.
- [ ] Run existing agentRuntime suites, new credential/safety suites, TypeScript, touched lint/format and Android compile.
- [ ] Verify `AIModel` persisted form contains no `apiKey` and providers still resolve every request.
- [ ] Record `FOUNDATION_SHA`.

### WP4: Versioned configuration and durable session runtime

**Mode:** parallel Wave 2, exclusive configuration/session domain

**Files:**
- Create: `AwesomeProject/src/core/engine/agentRuntime/session/RuntimeConfigRepository.ts`
- Create: `AwesomeProject/src/core/engine/agentRuntime/session/OperateSessionResolver.ts`
- Create: `AwesomeProject/src/core/engine/agentRuntime/session/OperateSessionStore.ts`
- Create: `AwesomeProject/src/core/engine/agentRuntime/session/OperateRuntime.ts`
- Modify: `AwesomeProject/src/features/capability/services/NonoConfigService.ts`
- Modify: `AwesomeProject/src/shared/constants/storage.config.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/agentRuntime/session/RuntimeConfigRepository.test.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/agentRuntime/session/OperateRuntime.test.ts`

**Produces:** `RuntimeConfigEnvelopeV1`, immutable session creation/claim/terminal/release.

- [ ] Capture RED for migration from legacy scattered keys into one envelope, monotonically increasing revision, concurrent mutate serialization and corrupt-envelope fail-closed behavior.
- [ ] Capture RED for OpenClaw priority, each missing model branch, MiniCPM not ready, no local fallback, second active task conflict and config/model edit after session creation.
- [ ] Capture RED for restart claim, terminal tombstone replay rejection, duplicate terminal/release and bounded tombstone eviction.
- [ ] Persist complete non-secret `RuntimeModelBinding`; never re-read model endpoint/name/maxSteps during a claimed task.
- [ ] Use one AsyncStorage session envelope and a process-level serialized mutation queue; document that native lifecycle remains the cross-runtime owner.
- [ ] Ensure UI writes update `draftMode` independently while activation writes `activeMode` and revision together.
- [ ] Run focused suites and config-service compatibility tests.
- [ ] Commit `feat: persist immutable NoNo operate sessions`.

### WP5: Companion, preferences and errands domain

**Mode:** parallel Wave 2, new domain/repository files; no Screen/App edits

**Files:**
- Create: `AwesomeProject/src/core/engine/companion/CompanionIntentRouter.ts`
- Create: `AwesomeProject/src/core/engine/companion/CompanionPipeline.ts`
- Create: `AwesomeProject/src/core/engine/companion/PreferenceRepository.ts`
- Create: `AwesomeProject/src/core/engine/errand/Errand.ts`
- Create: `AwesomeProject/src/core/engine/errand/ErrandRepository.ts`
- Create: `AwesomeProject/src/core/engine/errand/ErrandScheduler.ts`
- Test: companion/errand suites under `AwesomeProject/src/__tests__/core/engine/`

**Produces:** pure intent result, text-only reply/proposal, independent preference and errand stores.

- [ ] Capture RED: ambiguous input requests confirmation and starts no operation; explicit approved prefixes route operate; ordinary text routes companion.
- [ ] Capture RED: Companion serialization has no image, screenshot, action import or disabled memory content.
- [ ] Capture RED: model proposals do not mutate storage before user confirmation; unknown proposal schema is rejected.
- [ ] Capture RED: migrate legacy `MemoryItem.kind === 'errand'` once into ErrandRepository while leaving preferences intact.
- [ ] Capture RED: concurrent due sweeps lease once; once deletes only after success; schedule advances only after success; cancellation/failed retains item and releases/expiries lease safely.
- [ ] Implement IANA timezone based next-due calculation as a pure function with injected clock.
- [ ] Commit `feat: separate NoNo companion preferences and errands`.

### WP6: OpenClaw disconnected channel contract

**Mode:** parallel Wave 2, new-file domain

**Files:**
- Create: `AwesomeProject/src/core/engine/openclaw/OpenClawOperateClient.ts`
- Create: `AwesomeProject/src/core/engine/openclaw/DisconnectedOpenClawClient.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/openclaw/OpenClawOperateClient.test.ts`

**Produces:** cancellable future-facing interface; no network implementation.

- [ ] Define `isConnected(signal)`, `startSession({taskId,instruction,signal})`, `sendObservation({sessionId,attachment,signal})`, `ackAction(...)`, `endSession(...)`.
- [ ] Use transient `ScreenshotAttachment`; it must be non-serializable and absent from persistent session types.
- [ ] Capture RED then GREEN: disconnected returns false; remaining methods reject fixed `openclaw_not_connected`; no direct/split provider calls; Companion unaffected.
- [ ] Commit `feat: define isolated OpenClaw operate channel`.

### Wave 2 integration gate

- [ ] Cherry-pick WP4, WP5 and WP6 onto `FOUNDATION_SHA`.
- [ ] Run Wave 1 + Wave 2 suites, TypeScript, lint/format and migration tests.
- [ ] Inspect persisted fixtures: config/session/model/errand contain no credential, screenshot or raw provider response.
- [ ] Record `CHANNELS_SHA`.

### WP7: Build the only operation runner

**Mode:** serial Wave 3, exclusive engine domain

**Files:**
- Create: `AwesomeProject/src/core/engine/agentRuntime/OperateTaskRunner.ts`
- Create: `AwesomeProject/src/core/engine/agentRuntime/OperateTaskRunnerFactory.ts`
- Modify: `AwesomeProject/src/core/engine/taskEngine/task/TaskExecutionEngine.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/agentRuntime/OperateTaskRunner.test.ts`
- Test: direct/split/local failure wiring suites under `AwesomeProject/src/__tests__/core/engine/taskEngine/`

**Produces:** one screenshot/inference/action loop used by all entry adapters.

- [ ] Capture RED for direct, cloud split, local split and OpenClaw-disconnected branches.
- [ ] Capture RED for abort before screenshot/provider/action; high-risk confirmation; fixed maxSteps; bounded safe history; terminal exactly once.
- [ ] Capture RED that runner loads instruction through `TaskInstructionPort.load(taskId)` and fails closed when the task record is absent; instruction is never accepted from Headless payload or global state.
- [ ] Capture RED that local perception failure yields zero direct/cloud-perception calls.
- [ ] Move loop ownership into `OperateTaskRunner`; `TaskExecutionEngine` becomes a compatibility facade over runner ports and existing history/action facilities.
- [ ] Keep service/WakeLock/task-surface lifecycle outside runner behind `TaskLifecyclePort`; runner owns no React hook, DeviceEventEmitter or native service start/stop. `TaskExecutionEngine` compatibility facade must remove its existing service/WakeLock start path.
- [ ] Run runner, engine, action and cancellation suites.
- [ ] Commit `refactor: converge NoNo operation on one runner`; report `RUNNER_SHA`.

### WP8: Foreground and Home integration

**Mode:** parallel Wave 4, exclusive foreground/UI domain

**Files:**
- Modify: `AwesomeProject/src/features/task/hooks/useTaskExecution.ts`
- Modify: `AwesomeProject/src/features/task/screens/HomeScreen.tsx`
- Modify: `AwesomeProject/src/features/task/screens/TaskHistoryScreen.tsx`
- Test: `AwesomeProject/src/__tests__/features/task/ForegroundOperateSession.test.tsx`
- Test: `AwesomeProject/src/__tests__/features/task/HomeIntentRouting.test.tsx`

**Produces:** UI adapters without model/provider/action loops.

- [ ] Capture RED: create session before accessibility/screenshot work; blocked produces stable copy and zero runner calls; configuration changes during task do not replace session.
- [ ] Capture RED: default/ambiguous/explicit operate routing; Companion proposals require user confirmation before repository mutation.
- [ ] Remove direct `modelInferenceModule`, screenshot/action loop and selected-operate-model dependency from foreground Hook.
- [ ] Hook calls `OperateRuntime.createSession(taskId)` then runner; Home only renders intent/proposal/blocked states.
- [ ] Preserve existing cancel and task history UI semantics with exact taskId.
- [ ] Commit `refactor: route foreground tasks through NoNo runtime`.

### WP9: Headless integration without secret taskData

**Mode:** parallel Wave 4, exclusive Headless domain

**Files:**
- Modify: `AwesomeProject/src/features/task/services/TaskExecutionHeadless.ts`
- Modify: `AwesomeProject/src/features/task/useTaskExecutionWithBackground.ts`
- Modify: `AwesomeProject/index.js`
- Test: `AwesomeProject/src/__tests__/features/task/TaskExecutionHeadlessSession.test.ts`
- Test: existing Headless lifecycle/replay/cancellation suites

**Produces:** Headless adapter that accepts only session identity and delegates to runner.

- [ ] Capture RED that serialized native payload has exactly `taskId` and `sessionRevision`, and lacks instruction/model/apiKey/baseUrl/screenshot; Headless obtains instruction only from `TaskInstructionPort` inside runner.
- [ ] Capture RED for exact claim, stale revision, terminal replay, pre-start cancel, late cancel, listener cleanup and runner terminal failure.
- [ ] Delete the duplicated background screenshot/model/action loop; claim stored session and invoke runner.
- [ ] Preserve existing native service/WakeLock/task-surface ownership and `TaskExecution` Headless ABI.
- [ ] Scan production and fixtures for taskData credential/instruction leakage.
- [ ] Commit `refactor: execute Headless tasks from durable sessions`.

### WP10: Foreground errand sweep composition

**Mode:** parallel Wave 4, exclusive App composition domain

**Files:**
- Create: `AwesomeProject/src/features/errand/ErrandForegroundSweep.tsx`
- Modify: `AwesomeProject/App.tsx`
- Test: `AwesomeProject/src/__tests__/features/errand/ErrandForegroundSweep.test.tsx`

**Produces:** one AppState foreground sweep, no AlarmManager.

- [ ] Capture RED for repeated active events, concurrent sweeps, process restart with lease, disabled errands and create-session blocked outcome.
- [ ] Mount one sweep owner at app root; listener cleanup exactly once.
- [ ] For a due item, claim lease then call `OperateRuntime.createSession(leaseTaskId)`; do not read companion/unified model directly.
- [ ] Record process-death behavior as delayed-until-next-foreground, not guaranteed background scheduling.
- [ ] Commit `feat: trigger due errands through NoNo runtime`.

### Wave 4 integration gate

- [ ] Cherry-pick WP8, WP9 and WP10 onto `RUNNER_SHA`.
- [ ] Resolve UI callback type conflicts centrally; do not restore duplicate loops.
- [ ] Run foreground, Headless, errand, runner, task surface and cancellation suites.
- [ ] Assert source scan: Hook/Headless/Home contain no provider construction, raw `apiKey`, `modelInferenceModule` or duplicated while-loop execution.
- [ ] Record `ENTRYPOINTS_SHA`.

### WP11: Migration, privacy sink and release verification

**Mode:** serial integration owner; read-only testing/review agents may run in parallel

**Files:**
- Create: `AwesomeProject/src/core/engine/privacy/sanitizeLog.ts`
- Modify: `AwesomeProject/src/features/debug/services/DebugLogService.ts`
- Create: `AwesomeProject/src/__tests__/core/engine/privacy/sanitizeLog.test.ts`
- Create: `AwesomeProject/src/__tests__/integration/RuntimeLegacyMigration.test.ts`
- Create: `AwesomeProject/src/__tests__/integration/RuntimeRecoveryAndConcurrency.test.ts`
- Create: `AwesomeProject/src/__tests__/integration/RuntimeChannelEndToEnd.test.ts`
- Create: `docs/superpowers/reports/2026-08-19-nono-runtime-channel-refactor-verification.md`

- [ ] Capture RED for tokens, Authorization objects, data URIs, screenshot fields, raw Error.stack and long instruction/provider response in persisted logs.
- [ ] Sanitize recursively before both in-memory log insertion and AsyncStorage persistence; use fixed field allowlist and size cap.
- [ ] Run migration fixtures containing: unified model with plaintext key, all four non-unified model lists, selected ids, separate capability/mode/OpenClaw keys, one preference and one errand in legacy memories. Verify retry after an injected credential-write failure and byte-for-byte preservation of the failed legacy record.
- [ ] Run corruption/recovery tests: invalid config envelope, invalid session schema, crash after terminal-before-release, duplicate foreground/Headless claim, model edited/deleted during running task.
- [ ] Run `npm test -- --runInBand`, `npx tsc --noEmit`, `npm run lint`, touched-file `npx prettier --check`, and `cd android && ./gradlew :app:testDebugUnitTest :app:compileDebugKotlin :app:assembleDebug`.
- [ ] On macOS with the checked-in Xcode project, run `xcodebuild -project ios/AwesomeProject.xcodeproj -scheme AwesomeProject -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 15' build`. A missing simulator/Xcode installation must be recorded as `NOT RUN` with the command error; it cannot be converted to PASS.
- [ ] Run privacy scans for `apiKey`, Bearer values, `data:image`, screenshot URI, raw instruction and raw response across persisted fixtures and logs; manually classify type/property names.
- [ ] On Android device verify: companion-only no screenshot, direct behavior, draft/active separation, cloud split planner no image, local vision no cloud fallback, OpenClaw blocked, Headless background/cancel/restart, errand non-duplication.
- [ ] Have an independent testing agent produce a test report and an independent review agent return Critical/Important/Minor findings against the frozen snapshot.
- [ ] Fix validated findings with RED/GREEN, rerun affected and full gates, then record final SHA and remaining physical-device gaps.

## Completion Gate

- All work packages integrated in dependency order; no same-wave ownership overlap.
- One `OperateTaskRunner` owns the execution loop; old foreground/Headless loops are removed.
- AsyncStorage and Headless payload contain no plaintext credentials.
- Config snapshot, model binding, session claim, terminal and errand lease tests cover restart/concurrency/corruption.
- Full automated gates pass or existing baseline debt is proven unchanged with exact normalized comparison.
- Required physical checks are marked PASS/FAIL/NOT RUN truthfully; absence of a device matrix cannot be reported as release PASS.

## Explicitly Out of Scope

- MiniCPM artifact download/JNI/CMake changes.
- Live OpenClaw network protocol.
- System AlarmManager, server-side model storage or voice wake word.
- Replacing existing Android task-surface/service ownership beyond the Headless payload/session adapter.
