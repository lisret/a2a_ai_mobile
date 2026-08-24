### Task 12: Unified Conformance Gate, Connector Bridge Client, Public Barrels, and Architecture Guard

**Files:**

- Create: `AwesomeProject/src/connectorBridge/visualAgent/BuiltInVisualAgentToolRegistry.ts`
- Create: `AwesomeProject/src/features/visualAgent/data/ConnectorBridgeTransport.ts`
- Create: `AwesomeProject/src/features/visualAgent/data/ConnectorBridgeVisualAgentClient.ts`
- Create: `AwesomeProject/src/features/visualAgent/data/VisualAgentPreferenceRepository.ts`
- Create: `AwesomeProject/src/features/visualAgent/application/VisualAgentViewState.ts`
- Create: `AwesomeProject/src/features/visualAgent/application/VisualAgentFacade.ts`
- Create: `AwesomeProject/src/features/visualAgent/index.ts`
- Create: `AwesomeProject/src/features/preference/index.ts`
- Create: `AwesomeProject/src/features/companion/index.ts`
- Create: `AwesomeProject/src/features/errand/index.ts`
- Test: `AwesomeProject/src/__tests__/connectorBridge/visualAgent/VisualAgentAdapterConformance.test.ts`
- Test: `AwesomeProject/src/__tests__/features/visualAgent/ConnectorBridgeVisualAgentClient.test.ts`
- Test: `AwesomeProject/src/__tests__/features/visualAgent/VisualAgentPreferenceRepository.test.ts`
- Test: `AwesomeProject/src/__tests__/features/visualAgent/VisualAgentFacade.test.ts`
- Test: `AwesomeProject/src/__tests__/architecture/CapabilityDomainBoundaries.test.ts`

**Interfaces:**

- Consumes: Tasks 1–11 and the five adapter fixtures; global WebSocket/HTTP only through `ConnectorBridgeTransport`.
- Produces: one aggregate suite over Task 7's `defineVisualAgentAdapterConformance` gate, `VisualAgentToolRegistry` instance containing five built-ins, mobile-only Connector Bridge proxy implementing `VisualAgentExecutionPort`, remote preference adapter, sanitized Facade/ViewState, four UI-safe barrels, architecture boundary gate。

The conformance seam was frozen and implemented in Task 7. Task 12 adds only the Connector Bridge mobile seam:

```ts
export interface ConnectorBridgeSession {
  send(message: VisualAgentProtocolV1): Promise<void>;
  subscribe(listener: (raw: string) => void): () => void;
  close(): Promise<void>;
}

export interface ConnectorBridgeTransport {
  open(input: {
    bridgeUrl: string;
    secretRef: string | null;
    signal: AbortSignal;
  }): Promise<ConnectorBridgeSession>;
}

export class ConnectorBridgeVisualAgentClient implements VisualAgentExecutionPort {
  constructor(transport: ConnectorBridgeTransport, timer: TimerPort, ids: IdGenerator);
  getConnectionState(): VisualAgentConnectionState;
  connect(profile: VisualAgentProfileV1, signal: AbortSignal): Promise<VisualAgentCapabilitySet>;
  disconnect(): Promise<void>;
  execute(envelope: VisualAgentTaskEnvelopeV1, signal: AbortSignal): Promise<{taskId: string}>;
  cancel(input: {taskId: string; sessionRevision: number}, signal: AbortSignal): Promise<void>;
  resolveApproval(input: {taskId: string; sessionRevision: number; approvalId: string; decision: 'approve' | 'reject'}, signal: AbortSignal): Promise<void>;
  resume(input: {taskId: string; sessionRevision: number; resumeToken: string}, signal: AbortSignal): Promise<void>;
  steer(input: {taskId: string; sessionRevision: number; instruction: string}, signal: AbortSignal): Promise<void>;
  requestPreferences(command: VisualAgentPreferenceCommand, signal: AbortSignal): Promise<unknown>;
  subscribe(listener: (event: VisualAgentTaskEvent) => void): () => void;
}
```

- [ ] **Step 1: Write the failing unified conformance test**

