# V1 Complete Parallel Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Preserve the V1 NoNo UI while completing its runtime, dual-mode model API configuration, and extensible visual Agent tool capabilities through isolated parallel worktrees, deterministic integration checkpoints, and one independent final acceptance gate.

**Architecture:** V1 remains the product baseline. Pure runtime, model-provider, visual-agent, and UI contracts are frozen first; three implementation agents then work in parallel on non-overlapping domains, while one integration agent exclusively owns shared entry points and cherry-picks approved commits into codex/v1-runtime-integration. A secure Connector Bridge hides each tool's native CLI/ACP/JSON-RPC/HTTP-SSE/WebSocket transport behind one capability-negotiated visual-agent protocol. Runtime foundation, capability domains, UI wiring, ASR, and avatar packs are separate plans joined by this master dependency graph.

**Tech Stack:** React Native 0.73.6, React 18.2, TypeScript 5.0.4, Jest 29, Kotlin 1.9.24, Android API 21–34, iOS Objective-C bridge, AsyncStorage, Android Keystore, iOS Keychain, provider-specific HTTP APIs, and Connector Bridge adapters for WebSocket, CLI/NDJSON, ACP/JSON-RPC, and HTTP/SSE.

## Global Constraints

- Frozen product baseline is V1 at 9ff7ba4cc4dc186b79b6e62181333ae6c9132f54.
- Do not implement directly in the user's primary V1 worktree; execution must create isolated worktrees with superpowers:using-git-worktrees.
- Do not merge codex/agent-runtime-phase1, codex/nono-ui-runtime-integration, or codex/nono-task-surfaces-integration wholesale into V1.
- Reuse phase1 only through reviewed logical file groups or commits recorded in the runtime-foundation plan.
- At most three implementation agents may run concurrently with one integration coordinator.
- Every implementation agent receives one exclusive file domain and one worktree based on the same wave checkpoint SHA.
- Shared-hotspot files are modified only by the integration agent during a serial wiring task.
- A child branch never merges another child branch and never pushes or rebases the integration branch.
- Each task follows red-green TDD, ends in an independently reviewable commit, and records exact commands and outputs.
- A wave becomes the next baseline only after targeted tests, TypeScript, full Jest, and applicable native gates pass on the integrated SHA.
- API keys must not enter AsyncStorage, React state, Headless task payloads, logs, task history, diagnostic bundles, or agent handoff artifacts.
- Replaced/removed model or Connector Bridge secret refs enter a durable retirement queue; only the cold-start integration collector may delete them after active/draft config and every nonterminal immutable session prove the ref unreferenced.
- One operation task has one immutable session and one execution owner across foreground and Headless paths.
- Companion never captures screenshots or executes device actions.
- Local-vision failure, a disconnected visual Agent connector, an incompatible adapter version, and insufficient negotiated capabilities all fail closed; none may silently route to a different pipeline.
- OpenClaw, Codex, Cursor, DSH (DeepSeek Harness), and Hermes are built-in visual Agent adapters; any other tool must pass the same adapter conformance suite before registration.
- Multiple visual Agent profiles may be saved, but each operation session snapshots exactly one profile and adapter for its full lifetime.
- Model API configuration has exactly two modes, `preset` and `custom`; every preset and every custom endpoint always permits a manual model ID.
- “Current credential models” means the complete model set visible to the current credential, endpoint, region, workspace, channel, and protocol, not a vendor-global catalog.
- Android minSdkVersion remains 21; local MiniCPM eligibility remains API 26+, arm64-v8a, 6 GB RAM, and 3 GB free storage.
- The final PASS is issued by an independent testing agent against the exact final integration SHA, not by an implementation agent.

---

## Plan Set and Scope Boundaries

| Plan | Scope | Required checkpoint |
| --- | --- | --- |
| 2026-08-20-v1-runtime-foundation.md | Baseline repair, Agent Runtime port, provider registry/transports/catalog, preset/custom profile migration, secure config, immutable sessions, unique runner, history, privacy logging | V1 baseline |
| 2026-08-20-v1-capability-domains.md | Companion, preference memory, errands, visual Agent core/Bridge contract, five built-in adapters, third-party adapter conformance | Runtime checkpoint |
| 2026-08-20-v1-ui-integration-and-acceptance.md | Wave 0 UI contract freeze; application Facades; model preset/custom UI; visual Agent profile UI; V1 screen wiring; task-scoped UI events; final automated/manual acceptance | V1 baseline for Task 1; domain checkpoint for Task 2 onward |
| 2026-08-20-nono-offline-asr.md | Offline ASR package and SpeechRouter | Companion facade stable |
| 2026-08-20-nono-avatar-glb-packs.md | Downloadable avatar packs and atomic activation | V1 UI checkpoint |

The design authority for all plans is docs/superpowers/specs/2026-08-20-v1-feature-gap-parallel-agent-delivery-design.md.

## Dependency Graph

~~~mermaid
flowchart TD
  B[V1 9ff7ba4] --> W0[Wave 0: baseline + runtime/UI contracts]
  W0 --> A1[Agent A: runtime core]
  W0 --> B1[Agent B: history]
  W0 --> C1[Agent C: native + credential]
  A1 --> G1A[Wave 1A integration gate]
  B1 --> G1A
  C1 --> G1A
  G1A --> A1B[Agent A: config + provider catalog + migration]
  G1A --> B1B[Agent B: immutable sessions]
  G1A --> C1B[Agent C: unique runner]
  A1B --> G1[Wave 1B + serial adapter gate]
  B1B --> G1
  C1B --> G1
  G1 --> A2[Agent A: companion + preference]
  G1 --> B2[Agent B: errands]
  G1 --> C2[Agent C: visual-agent core]
  A2 --> G2A[Wave 2A core gate]
  B2 --> G2A
  C2 --> G2A
  G2A --> A2B[Agent A: OpenClaw adapter]
  G2A --> B2B[Agent B: Codex + Cursor adapters]
  G2A --> C2B[Agent C: DSH + Hermes adapters]
  A2B --> G2[Wave 2B conformance gate]
  B2B --> G2
  C2B --> G2
  G2 --> UI[Wave 3: serial V1 UI wiring]
  UI --> G3[Wave 3 acceptance]
  G3 --> PACK[Avatar LocalPack foundation]
  PACK --> ASR[Offline ASR plan]
  PACK --> AVATAR[Remaining avatar pack plan]
  G3 --> PRIV[Privacy and observability]
  ASR --> FINAL[Independent final acceptance]
  AVATAR --> FINAL
  PRIV --> FINAL