```ts
for (const fixture of [openClawFixture, codexFixture, cursorFixture, dshFixture, hermesFixture]) {
  defineVisualAgentAdapterConformance(fixture, {
    requiredStatuses: ['queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled'],
    negotiatedCapabilities: ['imageInput', 'structuredAction', 'stream', 'cancel', 'approval', 'resume', 'steer', 'preferences'],
  });
}

it('registers exactly the five built-ins and requires conformance for custom ids', () => {
  expect(createBuiltInVisualAgentToolRegistry().list()).toEqual(['openclaw', 'codex', 'cursor', 'dsh', 'hermes']);
  expect(() => registerCustomWithoutConformance('custom:sample')).toThrow('visual_agent_adapter_not_found');
});

it('freezes exact built-in manifest metadata and maximum capability claims', () => {
  expect(builtInRegistry.list().map(id => builtInRegistry.require(id).manifest))
    .toEqual([openClawManifest, codexManifest, cursorManifest, dshManifest, hermesManifest]);
});
```

The shared suite must assert connection transitions, strict capability subset, image consent, structured-action validation, ordered stream events, correlated cancel, approval wait/decision, resume token handling, correlated steer, preference commands, all six run statuses, one terminal state, disconnect rejection, idempotency, sanitized errors and zero fallback calls. For `steer=true`, it sends exactly one `task.steer` with matching task/session and nonblank instruction; for `steer=false`, the same call returns `visual_agent_capability_unsupported` and sends nothing upstream.

- [ ] **Step 2: Write failing mobile bridge and preference tests**

```ts
it('opens only the configured Connector Bridge and never a product upstream', async () => {
  await client.connect(profile, signal);
  expect(transport.open).toHaveBeenCalledWith({
    bridgeUrl: 'https://bridge.example', secretRef: 'visual-agent:bridge', signal,
  });
  expect(JSON.stringify(transport.open.mock.calls)).not.toMatch(/gateway\.example|codex|cursor-agent|dsh|hermes/i);
});

it('fails preference operations when preferences were not negotiated', async () => {
  client.getConnectionState.mockReturnValue({status: 'ready', negotiatedCapabilities: {...allCapabilities, preferences: false}});
  await expect(repository.list()).rejects.toThrow('preference_remote_unavailable');
});
```

- [ ] **Step 3: Write failing Facade and architecture tests**

```ts
it('exposes generic state without upstream details or credentials', async () => {
  const state = await facade.read();
  expect(state).toEqual(expect.objectContaining({
    activeToolId: 'codex',
    activeProfile: expect.objectContaining({profileId: 'codex-main', toolId: 'codex'}),
    canExecute: false,
  }));
  expect(JSON.stringify(state)).not.toMatch(/secretRef|token|command|args|gatewayUrl|raw|stack/i);
});

it('keeps mobile modules away from product transports and bridge adapters', () => {
  for (const {file, text} of mobileFiles) {
    expect({file, text}).not.toEqual(expect.objectContaining({
      text: expect.stringMatching(/child_process|acp_json_rpc|gateway_ws|runs_http_sse|connectorBridge\/visualAgent\/adapters/),
    }));
  }
});

it('keeps legacy OpenClaw migration exclusively in Runtime Task 4B', () => {
  const capabilityProduction = capabilityOwnedProductionFiles
    .map(({text}) => text).join('\n');
  expect(capabilityProduction).not.toMatch(
    /RuntimeConfigMigrationV1|LegacyOpenClawBindingPort|migrateLegacyOpenClawConfig|@nono:openclaw/,
  );
});
```