~~~

## Shared-Hotspot Ownership

Only the integration coordinator may modify these files after Wave 0:

~~~text
AwesomeProject/src/features/task/screens/HomeScreen.tsx
AwesomeProject/src/features/task/hooks/useTaskExecution.ts
AwesomeProject/src/features/task/useTaskExecutionWithBackground.ts
AwesomeProject/src/features/task/services/TaskExecutionHeadless.ts
AwesomeProject/src/core/engine/taskEngine/task/TaskExecutionEngine.ts
AwesomeProject/src/features/model/services/ModelService.ts
AwesomeProject/src/shared/types/Model.ts
AwesomeProject/src/shared/constants/apiProviders.ts
AwesomeProject/src/features/model/services/ModelListService.ts
AwesomeProject/src/features/model/components/ApiProviderSelector.tsx
AwesomeProject/src/features/model/components/ModelNameSelector.tsx
AwesomeProject/src/features/model/components/ModelListPanel.tsx
AwesomeProject/src/features/model/screens/AddModelScreen.tsx
AwesomeProject/src/features/model/screens/EditModelScreen.tsx
AwesomeProject/src/features/settings/screens/APIKeyGuideScreen.tsx
AwesomeProject/src/features/capability/services/NonoConfigService.ts
AwesomeProject/src/features/capability/types.ts
AwesomeProject/src/features/capability/screens/OpenClawScreen.tsx
AwesomeProject/src/shared/utils/storage.ts
AwesomeProject/src/shared/constants/storage.config.ts
AwesomeProject/src/navigation/AppNavigator.tsx
AwesomeProject/src/shared/types/navigation.ts
AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityPackage.kt
AwesomeProject/android/app/src/main/java/com/awesomeproject/core/MainApplication.kt
AwesomeProject/ios/AwesomeProject/AppDelegate.mm
AwesomeProject/ios/AwesomeProject.xcodeproj/project.pbxproj
~~~

Feature agents must expose a new Facade, Port, repository, or ViewState and include wiring instructions instead of editing a hotspot.

## Common Handoff Contract

Every work package must include this record in its final response and commit notes:

~~~ts
export interface WorkPackageEvidence {
  workPackage: string;
  baseSha: string;
  commitSha: string;
  ownedFiles: readonly string[];
  changedContracts: readonly string[];
  redCommands: readonly string[];
  greenCommands: readonly string[];
  manualChecks: readonly string[];
  knownGaps: readonly string[];
  rollbackCommit: string;
}
~~~

The coordinator rejects a handoff when baseSha does not equal the wave checkpoint, owned files overlap another active package, a required red/green command is absent, or the branch contains unowned changes.

---

### Task 1: Freeze the V1 Baseline and Create the Integration Worktree

**Files:**
- Read: repository worktree and branch metadata
- Create during execution: isolated worktree outside the primary checkout
- Record: .superpowers/sdd/v1-wave-0-baseline.md

**Interfaces:**
- Consumes: immutable V1 commit 9ff7ba4cc4dc186b79b6e62181333ae6c9132f54.
- Produces: clean integration branch codex/v1-runtime-integration, integration worktree path, and Wave 0 evidence record.

- [ ] **Step 1: Load the required worktree skill**

Invoke superpowers:using-git-worktrees. Do not create a worktree manually until its safety checks pass.

- [ ] **Step 2: Verify the baseline ref**

Run:

~~~bash
git rev-parse V1
git status --short --branch
~~~

Expected: the first command prints 9ff7ba4cc4dc186b79b6e62181333ae6c9132f54; the second result is recorded and no user-owned change is removed or reset.

- [ ] **Step 3: Create a clean integration worktree**

Use the worktree skill to create branch codex/v1-runtime-integration from the frozen SHA.

Expected: git status in the new worktree shows the integration branch and no changes.

- [ ] **Step 4: Record and commit the baseline**

Create .superpowers/sdd/v1-wave-0-baseline.md:

~~~markdown
# V1 Wave 0 Baseline

- Product baseline: 9ff7ba4cc4dc186b79b6e62181333ae6c9132f54
- Integration branch: codex/v1-runtime-integration
- Primary worktree modified: no
- Existing divergent branches merged: no
- Gate status: pending
~~~

Commit:

~~~bash
git add .superpowers/sdd/v1-wave-0-baseline.md
git commit -m "docs: freeze V1 runtime integration baseline"
~~~

Expected: one documentation-only commit on the integration branch.

---

### Task 2: Establish the Contract Checkpoint