- [ ] **Step 4: Run tests and verify red**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/connectorBridge/visualAgent/VisualAgentAdapterConformance.test.ts src/__tests__/features/visualAgent/ConnectorBridgeVisualAgentClient.test.ts src/__tests__/features/visualAgent/VisualAgentPreferenceRepository.test.ts src/__tests__/features/visualAgent/VisualAgentFacade.test.ts src/__tests__/architecture/CapabilityDomainBoundaries.test.ts`

Expected: FAIL with missing shared conformance/mobile/barrel modules.

- [ ] **Step 5: Aggregate the frozen conformance runner and implement the built-in registry**

Import the Task 7 runner unchanged; do not duplicate or extend it in Task 12. The aggregate test passes the same fixture shape for every adapter and contains no tool-name behavior branches. A fixture supplies binding, fake upstream, supported capability set and expected mapping. `BuiltInVisualAgentToolRegistry` returns the frozen read-only `VisualAgentToolRegistry` and composes exactly the five fixtures named in the shared gate. Adding `custom:<name>` requires adding its adapter directory, fixture import, shared-suite invocation and registry entry in one change; the architecture test compares these three tool-ID sets and fails on any mismatch. No public `VisualAgentAdapterRegistry` type or mutable register is exported.

- [ ] **Step 6: Implement mobile Connector Bridge proxy**

`ConnectorBridgeTransport.open({bridgeUrl, secretRef, signal})` is the only mobile network seam. It carries `VisualAgentProtocolV1`, never product protocol. `ConnectorBridgeVisualAgentClient` implements the frozen execution port, uses one immutable profile per session, negotiates before execute, rejects pending tasks on disconnect, correlates all task messages, enforces cancel timeout and never chooses another profile. The bridge URL may be HTTPS upgraded by the transport or WSS; product upstream URLs/commands are absent from mobile inputs.

- [ ] **Step 7: Implement generic remote preferences and Facade/ViewState**

`VisualAgentPreferenceRepository` uses only `requestPreferences` after `preferences=true`; it strictly projects preference fields and maps every remote failure to `preference_remote_unavailable`. `VisualAgentFacade.read` must call `VisualAgentProfileController.readActiveProjection`, never reconstruct a legacy profile or read a legacy key. `VisualAgentViewState` exposes `status`、`enabled`、the safe `activeProfile` projection、`activeProfileId`、`activeToolId`、generic `connection`、`negotiatedCapabilities`、`canExecute` and a generic blocker; it excludes bridge URL/secret ref, upstream protocol/config, image, frame and raw error. `VisualAgentFacade.read/setEnabled/setActive/connect/disconnect/execute/cancel/resolveApproval/resume/steer` is a UI-narrow adapter seam over the frozen controller/execution port; it delegates without fallback and is not a second execution contract.

```ts
export interface VisualAgentViewState {
  readonly status: 'loading' | 'ready' | 'error';
  readonly enabled: boolean;
  readonly activeProfile: VisualAgentProfileProjectionV1 | null;
  readonly activeProfileId: string | null;
  readonly activeToolId: VisualAgentToolId | null;
  readonly connection: VisualAgentConnectionState['status'];
  readonly negotiatedCapabilities: VisualAgentCapabilitySet | null;
  readonly canExecute: boolean;
  readonly blocker?: {readonly code: VisualAgentErrorCode; readonly message: string};
}