**Files:**
- Follow: docs/superpowers/plans/2026-08-20-v1-runtime-foundation.md
- Follow: Task 1 of docs/superpowers/plans/2026-08-20-v1-ui-integration-and-acceptance.md
- Create: AwesomeProject/src/core/engine/operateRuntime/contracts/*
- Create: AwesomeProject/src/core/engine/operateRuntime/model/ModelProviderContracts.ts
- Create: AwesomeProject/src/core/engine/operateRuntime/visualAgent/VisualAgentContracts.ts
- Create: AwesomeProject/src/application/facades/UiRuntimeContracts.ts
- Create: AwesomeProject/src/__tests__/architecture/RuntimeContractBoundaries.test.ts
- Create: AwesomeProject/src/__tests__/application/facades/UiRuntimeContracts.test.ts
- Record: .superpowers/sdd/v1-runtime-contract-checkpoint.md

**Interfaces:**
- Consumes: Task 1 SHA.
- Produces: frozen AgentConfigV2; `ProviderPresetV1`, `ModelEndpointProfileV1`, `ModelBindingV1`, normalized immutable `ProviderExecutionTargetV1`, `ProviderModelCatalogPort`, and `ProviderTransportAdapter`; `VisualAgentProfileV1`, `VisualAgentCapabilitySet`, `VisualAgentToolAdapter`, `VisualAgentToolRegistry`, and `VisualAgentExecutionPort`; `RuntimeConfigEnvelopeV1` with atomic `compareAndActivate`; ResolvedOperateSessionV1; TaskExecutionEvent; CredentialStore; operation Port signatures; and the exact UI Facade/ViewState plus all nine narrow ApplicationPort/EventSource contracts.

- [ ] **Step 1: Create only the pure runtime contract files from the runtime-foundation plan**

Copy the exact interface blocks and validators named by the runtime-foundation and capability-domain plans into the contract paths, including `RuntimeConfigRepository.compareAndActivate`. The envelope field is `visualAgent`, never `openClaw`; legacy OpenClaw is represented only by `toolId: 'openclaw'`. Add contract tests; do not add provider transport, tool adapter, persistence, native, composition-root, or Screen implementations in this task. Later workers consume these files without redefining or widening them.

- [ ] **Step 2: Complete UI-plan Task 1 exactly**

Create `UiRuntimeContracts.ts` and its test exactly as specified by the UI plan. This is the single authority for every public `OperateFacade`, `CompanionFacade`, `PhoneOperateFacade`, `ModelConfigFacade`, `VisualAgentToolsFacade`, `ErrandFacade`, `PrivacyFacade`, `ActivityFacade`, ViewState, task UI event, `TaskUiEventSource`, and the eight named `*ApplicationPort` interfaces. Runtime/Capability composition implements these frozen narrow ports; later Facade workers only import them and may not create a competing port or public Facade signature.

- [ ] **Step 3: Validate contract purity**

Run:

~~~bash
cd AwesomeProject
npx jest --runInBand src/__tests__/architecture/RuntimeContractBoundaries.test.ts
npx jest --runInBand src/__tests__/application/facades/UiRuntimeContracts.test.ts
npx tsc --noEmit
~~~

Expected: PASS; contract files import no React, React Native, AsyncStorage, navigation, native module, Screen, or provider implementation.

- [ ] **Step 4: Record exact exports and commit**

Record public signatures plus:

~~~bash
git diff --name-only 9ff7ba4cc4dc186b79b6e62181333ae6c9132f54...HEAD
~~~

Commit:

~~~bash
git add AwesomeProject/src/core/engine/agentRuntime/contracts AwesomeProject/src/core/engine/agentRuntime/domain AwesomeProject/src/core/engine/operateRuntime/contracts AwesomeProject/src/core/engine/operateRuntime/model/ModelProviderContracts.ts AwesomeProject/src/core/engine/operateRuntime/visualAgent/VisualAgentContracts.ts AwesomeProject/src/application/facades/UiRuntimeContracts.ts AwesomeProject/src/__tests__/architecture AwesomeProject/src/__tests__/application/facades/UiRuntimeContracts.test.ts .superpowers/sdd/v1-runtime-contract-checkpoint.md
git commit -m "feat: freeze V1 runtime contracts"
git branch codex/checkpoint-v1-contracts
~~~

Expected: `git rev-parse codex/checkpoint-v1-contracts` equals `git rev-parse HEAD`; this immutable checkpoint branch becomes the only permitted base for Wave 1A and is never rebased or advanced.

---

### Task 3: Dispatch Runtime Foundation Wave 1A

**Files:**
- Agent A owns: runtime-foundation Task 1 production files/tests, excluding the frozen Task 2 contract files
- Agent B owns: runtime-foundation Task 5 history/instruction files/tests
- Agent C owns: runtime-foundation Tasks 2–3 credential/local-model files/tests, excluding registration/build hotspots

**Interfaces:**
- Consumes: the committed Task 2 checkpoint at the current tip of codex/v1-runtime-integration.
- Produces: three independently green, non-overlapping commits and three WorkPackageEvidence records.

- [ ] **Step 1: Create three worktrees from the same named checkpoint**

Create these branches from `codex/checkpoint-v1-contracts` without advancing the checkpoint branch:

~~~text
codex/v1-w1a-runtime-core
codex/v1-w1a-task-history
codex/v1-w1a-native-security
~~~

Each worker records the literal output of `git rev-parse HEAD` as `baseSha` before its first edit. The coordinator compares all three values to `git rev-parse codex/checkpoint-v1-contracts`; any mismatch rejects the package.

- [ ] **Step 2: Dispatch Agent A with this exact scope**

~~~text
Follow Task 1 of docs/superpowers/plans/2026-08-20-v1-runtime-foundation.md.
Consume the already frozen contract files without redefining them. Own only
agentRuntime domain/providers/pipelines/policy/adapters/runtime files and their
tests. Port the reviewed phase1 behavior named by the child plan without
merging that branch. Do not modify shared hotspots, storage, native files,
Screens, or task entry points. Follow RED/GREEN, commit, and return the complete
WorkPackageEvidence record with the literal branch base SHA.
~~~

- [ ] **Step 3: Dispatch Agent B with this exact scope**

~~~text
Follow Task 5 of docs/superpowers/plans/2026-08-20-v1-runtime-foundation.md.
Own only TaskHistoryService, the new TaskInstructionPort/adapter, their tests,
and any explicitly named non-hotspot history file. Preserve unrelated history
fields and prove serialized concurrent writes. Do not edit execution loops,
Headless entry points, UI, runtime config, or native files. Follow RED/GREEN,
commit, and return the complete WorkPackageEvidence record with the literal
branch base SHA.
~~~

- [ ] **Step 4: Dispatch Agent C with this exact scope**

~~~text
Follow Tasks 2 and 3 of docs/superpowers/plans/2026-08-20-v1-runtime-foundation.md.
Own only agentRuntime/credentials, agentRuntime/localModel, new Android/iOS
security and local-model implementation files, and matching tests. Do not edit
native registration, project/build manifests, AppDelegate, MainApplication, or
AccessibilityPackage; return exact serial wiring instructions for them. Port
only the reviewed donor commits named by the child plan. Follow RED/GREEN,
commit, and return the complete WorkPackageEvidence record with the literal
branch base SHA.
~~~

- [ ] **Step 5: Verify every Wave 1A branch before integration**

Run on each child branch:

~~~bash
git diff --name-only codex/checkpoint-v1-contracts...HEAD
git log --oneline --no-merges codex/checkpoint-v1-contracts..HEAD
git log --oneline --merges codex/checkpoint-v1-contracts..HEAD
~~~

Expected: the first output stays inside ownership, the second contains the package commits, and the third has no output.

---

### Task 4: Integrate Wave 1A, Run Wave 1B, and Gate the Runtime Foundation

**Files:**
- Agent A Wave 1B owns: runtime-foundation Tasks 4A–4B new provider/catalog/profile-binding/config/migration/visual-contract files and tests only
- Agent B Wave 1B owns: runtime-foundation Task 6 session contracts/resolver/store/runtime façade and tests, excluding `CredentialReferenceGarbageCollector` and its test
- Agent C Wave 1B owns: runtime-foundation Task 7 runner files/tests
- Integration coordinator exclusively modifies all existing shared runtime, Screen, storage, registration, and entry-point hotspots required by runtime-foundation Tasks 3–4 and 8–10, plus the Task 6 `CredentialReferenceGarbageCollector` join file/test after Agent A/B integration
- Record: .superpowers/sdd/v1-wave-1a-integration.md and .superpowers/sdd/v1-wave-1-runtime-foundation.md

**Interfaces:**
- Consumes: approved Wave 1A commits, then approved Wave 1B commits based on the Wave 1A integration checkpoint.
- Produces: one versioned secure configuration, atomic capability CAS, immutable sessions, a unique runner, safe foreground/Headless adapters, and the exact application ports consumed by the UI plan.

- [ ] **Step 1: Cherry-pick and gate Wave 1A in dependency order**

~~~bash
git cherry-pick codex/checkpoint-v1-contracts..codex/v1-w1a-runtime-core
git cherry-pick codex/checkpoint-v1-contracts..codex/v1-w1a-task-history
git cherry-pick codex/checkpoint-v1-contracts..codex/v1-w1a-native-security
cd AwesomeProject
npx jest --runInBand src/__tests__/core/engine/agentRuntime
npx jest --runInBand src/__tests__/services/TaskHistoryService.test.ts
npx jest --runInBand src/__tests__/core/engine/agentRuntime/credentials src/__tests__/core/engine/agentRuntime/localModel
npx tsc --noEmit
~~~

Expected: every targeted suite and TypeScript pass. Stop on the first failure; do not cherry-pick a later package over a red checkpoint.

- [ ] **Step 2: Apply native registration serially and record Wave 1A**

The coordinator applies Agent C's reviewed registration/build instructions, runs the exact Android/iOS commands from runtime-foundation Tasks 2–3, then commits those hotspot edits and `.superpowers/sdd/v1-wave-1a-integration.md`. Create immutable checkpoint branch `codex/checkpoint-v1-wave1a` at that commit and verify it equals `HEAD`; this checkpoint becomes the only Wave 1B base.

- [ ] **Step 3: Dispatch Wave 1B from the new integration tip**

Create `codex/v1-w1b-config-migration`, `codex/v1-w1b-operate-session`, and `codex/v1-w1b-operate-runner` from `codex/checkpoint-v1-wave1a`. Reuse the three workers, but give each a fresh worktree and require a new literal `baseSha` equal to `git rev-parse codex/checkpoint-v1-wave1a`.

Use these scopes:

~~~text
Agent A: follow runtime-foundation Tasks 4A and 4B, consuming the already frozen
`ModelProviderContracts.ts` and `VisualAgentContracts.ts` byte-for-byte. Implement
only new config, provider registry/transport/catalog, profile/binding repository,
controller, migration helpers, and tests. Prove RuntimeConfigRepository.compareAndActivate
is a one-queue-operation CAS; model and visual-agent credentials are only
secretRef:string|null; catalog results distinguish ready, unsupported,
auth_failed, network_failed, and empty; and the legacy OpenClaw record migrates
to VisualAgentProfileV1(toolId:'openclaw'). Implement the staged/committed
CredentialRetirementRepository but never delete a superseded live ref inline.
Do not edit existing storage,
Add/Edit Screens, selectors, capability Screens, or other shared hotspots;
return exact wiring notes for the coordinator.

Agent B: follow runtime-foundation Task 6. Own only immutable operate-session
contracts/repository/factory/lease files and tests. Expose the exact nonterminal
session ref scan required by the child plan, but exclude the cross-package
CredentialReferenceGarbageCollector file/test; the coordinator owns that join.
Consume the frozen runtime
contracts and TaskInstructionPort. Do not edit hooks, Headless, Screens, native
files, or the runner.

Agent C: follow runtime-foundation Task 7. Own only the runner directory,
including `SnapshotAgentRuntimeAdapter`, `OperateTaskRunner`, their factory and
tests. Use injected ports, the frozen session lease and Task 4A
`ModelProviderRegistry` read-only; prove the snapshot-to-transport join without
editing model provider/transport implementations. Do not edit session
persistence, foreground/background adapters, UI or native files.
~~~

- [ ] **Step 4: Verify and integrate Wave 1B**

Before integration, run the same ownership/no-merge commands from Task 3 Step 5 against the Wave 1A integration tip recorded in `.superpowers/sdd/v1-wave-1a-integration.md`. Then integrate and gate in this order:

~~~bash
git cherry-pick codex/checkpoint-v1-wave1a..codex/v1-w1b-config-migration
git cherry-pick codex/checkpoint-v1-wave1a..codex/v1-w1b-operate-session
git cherry-pick codex/checkpoint-v1-wave1a..codex/v1-w1b-operate-runner
cd AwesomeProject
npx jest --runInBand src/__tests__/core/engine/operateRuntime/model
npx jest --runInBand src/__tests__/core/engine/operateRuntime/config
npx jest --runInBand src/__tests__/core/engine/operateRuntime/visualAgent
npx jest --runInBand src/__tests__/core/engine/operateRuntime/session
npx jest --runInBand src/__tests__/core/engine/operateRuntime/runner
npx tsc --noEmit
~~~

- [ ] **Step 5: Complete the shared serial runtime work**

The integration coordinator first creates runtime-foundation Task 6 `CredentialReferenceGarbageCollector` and its test against the just-integrated Task 4B retirement repository plus Task 6 nonterminal-session scan. Production startup must finish config migration/load, session recovery, and retired-ref reconciliation before admitting `createSession`; a ref held by any active/draft config or nonterminal session is never deleted. Then the coordinator completes the existing-file portions of runtime-foundation Tasks 4A–4B; Task 7 `operateRuntime/index.ts`, `TaskExecutionContracts.ts`, `TaskExecutionEngine.ts`, `taskEngine/index.ts` and donor `TaskExecutionEngine.test.ts`; then Tasks 8–10 in order. It consumes Agent C's runner/`SnapshotAgentRuntimeAdapter` commit without giving another writer those files. Foreground and Headless adapters must acquire the same immutable session and call the same `OperateTaskRunner.run(lease)`; old direct calls to `modelInferenceModule.infer` must be deleted or unreachable. The application adapter must implement the UI plan's exact `OperateApplicationPort`; the public `OperateFacade` remains the frozen UI contract and is implemented only by UI-plan Task 2.

- [ ] **Step 6: Run runtime-foundation Task 11 without substitution**

Run every targeted, full Jest, TypeScript, lint, Android, iOS, architecture, and privacy command specified by runtime-foundation Task 11. A native gate may be `WAIVED` only when the evidence record contains reason, impact, owner, and expiry date; JavaScript/TypeScript/Jest gates cannot be waived.

- [ ] **Step 7: Record the Wave 1 checkpoint**

~~~bash
git add .superpowers/sdd/v1-wave-1-runtime-foundation.md
git commit -m "test: record V1 runtime foundation gate"
git branch codex/checkpoint-v1-wave1
~~~

Expected: the recorded SHA is clean, all runtime-foundation completion criteria pass, including live-session credential pinning and post-terminal cold-start retired-ref collection; `codex/checkpoint-v1-wave1` equals `HEAD`, and that immutable checkpoint becomes the only permitted base for Wave 2.

---

### Task 5: Dispatch Wave 2 Capability Domains

**Files:**
- Integration coordinator first owns: capability-domain Task 1 shared ports/privacy projection and tests
- Agent A owns: capability-domain Tasks 2–4 preference/companion files and tests
- Agent B owns: capability-domain Tasks 5–6 errand files and tests
- Agent C owns: capability-domain Tasks 7–8 canonical-contract verification, Bridge codec, profile controller, and read-only migrated-OpenClaw projection tests; no migration production file and no concrete adapter subdirectory

**Interfaces:**
- Consumes: `codex/checkpoint-v1-wave1`, the frozen UI contracts, `CredentialStore`, atomic `RuntimeConfigRepository.compareAndActivate`, and the unique operate application port.
- Produces: domain implementations and narrow feature Facades from which the integration coordinator implements the UI plan's exact `CompanionApplicationPort`, `ErrandApplicationPort`, `VisualAgentToolsApplicationPort`, and `PrivacyApplicationPort`, plus a transport-neutral Bridge codec; the capability workers do not redefine those UI ports or any public Facade signature, and no V1 Screen is edited.

- [ ] **Step 1: Create and gate the shared capability checkpoint serially**

Complete capability-domain Task 1 in the integration worktree, run its RED/GREEN and TypeScript commands, commit it, then create immutable branch `codex/checkpoint-v1-capability-ports`. Confirm this branch equals `HEAD` before dispatch.

- [ ] **Step 2: Create branches from that checkpoint**

~~~text
codex/v1-w2-companion-preference
codex/v1-w2-errand
codex/v1-w2a-visual-agent-core
~~~

- [ ] **Step 3: Freeze the adapter rule before dispatch**

The capability plan's `CapabilityConfigPort` is a narrow adapter, not a second store. Its production `compareAndSet` must call exactly one `RuntimeConfigRepository.compareAndActivate`, preserve unrelated runtime and model-provider fields, and keep every credential as `secretRef: string | null`. Mobile `VisualAgentProfileV1` stores only `{bridgeUrl, bindingId, secretRef}` in its Connector Bridge reference; adapter-specific gateway, CLI, ACP, JSON-RPC, or HTTP/SSE settings remain in the Bridge-owned binding addressed by `bindingId`. If the Wave 1 checkpoint lacks that contract, stop Wave 2; do not compensate in feature storage.

- [ ] **Step 4: Dispatch the three exact child-plan scopes**

All branches start at `codex/checkpoint-v1-capability-ports`. Agent A follows Tasks 2–4, Agent B follows Tasks 5–6, and Agent C follows Tasks 7–8 of `docs/superpowers/plans/2026-08-20-v1-capability-domains.md`. Task 7 consumes the runtime-owned nine visual contracts byte-for-byte and only adds the Bridge codec; it must not recreate a registry, profile, execution port, or protocol type. Each agent follows every RED/GREEN/commit step in its section, cannot edit the shared-hotspot list or a concrete adapter directory outside its scope, and returns WorkPackageEvidence whose `baseSha` equals the checkpoint branch.

- [ ] **Step 5: Verify each branch**

Run the exact targeted tests in the capability-domain plan, `npx tsc --noEmit`, the ownership diff against `codex/checkpoint-v1-capability-ports`, and the no-merge log check from Task 3.

Expected: PASS on every branch before integration.

---

### Task 6: Gate Wave 2A, Dispatch Built-in Adapters, and Gate Wave 2B

**Files:**
- Agent A owns: AwesomeProject/src/connectorBridge/visualAgent/adapters/openclaw/** plus matching tests
- Agent B owns: AwesomeProject/src/connectorBridge/visualAgent/adapters/codex/** and adapters/cursor/** plus matching tests
- Agent C owns: AwesomeProject/src/connectorBridge/visualAgent/adapters/dsh/** and adapters/hermes/** plus matching tests
- Integration coordinator owns: capability-domain Task 12 aggregate conformance suite, built-in registry, mobile Bridge client, application composition roots, public barrels, and architecture guards; the reusable runner already exists in Wave 2A Task 7
- Record: .superpowers/sdd/v1-wave-2a-core.md and .superpowers/sdd/v1-wave-2-integration.md

**Interfaces:**
- Consumes: approved Companion, Errand, and visual Agent core commits.
- Produces: domain services composed against runtime Ports, five built-in visual Agent adapters, a third-party adapter extension kit, and a clean immutable `codex/checkpoint-v1-wave2` after one conformance gate.

- [ ] **Step 1: Cherry-pick in dependency order**

~~~bash
git cherry-pick codex/checkpoint-v1-capability-ports..codex/v1-w2-companion-preference
git cherry-pick codex/checkpoint-v1-capability-ports..codex/v1-w2-errand
git cherry-pick codex/checkpoint-v1-capability-ports..codex/v1-w2a-visual-agent-core
~~~

Expected: no content conflict because ownership is disjoint. Complete the capability plan's core gate, commit `.superpowers/sdd/v1-wave-2a-core.md`, create `codex/checkpoint-v1-wave2a`, and verify that branch equals the clean `HEAD` before any concrete adapter work begins.

- [ ] **Step 2: Dispatch three adapter worktrees from the exact Wave 2A checkpoint**

Create these branches, all from `codex/checkpoint-v1-wave2a`:

~~~text
codex/v1-w2b-openclaw-adapter
codex/v1-w2b-codex-cursor-adapters
codex/v1-w2b-dsh-hermes-adapters
~~~

Agent A follows capability-domain Task 9 and owns only `connectorBridge/visualAgent/adapters/openclaw/**`; Agent B follows Task 10 and owns only the `codex/**` and `cursor/**` adapter subdirectories; Agent C follows Task 11 and owns only the `dsh/**` and `hermes/**` adapter subdirectories. All consume the frozen core protocol, must not widen it, and must return WorkPackageEvidence with `baseSha` equal to `codex/checkpoint-v1-wave2a`.

- [ ] **Step 3: Gate every adapter branch before integration**

Run each built-in adapter's exact branch-owned unit test; each of those tests must invoke the shared `defineVisualAgentAdapterConformance` runner created at Wave 2A. Do not run the not-yet-created Task 12 aggregate `VisualAgentAdapterConformance.test.ts` on an isolated adapter branch. Then run `npx tsc --noEmit`, the ownership diff, and no-merge log check. Expected: every adapter reports manifest/version and negotiated capabilities truthfully; unsupported approval, steer, resume, or streaming remains unsupported rather than fabricated; image input plus structured action are required for operation activation; disconnect and protocol failure make zero local-pipeline calls.

- [ ] **Step 4: Integrate the complete adapter branch ranges**

~~~bash
git cherry-pick codex/checkpoint-v1-wave2a..codex/v1-w2b-openclaw-adapter
git cherry-pick codex/checkpoint-v1-wave2a..codex/v1-w2b-codex-cursor-adapters
git cherry-pick codex/checkpoint-v1-wave2a..codex/v1-w2b-dsh-hermes-adapters
~~~

Expected: no adapter modifies another adapter's private codec/config or the public core contract.

- [ ] **Step 5: Complete capability composition and architecture guards serially**

The integration coordinator completes capability-domain Task 12 exactly: import the Wave-2A shared conformance runner, add the aggregate five-fixture suite, built-in registry, mobile Connector Bridge client, public barrels, and architecture guards. Then create one application composition file per domain. Instantiate repositories, `VisualAgentToolRegistry`, Connector Bridge port, `CredentialRetirementRepository`, and the exact `CapabilityConfigPort` adapter, but export only the UI-safe application ports frozen in UI-plan Task 1; concrete repositories, transports, tool credentials, and Bridge clients remain private.

- [ ] **Step 6: Run domain and conformance gates**

~~~bash
cd AwesomeProject
npx jest --runInBand src/__tests__/core/engine/companion
npx jest --runInBand src/__tests__/core/engine/errand
npx jest --runInBand src/__tests__/connectorBridge/visualAgent
npx jest --runInBand src/__tests__/features/visualAgent
npx jest --runInBand src/__tests__/privacy
npx tsc --noEmit
npm test -- --runInBand
~~~

Expected: Companion makes zero screenshot/action calls, concurrent errand sweeps execute one lease, all five built-in adapters pass the same conformance suite, a rejected custom adapter cannot register, a disconnected connector never calls a local pipeline, and all commands PASS.

- [ ] **Step 7: Record the checkpoint**

~~~bash
git add .superpowers/sdd/v1-wave-2-integration.md
git commit -m "test: record V1 capability domain gate"
git branch codex/checkpoint-v1-wave2
~~~

Expected: `codex/checkpoint-v1-wave2` equals the clean accepted Wave 2 `HEAD` and is never advanced.

---

### Task 7: Execute the UI Facade Wave and Serial V1 UI Integration

**Files:**
- Follow: docs/superpowers/plans/2026-08-20-v1-ui-integration-and-acceptance.md
- Agents A/B/C own only the three new application Facade work packages named by the UI plan: operate/companion, capability/visual-agent/model-config, and errand/activity
- Integration coordinator owns UI composition, then every shared model Screen, navigation, Home, native-event, and existing-service hotspot
- Record: .superpowers/sdd/v1-wave-3-ui-integration.md

**Interfaces:**
- Consumes: `codex/checkpoint-v1-wave2`, the single frozen `UiRuntimeContracts.ts`, and domain application ports.
- Produces: the exact public AppFacades, a single composition root, and V1 UI backed by real services with demo-only behavior removed from production.

- [ ] **Step 1: Dispatch UI-plan Tasks 2–4 in parallel**

Create `codex/v1-w3-ui-operate-companion`, `codex/v1-w3-ui-capability`, and `codex/v1-w3-ui-errand-activity` from `codex/checkpoint-v1-wave2`. Agent A follows UI-plan Task 2, Agent B follows Task 3, and Agent C follows Task 4. They may add only the files listed by those tasks, must not create a second copy of `UiRuntimeContracts.ts`, and must return WorkPackageEvidence based on the checkpoint.

- [ ] **Step 2: Gate and integrate the UI Facade wave**

Run each task's targeted test, TypeScript, ownership diff, and no-merge check on its child branch. Then cherry-pick each complete branch range from `codex/checkpoint-v1-wave2` in Task 2/3/4 order and complete UI-plan Task 5 serially in the integration worktree.

- [ ] **Step 3: Complete UI-plan Tasks 6–7 serially**

Fix typed navigation and bind PhoneOperate readiness exactly as Task 6 specifies. Then replace global task events with the task/session/sequence-scoped channel in one atomic JS + Android + iOS commit from Task 7. No child agent edits those hotspots.

- [ ] **Step 4: Complete UI-plan Tasks 8–9 serially**

Remove production `DEMO_TURNS`, global pending-task variables, direct model selection, direct native resource cleanup, and direct `DeviceEventEmitter` ownership. Home consumes only injected Facades. PhoneOperate blocks unrunnable modes; VisualAgentTools, Errand, Privacy, Activity, and model forms bind to real ViewState/controllers/repositories. Add/Edit expose only `preset | custom`, reuse the shared provider/model selectors, never rehydrate a plaintext credential, and show `ready | unsupported | auth_failed | network_failed | empty | stale | loading` catalog states. Custom mode must round-trip label/base URL/protocol/auth/chat path/models path/model ID plus user-declared modalities and chat/vision/tool/reasoning flags, visibly marked unverified; every catalog state retains manual ID input. The `OpenClaw` route remains only as a one-version alias to the new visual-agent screen.

- [ ] **Step 5: Run all UI-plan gates through Task 9 and record the checkpoint**

Expected: every command through UI-plan Task 9 passes before recording the checkpoint.

~~~bash
git add .superpowers/sdd/v1-wave-3-ui-integration.md
git commit -m "test: record V1 UI runtime integration gate"
git branch codex/checkpoint-v1-wave3
~~~

Expected: `codex/checkpoint-v1-wave3` equals the clean integration `HEAD` and becomes the base for local-pack/ASR/avatar work.

---

### Task 8: Execute the Local-Pack Prerequisite, Then ASR/Avatar in Parallel

**Files:**
- Wave 4A Agent A owns: avatar-plan Task 2 LocalPack implementation/tests, excluding shared native registration/build files
- Wave 4A Agent B owns: avatar-plan Task 1 manifest validation/pins/tests
- Wave 4A Agent C owns: UI-plan Task 11 privacy/architecture/integration test scaffolding only
- Wave 4B Agent A owns: remaining non-hotspot avatar domain/store/WebView work from avatar-plan Tasks 3–6
- Wave 4B Agent B owns: non-hotspot ASR domain/native work from ASR-plan Tasks 1–5
- Integration coordinator owns: all Home, Settings, navigation, native registration/build, and UI-plan Task 10 join points

**Interfaces:**
- Consumes: `codex/checkpoint-v1-wave3`; ASR additionally consumes an accepted LocalPack Task 2 checkpoint.
- Produces: real `SpeechFacade`/router, durable avatar pack store with atomic rollback, redacted diagnostics/tests, and no overlapping hotspot edits.

- [ ] **Step 1: Run prerequisite Wave 4A**

Create `codex/v1-w4a-local-pack`, `codex/v1-w4a-avatar-manifest`, and `codex/v1-w4a-acceptance-scaffold` from `codex/checkpoint-v1-wave3`. Execute the scopes above with TDD and WorkPackageEvidence. Integrate all accepted branch ranges serially, apply LocalPack native registration/build wiring in the integration worktree, run avatar-plan Tasks 1–2 gates, commit, and create immutable branch `codex/checkpoint-v1-local-pack`.

- [ ] **Step 2: Dispatch dependent Wave 4B**

Create `codex/v1-w4b-avatar-packs`, `codex/v1-w4b-offline-asr`, and `codex/v1-w4b-privacy-observability` from `codex/checkpoint-v1-local-pack`. Avatar and ASR agents do not edit Home, Settings, navigation, registration, or build manifests; they implement/test non-hotspot files and return exact wiring notes. The privacy agent changes no provider behavior or routing and finishes the non-device portions of UI-plan Task 11.

- [ ] **Step 3: Integrate Wave 4B with targeted gates**

Cherry-pick complete branch ranges in Avatar, ASR, Privacy order from `codex/checkpoint-v1-local-pack`. After each pick run that child plan's exact targeted tests and `npx tsc --noEmit`; stop on failure.

- [ ] **Step 4: Complete UI-plan Task 10 serially**

The integration coordinator applies the reviewed native registration/build, Home, Settings, navigation, avatar rollback, and ASR listening wiring as one ordered sequence. Existing ASR-plan Task 6 and avatar-plan Tasks 5–6 are treated as join-point instructions; the coordinator owns their hotspot edits. Run all automated gates from both child plans and UI-plan Task 10.

- [ ] **Step 5: Finish and commit UI-plan Task 11 before candidate freeze**

The integration coordinator now executes UI-plan Task 11 Steps 1–7 in full: create the integration/recovery/architecture tests, make them pass, run the exact privacy scans, create the verification-report skeleton, consolidate the official visual-tool/provider protocol research record, and commit those files. This step absorbs any accepted Wave 4A/4B acceptance-scaffold work. After its commit, no test, fixture, architecture guard, production file, research record, or report skeleton may be created on the candidate during acceptance; Task 12 may only execute existing checks, record the research gate, and fill the already-tracked verification report. If Task 11 reveals a product defect or protocol mismatch, fix it here, rerun all affected gates, and commit before continuing.

- [ ] **Step 6: Record the candidate checkpoint**

~~~bash
git add .superpowers/sdd/v1-wave-4-local-experience.md
git commit -m "test: record V1 local experience gate"
git branch codex/checkpoint-v1-candidate
git status --short
git rev-parse HEAD
git rev-parse codex/checkpoint-v1-candidate
~~~

Expected: both SHAs are identical and the worktree is clean. Unified acceptance may test only this immutable checkpoint or a later review-fix checkpoint produced by repeating Tasks 8–9 gates.

---

### Task 9: Run Independent Unified Acceptance

**Files:**
- Modify and commit exactly once through UI-plan Task 12, then read: docs/superpowers/reports/2026-08-20-v1-ui-integration-and-acceptance-verification.md
- Read: all wave evidence
- Do not modify production code during acceptance

**Interfaces:**
- Consumes: exact final integration SHA.
- Produces: one PASS, FAIL, or WAIVED report with separate tested-code/evidence-commit identities and a recorded project test gate.

- [ ] **Step 1: Freeze the candidate**

~~~bash
: "${V1_CANDIDATE_REF:?export the exact immutable candidate branch, for example codex/checkpoint-v1-candidate}"
candidate_sha=$(git rev-parse "$V1_CANDIDATE_REF")
test "$(git rev-parse HEAD)" = "$candidate_sha"
git status --short
git rev-parse "$V1_CANDIDATE_REF"
~~~

Expected: `HEAD` equals the exact immutable branch named by `V1_CANDIDATE_REF`, record `candidate_sha` as `Tested code SHA`, and observe a clean worktree. The first run exports `V1_CANDIDATE_REF=codex/checkpoint-v1-candidate`; every retry exports its new suffixed branch. Otherwise stop with FAIL.

- [ ] **Step 2: Dispatch an independent testing agent**

~~~text
Inspect the exact integration SHA and all wave evidence. Write a test plan before
running commands. Run TypeScript, full Jest, lint, Android unit/build gates, and
applicable iOS build gates. Simulate Companion, cloud direct, cloud split,
local-vision fail-closed, every built-in visual-agent adapter plus custom
adapter rejection, connector disconnected, provider preset/custom and catalog
states, immutable OpenAI-compatible/Anthropic/Gemini/custom protocol dispatch,
errand lease,
foreground/background/cancel, secret privacy, ASR, and avatar rollback.
Do not modify production code. Return PASS/FAIL/WAIVED with commands, outputs,
gaps, device identifiers, and exact tested SHA.
~~~

- [ ] **Step 3: Re-run the committed Task 11 gates and execute UI-plan Task 12**

Treat all Task 11 tests, fixtures, architecture guards, privacy scripts, and the report skeleton as immutable candidate code. The independent testing agent follows Task 12 against `V1_CANDIDATE_REF`, re-runs those already-committed commands read-only, executes every automated/device row, and edits only the report's evidence cells. Steps 4–6 below are coordinator-visible minimum checkpoints, not a replacement for the child plan. Finish UI-plan Task 12 Step 11 exactly once before master Step 7. Discovery of a missing check or product fix fails this candidate and returns to Task 8 Step 5; create a new suffixed candidate after the change rather than modifying the tested snapshot.

- [ ] **Step 4: Run the minimum automated release subset**

~~~bash
cd AwesomeProject
npm ci
npx tsc --noEmit
npm test -- --runInBand
npm run lint
cd android
./gradlew testDebugUnitTest
./gradlew assembleDebug
~~~

Expected: every command exits 0.

- [ ] **Step 5: Run negative architecture/privacy checks**

~~~bash
cd AwesomeProject
npx jest --runInBand src/__tests__/architecture
npx jest --runInBand src/__tests__/privacy
if git grep -n "taskId: 'current'" -- src; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
if git grep -n "DEMO_TURNS" -- src; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
~~~

Expected: both suites PASS and both grep commands print no production matches.

- [ ] **Step 6: Run the child plan's manual matrix**

Record device model, OS version, app SHA, expected result, actual result, screenshot/log reference, and status for every row.

- [ ] **Step 7: Verify the single report evidence commit produced by UI-plan Task 12**

The report schema and its only evidence commit are owned by UI-plan Tasks 11–12. Do not rewrite, recommit, or amend that report in the master plan. Verify its identity and contents read-only:

~~~bash
: "${V1_CANDIDATE_REF:?export the exact immutable candidate branch}"
report_path=docs/superpowers/reports/2026-08-20-v1-ui-integration-and-acceptance-verification.md
candidate_sha=$(git rev-parse "$V1_CANDIDATE_REF")
evidence_commit_sha=$(git rev-parse HEAD)
test "$(git rev-parse "$evidence_commit_sha^")" = "$candidate_sha"
test "$(git diff-tree --no-commit-id --name-only -r "$evidence_commit_sha")" = "$report_path"
test "$(git diff --name-only "$V1_CANDIDATE_REF".."$evidence_commit_sha")" = "$report_path"
git show "${evidence_commit_sha}:${report_path}" | rg -F "Candidate code SHA: $candidate_sha"
git status --short
~~~

Expected: all `test` commands exit 0, the report names the exact candidate SHA, the report commit's parent is that candidate, the commit and candidate-to-evidence diff both contain exactly the report, and status is clean. Preserve the literal `evidence_commit_sha` in coordinator evidence; Task 10 copies it into the handoff file without amending or duplicating this immutable evidence commit.

---

### Task 10: Review the Accepted Snapshot and Prepare Handoff

**Files:**
- Read: final integration diff and acceptance report
- Create: .superpowers/sdd/v1-release-handoff.md

**Interfaces:**
- Consumes: Task 9 tested-code SHA, its evidence-only report commit, and a PASS report or an explicitly approved WAIVED report.
- Produces: final review evidence and release-ready handoff; no merge occurs without user authorization.

- [ ] **Step 1: Run the project review gate**

~~~bash
agent-runtime review
~~~

Expected: the review target is the literal Task 9 evidence-commit SHA, whose only difference from the tested candidate is the acceptance report. Kimi K3-first review passes or unresolved findings are surfaced. Do not repeat an unchanged rejected snapshot.

- [ ] **Step 2: Invalidate acceptance after any code change**

Any review fix requires a new Task 9 run and a new report tied to the new SHA.

Create a new immutable candidate checkpoint for every production fix (`codex/checkpoint-v1-candidate-r2`, then increment the suffix for later attempts); never advance or reuse an already tested candidate branch. Before repeating Task 9 and UI-plan Task 12, export the exact new ref, for example `export V1_CANDIDATE_REF=codex/checkpoint-v1-candidate-r2`; every candidate comparison must use this variable rather than the first-run branch name.

- [ ] **Step 3: Write and record the handoff**

Create a metadata-only branch from the immutable Task 9 evidence commit. Include branch, Tested code SHA, Evidence commit SHA, commits by wave, accepted report, migrations, rollout, rollback commits, waived checks, review result, and suggested PR title/body.

~~~bash
git switch -c codex/v1-release-handoff
agent-runtime handoff --record .superpowers/sdd/v1-release-handoff.md
git add .superpowers/sdd/v1-release-handoff.md
git commit -m "docs: record V1 release handoff"
git diff --name-only HEAD^..HEAD
~~~

Expected: the last command prints only `.superpowers/sdd/v1-release-handoff.md`. This metadata commit is not a new tested-code or evidence identity and must not amend, advance, or reuse either immutable checkpoint.

- [ ] **Step 4: Stop before merge or push**

Present the accepted result. PR creation, push, merge, release, or worktree cleanup requires explicit user authorization and the finishing-development-branch workflow.

---

## Completion Criteria

- Every child-plan task is checked off with commit and evidence.
- All child commits originate from the correct wave checkpoint.
- No child branch contains unowned hotspot edits.
- Runtime, provider registry/transports/catalog, preset/custom profiles and bindings, secure credentials plus deferred retirement GC, immutable sessions, unique runner, Companion, Errand, visual Agent core, all five built-in adapters, third-party adapter conformance, ASR, Avatar, privacy, and UI integration have required tests.
- The report's Tested code SHA exactly equals the immutable candidate checkpoint; the immutable evidence commit differs from it only by the verification report; the optional final handoff metadata commit differs from the evidence commit only by `.superpowers/sdd/v1-release-handoff.md`; final test/review gate records name the evidence commit explicitly.
- TypeScript, full Jest, lint, required Android gates, architecture tests, and privacy tests pass.
- Every required manual user journey is PASS or has an approved WAIVED record.
- Project test and review gates are recorded.
- No merge, push, release, or cleanup occurs without user authorization.

## Execution Handoff

This document set is the deliverable for the current request; stop after review and do not create implementation worktrees, branches, commits, PRs, or product-code changes.

If the user later authorizes execution, use `superpowers:subagent-driven-development` in this task as the recommended mode: the coordinator runs Tasks 1–10, dispatches at most three scoped workers only at the waves named above, and performs every integration/acceptance gate. The alternative is `superpowers:executing-plans` in a separate task with the same checkpoints and review stops. Neither option may skip the independent Task 9 acceptance or broaden file ownership.