export class VisualAgentFacade {
  constructor(profiles: VisualAgentProfileController, execution: VisualAgentExecutionPort);
  read(): Promise<VisualAgentViewState>;
  setEnabled(enabled: boolean, expectedRevision: number): Promise<VisualAgentViewState>;
  setActive(profileId: string | null, expectedRevision: number): Promise<VisualAgentViewState>;
  connect(signal: AbortSignal): Promise<VisualAgentViewState>;
  disconnect(): Promise<VisualAgentViewState>;
  execute(envelope: VisualAgentTaskEnvelopeV1, signal: AbortSignal): Promise<{taskId: string}>;
  cancel(input: {taskId: string; sessionRevision: number}, signal: AbortSignal): Promise<void>;
  resolveApproval(input: {taskId: string; sessionRevision: number; approvalId: string; decision: 'approve' | 'reject'}, signal: AbortSignal): Promise<void>;
  resume(input: {taskId: string; sessionRevision: number; resumeToken: string}, signal: AbortSignal): Promise<void>;
  steer(input: {taskId: string; sessionRevision: number; instruction: string}, signal: AbortSignal): Promise<void>;
}
```

- [ ] **Step 8: Finalize public barrels and architecture guard**

```ts
// features/visualAgent/index.ts
export {VisualAgentFacade} from './application/VisualAgentFacade';
export type {VisualAgentViewState} from './application/VisualAgentViewState';
export type {
  VisualAgentToolId,
  VisualAgentProfileV1,
  VisualAgentCapabilitySet,
  VisualAgentToolManifestV1,
  VisualAgentTaskEnvelopeV1,
  VisualAgentConnectionState,
  VisualAgentRunStatus,
  VisualAgentProtocolV1,
  VisualAgentToolAdapter,
  VisualAgentExecutionPort,
  VisualAgentToolRegistry,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
```

Preference/Companion/Errand barrels export only their Facade and ViewState. The Visual Agent barrel re-exports the nine frozen primary contract names exactly once from Runtime Wave 1 Task 4B, plus the supporting `VisualAgentToolManifestV1` / `VisualAgentRunStatus` and its UI-narrow Facade/ViewState; it exports no implementation class, mutable register, transport, binding or conformance fixture. No public `features/openclaw` barrel exists. Architecture guard scans capability-owned core/feature/bridge files for forbidden React Native/domain imports, legacy services, `openClaw` runtime fields, product transport names in mobile code, sensitive Companion fields and Screen imports. It asserts declarations named by the nine primary contracts and the supporting manifest/run-status types exist only under `core/engine/operateRuntime/visualAgent`, while `features/visualAgent/index.ts` contains type-only re-exports; capability-owned files contain no `RuntimeConfigMigrationV1`/`LegacyOpenClawBindingPort` import, `migrateLegacyOpenClawConfig` symbol or `@nono:openclaw` access; adapter dirs are not imported by mobile feature files; adapter directory IDs, manifest IDs, conformance fixture IDs and registry IDs are equal; and no `OpenClawFacade` or `VisualAgentAdapterRegistry` public symbol exists.

- [ ] **Step 9: Run the complete capability-domain and conformance gate**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/core/engine/capabilities src/__tests__/core/engine/preference src/__tests__/core/engine/companion src/__tests__/core/engine/errand src/__tests__/features/visualAgent src/__tests__/connectorBridge/visualAgent src/__tests__/architecture/CapabilityDomainBoundaries.test.ts`

Expected: all listed suites pass, 0 failed; each of the five built-ins runs the same conformance assertions.

- [ ] **Step 10: Run repository-wide static and Jest gates**

Run: `cd AwesomeProject && npx tsc --noEmit`

Expected: exit 0 with no diagnostics.

Run: `cd AwesomeProject && npm test -- --runInBand`

Expected: all suites pass, 0 failed. Any pre-recorded Wave 0 environment waiver must be copied verbatim into the handoff; do not alter test configuration.

- [ ] **Step 11: Prove forbidden hotspots were untouched**

```bash
git diff --name-only codex/checkpoint-v1-wave1...HEAD -- \
  AwesomeProject/src/features/task/screens/HomeScreen.tsx \
  AwesomeProject/src/features/task/hooks/useTaskExecution.ts \
  AwesomeProject/src/features/task/useTaskExecutionWithBackground.ts \
  AwesomeProject/src/features/task/services/TaskExecutionHeadless.ts \
  AwesomeProject/src/core/engine/taskEngine/task/TaskExecutionEngine.ts \
  AwesomeProject/src/features/model/services/ModelService.ts \
  AwesomeProject/src/features/capability/services/NonoConfigService.ts \
  AwesomeProject/src/shared/utils/storage.ts \
  AwesomeProject/src/navigation/AppNavigator.tsx \
  AwesomeProject/android/app/src/main/java \
  AwesomeProject/ios/AwesomeProject
```

Expected: no output. The checkpoint must be an ancestor; stop if ancestry fails.

- [ ] **Step 12: Commit integration gate and public surfaces**

```bash
git add AwesomeProject/src/connectorBridge/visualAgent/BuiltInVisualAgentToolRegistry.ts AwesomeProject/src/features/visualAgent AwesomeProject/src/features/preference/index.ts AwesomeProject/src/features/companion/index.ts AwesomeProject/src/features/errand/index.ts AwesomeProject/src/__tests__/connectorBridge/visualAgent/VisualAgentAdapterConformance.test.ts AwesomeProject/src/__tests__/features/visualAgent/ConnectorBridgeVisualAgentClient.test.ts AwesomeProject/src/__tests__/features/visualAgent/VisualAgentPreferenceRepository.test.ts AwesomeProject/src/__tests__/features/visualAgent/VisualAgentFacade.test.ts AwesomeProject/src/__tests__/architecture/CapabilityDomainBoundaries.test.ts
git commit -m "test: enforce visual agent adapter conformance"
```

## Final Acceptance Matrix

| Requirement | Owning Task | Automated evidence |
| --- | --- | --- |
| Companion safe dialogue and explicit confirmation | 3–4 | service/facade tests |
| Preference independent storage and fail-closed remote policy | 2, 12 | repository/policy/remote tests |
| Deterministic errand time and atomic lease | 5–6 | parser/repository/sweep tests |
| Nine named Visual Agent contracts owned/frozen once | Runtime Wave 1 Task 4B; verified by 7 | canonical compile/runtime tests |
| Six required run states and strict terminal correlation | 7, 12 | codec and shared conformance tests |
| Eight capability flags, including steer, negotiated and unsupported fails closed | 7, 9–12 | adapter tests and shared conformance gate |
| Mobile connects only Connector Bridge/Orchestrator | 12 | bridge client and architecture tests |
| OpenClaw Gateway WS mapping | 9 | OpenClaw adapter tests |
| Codex CLI/App Server JSON-RPC mapping | 10 | Codex adapter tests |
| Cursor CLI/ACP/Cloud HTTP mapping | 10 | Cursor adapter tests |
| DSH conservative CLI/custom bridge mapping | 11 | DSH identity/default-disable tests |
| Hermes ACP/JSON-RPC/HTTP-SSE mapping | 11 | Hermes adapter tests |
| All five built-ins and custom adapters share one contract/gate | 12 | registry and conformance test |
| Runtime config, memory, errors, dirs and barrel are generic | 1–2, 7–8, 12 | controller/projection/architecture tests |
| Legacy OpenClaw has one migration owner and a sanitized capability projection | Runtime Wave 1 Task 4B; verified by 8, 12 | runtime migration gate plus read-only projection/boundary tests |
| No silent tool/protocol/local fallback | 6, 9–12 | call-count and unsupported-capability assertions |

## Explicit Non-Goals

- 不在移动端实现或启动任何产品 CLI、ACP server、JSON-RPC upstream、OpenClaw Gateway client、Hermes Runs client 或 Cursor Cloud client；真实 upstream transport 属于 Connector Bridge deployment composition。
- 不承诺 Codex App Server WebSocket 可用于生产，不把 Codex/Cursor/Hermes MCP endpoint 描述为完整远控协议。
- 不承诺 DSH 的第三方移动接入稳定；在 DeepSeek Harness developer-preview binding 未通过 conformance 前保持禁用，也不把名称相近产品自动认作 `dsh`。
- 不承诺五个工具都支持全部八项 capability；profile 只能请求 adapter 实际报告并由 fixture 证明的子集。
- 不承诺取消是进程终止、恢复跨版本稳定、审批可自动处理、结构化 action 可从自然语言可靠推断或 image input 一定可用。
- 不实现 Screen 接线、导航改名、UI 文案迁移、真实 Connector Bridge 部署、上游凭据 provisioning、监控、重试调度或多租户隔离。
- 不删除 legacy storage；迁移成功前保留可恢复数据与 opaque secret refs。
- 不在 capability wave 重建、包装或调用 legacy migration；`RuntimeConfigMigrationV1`/`LegacyOpenClawBindingPort` 的实现、事务、重试、marker 与 scrub 全部留在 Runtime Wave 1 Task 4B。
- 不让 Companion 直接执行手机操作，不让 Errand sweep 自行选择 local/tool/protocol，也不在失败时缓存远程 Preference 到设备。

## Execution Handoff

Task 1 先串行建立共享 checkpoint。随后三条无重叠工作线并行：Agent A 顺序执行 Tasks 2→3→4；Agent B 顺序执行 Tasks 5→6（Task 5 只依赖 Task 1，不等待 Task 2）；Agent C 顺序执行 Tasks 7→8。三线集成并通过 core gate 后，Tasks 9–11 才能在同一 Task 8/integration checkpoint 上启动三个并发 worker，严格遵守 Built-In Adapter Wave 文件边界；integration owner 按 A、B、C 顺序 cherry-pick，任何顺序都不得产生文件冲突。Task 12 最后执行并是唯一 conformance、registry、mobile bridge、barrel 与 architecture owner。

UI integration handoff must state exactly:

```text
HomeScreen: consume CompanionFacade; an intent='operate' turn starts the existing single OperateFacade only after explicit user action.
PrivacyScreen: consume PreferenceFacade; memoryLocation is device or visual_agent and remote memory requires the selected profile's negotiated preferences capability.
Visual Agent settings: consume VisualAgentFacade as a UI-narrow seam; show generic tool/profile/capabilities and never expose upstream protocol, command, endpoint credential, secretRef, raw frame, image, or stack.
ErrandsScreen/ErrandDetailScreen: consume ErrandFacade; the single lifecycle owner invokes one ErrandDueSweep.
Mobile networking: ConnectorBridgeVisualAgentClient is the only VisualAgentExecutionPort bound in the app; product adapters are composed only in Connector Bridge/Orchestrator.
Task snapshot: freeze profileId, toolId, requested and negotiated capabilities, taskId, sessionRevision, and idempotencyKey; never switch profile or protocol mid-task.
Failure behavior: unsupported capability including steer, disconnect, cancel timeout, approval mismatch, resume rejection, and remote preference failure are visible blocked/failed states with zero fallback calls.
Legacy OpenClaw: Runtime Wave 1 Task 4B alone migrates to toolId=openclaw/profileId=legacy-openclaw; capability/UI consume only the current-schema safe projection and keep no migration function, legacy-key read, second OpenClaw runtime, OpenClawFacade, or public barrel.
```
