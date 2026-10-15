# V1 Capability Domains and Visual Agent Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 V1 `9ff7ba4cc4dc186b79b6e62181333ae6c9132f54` 上新增可独立测试的 Companion、Preference、Errand 与 Visual Agent Tool 领域闭环；冻结一套与具体产品无关的协议、profile、capability、registry、adapter 与 execution port；内置 `openclaw`、`codex`、`cursor`、`dsh`、`hermes` 五个 adapter，并只向后续 UI 集成 wave 暴露稳定的 Facade/ViewState。

**Architecture:** Preference、Companion、Errand 领域位于 `src/core/engine/{preference,companion,errand}`；九项 Visual Agent canonical contracts、`RuntimeConfigMigrationV1` 与 `LegacyOpenClawBindingPort` 只由 Runtime Wave 1 Task 4B 产出。Capability wave 只 import/verify/re-export canonical declarations、读取已迁移 current-schema envelope，并在 `src/features/visualAgent` 建 UI-narrow seam，在 `src/connectorBridge/visualAgent` 建 bridge adapter；不得创建第二套 Visual Agent domain contracts 或 migration owner。移动端唯一外部执行入口是 `ConnectorBridgeVisualAgentClient`，它只连接 Connector Bridge/Orchestrator。上游产品协议终止在 bridge adapters：OpenClaw 映射 Gateway WebSocket；Codex 映射 CLI JSONL 或 App Server JSON-RPC/stdio；Cursor 映射 headless CLI NDJSON、ACP JSON-RPC/stdio 或 Cloud Agents HTTP；DSH 映射受控 CLI/custom bridge；Hermes 映射 ACP、TUI Gateway JSON-RPC 或 Runs HTTP+SSE。

**Tech Stack:** React Native 0.73.6、TypeScript 5.0.4、Jest 29.6.3、AsyncStorage 1.21.0、React Native 全局 WebSocket/HTTP、Wave 1 `CredentialStore`；Connector Bridge adapter 使用平台中立 TypeScript port，真实子进程、ACP、JSON-RPC、HTTP/SSE transport 由 bridge composition root 注入。

## Global Constraints

- 唯一代码基线是 V1 提交 `9ff7ba4cc4dc186b79b6e62181333ae6c9132f54`。开始执行前必须从已通过 Wave 0/1 gate 的 integration checkpoint 新建 worktree，不能整分支 merge 历史实验分支。
- 本计划依赖 Wave 1 `CredentialStore`：`isAvailable()`、`put(secretRef, plaintext)`、`get(secretRef)`、`delete(secretRef)`。凭据只能通过 opaque `secretRef` 解析，不得复制 CredentialStore 或新增明文配置 key。
- Wave 1 `RuntimeConfigEnvelopeV1` 的权威形状仍是 `{schemaVersion: 1, revision, active, draft}`。本计划把 capability adapter 看到的投影升级为本文冻结的 `CapabilityConfigSnapshot`；production adapter 仍只能使用一次 `compareAndActivate` 完成 CAS，必须保留所有无关 route 字段。
- Runtime Wave 1 Task 4B 独占 legacy OpenClaw 读取、binding stage/commit/rollback、credential verification、migration marker、重试和 scrub。Capability wave 只能读取其 current-schema output；任何 production/test file 都不得重新声明或调用 migration/binding port。
- 本计划不修改现有 Screen、`HomeScreen.tsx`、`useTaskExecution.ts`、`TaskExecutionHeadless.ts`、`TaskExecutionEngine.ts`、`ModelService.ts`、`NonoConfigService.ts`、`shared/utils/storage.ts`、`AppNavigator.tsx` 或 Android/iOS 注册文件。
- Domain 文件不得 import `react`、`react-native`、AsyncStorage、全局 WebSocket、Node child process、ACP/JSON-RPC client 或产品 SDK。时间、ID、定时器、存储、模型、bridge 与上游 transport 均通过 port 注入。
- 移动端只允许连接 Connector Bridge/Orchestrator。禁止在移动端直接启动 `codex`、`cursor-agent`、`dsh`、`hermes` 子进程，禁止直接连接 OpenClaw Gateway，也禁止把 ACP/MCP 当作移动端远控 transport。
- MCP 只按各产品官方边界使用：它是工具扩展或受限消息入口，不等同于通用 task lifecycle、视觉结果流、取消、审批或恢复协议。没有通过本文 conformance suite 的 MCP/custom bridge 不能注册为 Visual Agent adapter。
- `dsh` 在本文中是冻结的产品 ID，但当前实现目标按最可能的 DeepSeek Harness 处理。由于其公开外部控制协议仍可能变化，`dsh` adapter 默认禁用，只有其 CLI/custom bridge fixture 通过同一 conformance gate 后才能启用；不得把 Dify 或其他同名工具静默映射到 `dsh`。
- 所有 adapter 必须显式协商 `imageInput`、`structuredAction`、`stream`、`cancel`、`approval`、`resume`、`steer`、`preferences`。请求为 `true` 而 adapter/会话返回 `false` 时必须在启动前抛 `visual_agent_capability_unsupported`，不得删除字段、转文本、切换工具或本地执行。
- Visual Agent 运行状态至少为 `queued | running | waiting_approval | completed | failed | cancelled`。`completed`、`failed`、`cancelled` 是互斥终态；乱序、重复终态或 task/session 不匹配均为 `visual_agent_protocol_error`。
- 图片必须同时满足 profile 协商支持、任务声明需要图片、用户对该任务显式确认。否则返回 `privacy_blocked` 或 `visual_agent_capability_unsupported`，不能把截图改成 OCR 文本后继续。
- 取消必须关联 `taskId + sessionRevision` 并等待对应终态或确定性超时；不支持取消、取消超时或断线都不得启动另一条执行路径。
- 审批状态必须显式进入 `waiting_approval`；只接受同一 task/session/approvalId 的一次决议。没有 `approval` capability 时遇到审批请求必须失败，不能自动批准。
- 恢复必须使用 adapter 返回的 opaque `resumeToken` 且要求 `resume=true`；不支持时失败关闭。token 不得进入日志、ViewState 或诊断导出。
- Steer 必须要求 `steer=true`，携带同一 `taskId + sessionRevision` 与非空 instruction；不支持时显式返回 `visual_agent_capability_unsupported`，错配时返回 `visual_agent_protocol_error`，不得转成新任务或静默忽略。
- Preference 与 Errand 使用独立 repository、存储 key 与生命周期。迁移可读旧 `@nono:memories`，不能生成 seed，不能提前删除旧 key。
- `memoryEnabled=false` 时 Companion 不召回偏好且拒绝新增偏好；`memoryLocation='visual_agent'` 且选中 profile 不可用、未协商 `preferences` 或远程失败时返回 `preference_remote_unavailable`，不得写回设备。
- Companion 只携带当前文本、最小对话摘要和已确认偏好摘要；不得携带截图、操作历史、原始模型响应、API key、`secretRef` 或设备动作 port。
- Errand 时间使用 epoch milliseconds 和显式 `timeZoneOffsetMinutes`；`claimDue` 在同一串行事务写 lease；完成/失败校验 `leaseId`。
- 所有公开错误只暴露稳定 generic code，不拼接上游帧、命令行、路径、token、图片、Error 或 stack。产品原始错误只能在 bridge 内部映射后丢弃。
- 每个 Task 严格执行 red → green → targeted tests → `npx tsc --noEmit`；禁止用 `as any`、忽略目录或放宽 Jest/TypeScript 配置制造绿色。
- 每个 Task 只提交自己 `Files` 中列出的文件。本文中的 commit 是未来实施步骤；编写本计划时不执行提交。

---

## Delivery Boundary and Exact File Map

本计划只创建下列文件。移动端公共 barrel 只有 `features/preference`、`features/companion`、`features/errand`、`features/visualAgent`；adapter 目录属于 Connector Bridge，不得被 Screen 或移动端 feature import。

Runtime Wave 1 Task 4B is the prerequisite and sole owner of `AwesomeProject/src/core/engine/operateRuntime/visualAgent/VisualAgentContracts.ts`、`VisualAgentToolRegistry.ts`、`AwesomeProject/src/core/engine/operateRuntime/config/RuntimeConfigMigrationV1.ts` and `LegacyOpenClawBindingPort.ts`. `VisualAgentContracts.ts` declares all nine frozen names, including `VisualAgentExecutionPort`; `VisualAgentToolRegistry.ts` contains only the immutable constructor over those interfaces. All four files are intentionally absent from this capability-wave file map: this plan consumes their current-schema output byte-for-byte and must stop if the checkpoint does not expose all nine frozen names or the migrated profile boundary below.

```text
AwesomeProject/src/core/engine/capabilities/shared/
  CapabilityError.ts
  CapabilityPorts.ts
  CapabilityPrivacy.ts

AwesomeProject/src/core/engine/preference/
  domain/Preference.ts
  ports/PreferenceRepository.ts
AwesomeProject/src/features/preference/
  data/AsyncStoragePreferenceRepository.ts
  data/PolicyAwarePreferenceRepository.ts
  application/PreferenceFacade.ts
  index.ts

AwesomeProject/src/core/engine/companion/
  domain/CompanionTypes.ts
  ports/CompanionModelPort.ts
  application/CompanionService.ts
AwesomeProject/src/features/companion/
  application/CompanionViewState.ts
  application/CompanionFacade.ts
  index.ts

AwesomeProject/src/core/engine/errand/
  domain/Errand.ts
  domain/parseErrandTime.ts
  ports/ErrandRepository.ts
  application/ErrandDueSweep.ts
AwesomeProject/src/features/errand/
  data/AsyncStorageErrandRepository.ts
  application/ErrandsViewState.ts
  application/ErrandFacade.ts
  index.ts

AwesomeProject/src/connectorBridge/visualAgent/
  ports/VisualAgentUpstreamPort.ts
  protocol/VisualAgentProtocolCodec.ts
  adapters/openclaw/OpenClawAdapter.ts
  adapters/openclaw/OpenClawBinding.ts
  adapters/openclaw/conformanceFixture.ts
  adapters/codex/CodexAdapter.ts
  adapters/codex/CodexBinding.ts
  adapters/codex/conformanceFixture.ts
  adapters/cursor/CursorAdapter.ts
  adapters/cursor/CursorBinding.ts
  adapters/cursor/conformanceFixture.ts
  adapters/dsh/DshAdapter.ts
  adapters/dsh/DshBinding.ts
  adapters/dsh/conformanceFixture.ts
  adapters/hermes/HermesAdapter.ts
  adapters/hermes/HermesBinding.ts
  adapters/hermes/conformanceFixture.ts
  conformance/VisualAgentAdapterConformance.ts
  BuiltInVisualAgentToolRegistry.ts

AwesomeProject/src/features/visualAgent/
  data/ConnectorBridgeTransport.ts
  data/ConnectorBridgeVisualAgentClient.ts
  data/VisualAgentPreferenceRepository.ts
  application/VisualAgentProfileController.ts
  application/VisualAgentViewState.ts
  application/VisualAgentFacade.ts
  index.ts

AwesomeProject/src/__tests__/core/engine/capabilities/CapabilityPrivacy.test.ts
AwesomeProject/src/__tests__/core/engine/preference/AsyncStoragePreferenceRepository.test.ts
AwesomeProject/src/__tests__/core/engine/preference/PolicyAwarePreferenceRepository.test.ts
AwesomeProject/src/__tests__/core/engine/companion/CompanionService.test.ts
AwesomeProject/src/__tests__/core/engine/companion/CompanionFacade.test.ts
AwesomeProject/src/__tests__/core/engine/errand/parseErrandTime.test.ts
AwesomeProject/src/__tests__/core/engine/errand/AsyncStorageErrandRepository.test.ts
AwesomeProject/src/__tests__/core/engine/errand/ErrandDueSweep.test.ts
AwesomeProject/src/__tests__/core/engine/errand/ErrandFacade.test.ts
AwesomeProject/src/__tests__/connectorBridge/visualAgent/VisualAgentCanonicalContracts.test.ts
AwesomeProject/src/__tests__/connectorBridge/visualAgent/VisualAgentProtocolCodec.test.ts
AwesomeProject/src/__tests__/features/visualAgent/VisualAgentProfileController.test.ts
AwesomeProject/src/__tests__/features/visualAgent/LegacyOpenClawProjection.test.ts
AwesomeProject/src/__tests__/connectorBridge/visualAgent/openclaw/OpenClawAdapter.test.ts
AwesomeProject/src/__tests__/connectorBridge/visualAgent/codex/CodexAdapter.test.ts
AwesomeProject/src/__tests__/connectorBridge/visualAgent/cursor/CursorAdapter.test.ts
AwesomeProject/src/__tests__/connectorBridge/visualAgent/dsh/DshAdapter.test.ts
AwesomeProject/src/__tests__/connectorBridge/visualAgent/hermes/HermesAdapter.test.ts
AwesomeProject/src/__tests__/connectorBridge/visualAgent/VisualAgentAdapterConformance.test.ts
AwesomeProject/src/__tests__/features/visualAgent/ConnectorBridgeVisualAgentClient.test.ts
AwesomeProject/src/__tests__/features/visualAgent/VisualAgentPreferenceRepository.test.ts
AwesomeProject/src/__tests__/features/visualAgent/VisualAgentFacade.test.ts
AwesomeProject/src/__tests__/architecture/CapabilityDomainBoundaries.test.ts
```

## Frozen Cross-Task Contracts

以下九项类型名、字段名与语义由 Runtime Wave 1 Task 4B 原样声明并在其 checkpoint 冻结：`VisualAgentToolId`、`VisualAgentProfileV1`、`VisualAgentCapabilitySet`、`VisualAgentToolAdapter`、`VisualAgentToolRegistry`、`VisualAgentProtocolV1`、`VisualAgentTaskEnvelopeV1`、`VisualAgentConnectionState`、`VisualAgentExecutionPort`。它们直接引用的 `VisualAgentToolManifestV1`、`VisualAgentRunStatus`、`VisualAgentErrorCode`、event/result/preference JSON supporting types 也由同一 `VisualAgentContracts.ts` 持有。本节代码是跨文档 acceptance excerpt，不是 capability wave 的新声明；注释标出的 bridge/config narrow seams 才由本计划创建。Tasks 7–12 必须从 `@core/engine/operateRuntime/visualAgent/*` import；若 Wave 1 形状不兼容，停止并先修正 Task 4B/checkpoint，禁止在 feature、bridge、barrel 或 test 中创建 alias/兼容副本。

```ts
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
  | {readonly status: 'ready'; readonly negotiatedCapabilities: VisualAgentCapabilitySet}
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
  | {readonly type: 'upsert'; readonly preference: {readonly id: string; readonly kind: 'name' | 'preference'; readonly title: string; readonly summary: string}}
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
  | {readonly type: 'list'; readonly preferences: readonly VisualAgentPreferenceRecord[]}
  | {readonly type: 'upsert'; readonly preference: VisualAgentPreferenceRecord}
  | {readonly type: 'delete'; readonly preferenceId: string}
  | {readonly type: 'clear'};

export type VisualAgentTaskEvent =
  | {readonly type: 'status'; readonly taskId: string; readonly sessionRevision: number; readonly sequence: number; readonly status: 'queued' | 'running'}
  | {readonly type: 'status'; readonly taskId: string; readonly sessionRevision: number; readonly sequence: number; readonly status: 'waiting_approval'; readonly approvalId: string}
  | {readonly type: 'delta'; readonly taskId: string; readonly sessionRevision: number; readonly sequence: number; readonly textDelta?: string; readonly visualUnderstandingDelta?: string; readonly structuredAction?: VisualAgentStructuredAction}
  | {readonly type: 'terminal'; readonly taskId: string; readonly sessionRevision: number; readonly sequence: number; readonly status: 'completed'; readonly result: VisualAgentResultV1}
  | {readonly type: 'terminal'; readonly taskId: string; readonly sessionRevision: number; readonly sequence: number; readonly status: 'failed'; readonly errorCode: VisualAgentErrorCode; readonly resumeToken?: string}
  | {readonly type: 'terminal'; readonly taskId: string; readonly sessionRevision: number; readonly sequence: number; readonly status: 'cancelled'; readonly resumeToken?: string};

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

export interface VisualAgentToolAdapter {
  readonly toolId: VisualAgentToolId;
  readonly manifest: VisualAgentToolManifestV1;
  create(profile: VisualAgentProfileV1): VisualAgentExecutionPort;
}

export interface VisualAgentToolRegistry {
  require(toolId: VisualAgentToolId): VisualAgentToolAdapter;
  list(): readonly VisualAgentToolId[];
}

// Capability-wave bridge-only seam; not a second runtime Visual Agent contract.
export type VisualAgentUpstreamProtocol =
  | 'gateway_ws'
  | 'cli_exec_jsonl'
  | 'agent_cli_ndjson'
  | 'acp_json_rpc_stdio'
  | 'app_server_json_rpc_stdio'
  | 'gateway_json_rpc_stdio'
  | 'gateway_json_rpc_ws'
  | 'cloud_agents_http'
  | 'runs_http_sse'
  | 'dsh_cli'
  | 'custom_bridge';

export interface VisualAgentUpstreamSession {
  negotiate(requested: VisualAgentCapabilitySet): Promise<VisualAgentCapabilitySet>;
  send(message: unknown): Promise<void>;
  subscribe(listener: (message: unknown) => void): () => void;
  close(): Promise<void>;
}

export interface VisualAgentUpstreamPort {
  open(input: {
    protocol: VisualAgentUpstreamProtocol;
    binding: Readonly<Record<string, unknown>>;
    signal: AbortSignal;
  }): Promise<VisualAgentUpstreamSession>;
}

export interface VisualAgentBindingPort {
  read(bindingId: string, toolId: VisualAgentToolId): Promise<unknown>;
}

// Capability-wave narrow runtime projection; not a second runtime store.
export interface CapabilityConfigSnapshot {
  readonly revision: number;
  readonly capabilities: {readonly errands: boolean};
  readonly privacy: {
    readonly memoryEnabled: boolean;
    readonly memoryLocation: 'device' | 'visual_agent';
    readonly memoryProfileId: string | null;
  };
  readonly visualAgent: {
    readonly enabled: boolean;
    readonly activeProfileId: string | null;
    readonly profiles: readonly VisualAgentProfileV1[];
  };
}

export interface CapabilityConfigPort {
  read(): Promise<CapabilityConfigSnapshot>;
  compareAndSet(
    expectedRevision: number,
    next: Omit<CapabilityConfigSnapshot, 'revision'>,
  ): Promise<CapabilityConfigSnapshot>;
}
```

`VisualAgentProtocolV1` 是 Task 7 冻结的 client/server message union，所有消息固定 `version: 1`、`requestId`，任务消息固定 `taskId + sessionRevision`。`createVisualAgentToolRegistry(adapters)` 对重复 ID 抛 `visual_agent_adapter_duplicate`，返回的 `VisualAgentToolRegistry` 是只读 lookup/list contract；未知 ID 抛 `visual_agent_adapter_not_found`。非内置工具必须使用 `custom:` 前缀并先加入统一 conformance suite，公共 barrel 不导出可绕过 gate 的 mutable register。

`CapabilityConfigPort.read()` 投影 `envelope.active`；`compareAndSet(expectedRevision,next)` 只调用一次 `RuntimeConfigRepository.compareAndActivate`，原样保留 `capabilities.phoneOperate`、完整 `modelAPI.agentConfig/profiles/bindings` 与其他无关字段。该投影只写 `visualAgent={enabled,activeProfileId,profiles}` 与本任务明确修改的 privacy/errand 字段，不再创建 `openClaw`。旧 `openClaw` 只允许存在于 Runtime Wave 1 Task 4B 的 migration input，永不进入 `CapabilityConfigPort`。

## Product-Specific Adapter Mapping

| Tool ID | Bridge-side accepted upstream | Explicit limitation |
| --- | --- | --- |
| `openclaw` | `gateway_ws` | 只有 adapter 可连 Gateway；移动端不直连；Gateway capability 未声明的功能不得模拟 |
| `codex` | `cli_exec_jsonl`、`app_server_json_rpc_stdio` | App Server WebSocket 仍视为实验能力；`codex mcp-server` 不作为完整 task lifecycle transport |
| `cursor` | `agent_cli_ndjson`、`acp_json_rpc_stdio`、`cloud_agents_http` | ACP 是 stdio；Cloud API 与本地 CLI profile 不混用；MCP 是 Cursor 消费工具的入口，不是 Cursor 远控 API |
| `dsh` | `dsh_cli`、`custom_bridge` | 默认禁用；DeepSeek Harness 仍属 developer preview，只有实测 fixture 通过 conformance 后启用 |
| `hermes` | `acp_json_rpc_stdio`、`gateway_json_rpc_stdio`、`gateway_json_rpc_ws`、`runs_http_sse` | `hermes mcp serve` 仅受限消息桥，不作为完整 task lifecycle transport |

每个 profile 只选择一个 upstream mode。adapter 禁止在同一任务失败后从 CLI 切 ACP、从本地切云端或从结构化动作切纯文本。选择是 bridge binding 的部署配置，不是移动端运行时猜测。

## Legacy OpenClaw Projection Boundary

- Runtime Wave 1 Task 4B 的 `RuntimeConfigMigrationV1` 与 `LegacyOpenClawBindingPort` 是 legacy OpenClaw migration 的唯一 owner；本 capability wave 不声明、不注入、不调用、不包装 migration 或 binding port。
- Capability code 只消费 `RuntimeConfigRepository.load()` 返回的 current-schema envelope。`VisualAgentProfileController` 不读取 `@nono:openclaw`、legacy capability/privacy keys 或 migration marker，也不 import `RuntimeConfigMigrationV1`。
- Task 4B 已迁移的 deterministic profile 是 `profileId='legacy-openclaw'`、`toolId='openclaw'`、Connector Bridge binding ref；capability projection 只能显示这些 generic identity/ref 字段，不能重新暴露 `gatewayUrl`、`deviceId`、`cluster`、`openClaw` 或 upstream secret metadata。
- Runtime Task 4B 负责 legacy `memoryLocation='openclaw'` 到 `memoryLocation='visual_agent'`/`memoryProfileId='legacy-openclaw'`、旧错误到 generic Visual Agent error、credential/binding stage/commit/rollback、marker 与 legacy-key scrub。Capability tests 只验证其完成态投影，不复测迁移算法或重试语义。
- Migration 完成后 capability runtime、memory、errors、目录和 barrel 全部使用 Visual Agent 名称；不保留 `features/openclaw`、`core/engine/openclaw`、capability migration file 或 legacy port alias。旧 Screen 接线留给 UI integration wave 原子更新。

### Task 1: Shared Capability Ports and Privacy Projection

**Files:**

- Create: `AwesomeProject/src/core/engine/capabilities/shared/CapabilityError.ts`
- Create: `AwesomeProject/src/core/engine/capabilities/shared/CapabilityPorts.ts`
- Create: `AwesomeProject/src/core/engine/capabilities/shared/CapabilityPrivacy.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/capabilities/CapabilityPrivacy.test.ts`

**Interfaces:**

- Consumes: no production dependency.
- Produces: `CapabilityError`、`CapabilityErrorCode`、`Clock`、`IdGenerator`、`TimerPort`、`CapabilityConfigPort`、`projectCompanionRequest`、`assertVisualAgentImageConsent`、`assertNoForbiddenKeys`。

- [ ] **Step 1: Write the failing privacy and generic-error tests**

```ts
it('requires enabled profile, image capability, and per-task consent', () => {
  expect(() => assertVisualAgentImageConsent({
    profileEnabled: true,
    imageInputNegotiated: false,
    sharingConfirmed: true,
  })).toThrow('visual_agent_capability_unsupported');
  expect(() => assertVisualAgentImageConsent({
    profileEnabled: true,
    imageInputNegotiated: true,
    sharingConfirmed: false,
  })).toThrow('privacy_blocked');
});

it('projects no image, credential, or action history into Companion', () => {
  const safe = projectCompanionRequest({
    conversationId: 'c1', text: '附近的咖啡店', recentReplies: ['你好'],
    confirmedPreferenceSummaries: ['少糖'],
    untrusted: {imageBase64: 'raw', secretRef: 'ref', actionHistory: ['tap']},
  });
  expect(safe).toEqual({conversationId: 'c1', text: '附近的咖啡店', recentReplies: ['你好'], confirmedPreferenceSummaries: ['少糖']});
  expect(JSON.stringify(safe)).not.toMatch(/image|secretRef|actionHistory/i);
});
```

- [ ] **Step 2: Run the test and verify red**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/core/engine/capabilities/CapabilityPrivacy.test.ts`

Expected: FAIL with missing shared capability modules.

- [ ] **Step 3: Implement exact generic error codes and ports**

`CapabilityErrorCode` must be `VisualAgentErrorCode |` the existing preference/errand/privacy codes; import `VisualAgentErrorCode` from Runtime Wave 1 Task 4B rather than duplicating its literals. It must not include any new `openclaw_*` code. Implement `CapabilityConfigSnapshot` exactly as Frozen Cross-Task Contracts.

- [ ] **Step 4: Run targeted tests and type checking**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/core/engine/capabilities/CapabilityPrivacy.test.ts && npx tsc --noEmit`

Expected: `1 passed`; all assertions pass; TypeScript exits 0.

- [ ] **Step 5: Commit shared contracts**

```bash
git add AwesomeProject/src/core/engine/capabilities/shared AwesomeProject/src/__tests__/core/engine/capabilities/CapabilityPrivacy.test.ts
git commit -m "feat: add generic capability contracts"
```

### Task 2: Preference Repository, Device Persistence, and Visual-Agent Policy Routing

**Files:**

- Create: `AwesomeProject/src/core/engine/preference/domain/Preference.ts`
- Create: `AwesomeProject/src/core/engine/preference/ports/PreferenceRepository.ts`
- Create: `AwesomeProject/src/features/preference/data/AsyncStoragePreferenceRepository.ts`
- Create: `AwesomeProject/src/features/preference/data/PolicyAwarePreferenceRepository.ts`
- Create: `AwesomeProject/src/features/preference/application/PreferenceFacade.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/preference/AsyncStoragePreferenceRepository.test.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/preference/PolicyAwarePreferenceRepository.test.ts`

**Interfaces:**

- Consumes: `Clock`、`IdGenerator`、`CapabilityConfigPort`、injected `AsyncStorageLike` 与可选的 remote `PreferenceRepository` port。Task 2 的测试注入 fake，因此不依赖后续 Task 12；Task 12 只在最终 composition 时提供生产 `VisualAgentPreferenceRepository`。
- Produces: `Preference`、`ConfirmedPreferenceDraft`、`PreferenceRepository`、device/policy repositories、`PreferenceFacade.read/setMemoryEnabled/setMemoryLocation/forgetAllPreferences`。

- [ ] **Step 1: Write failing repository and policy tests**

```ts
it('serializes writes and migrates only legacy name/preference records', async () => {
  const repository = new AsyncStoragePreferenceRepository(storage, clock, ids);
  await Promise.all([
    repository.upsertConfirmed({kind: 'preference', title: '咖啡', summary: '少糖'}),
    repository.upsertConfirmed({kind: 'preference', title: '奶茶', summary: '热饮'}),
  ]);
  await expect(repository.list()).resolves.toHaveLength(2);
  expect(storage.setItem).not.toHaveBeenCalledWith('@nono:memories', expect.anything());
});

it('fails closed when selected Visual Agent preferences are unavailable', async () => {
  remote.list.mockRejectedValueOnce(new Error('visual_agent_disconnected'));
  config.read.mockResolvedValue({
    privacy: {memoryEnabled: true, memoryLocation: 'visual_agent', memoryProfileId: 'p1'},
  });
  await expect(repository.list()).rejects.toThrow('preference_remote_unavailable');
  expect(local.list).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests and verify red**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/core/engine/preference`

Expected: FAIL with missing preference modules.

- [ ] **Step 3: Implement exact contracts and routing**

`PreferenceRepository` exposes `list/upsertConfirmed/delete/forgetAll`. Device key is `@nono:preferences:v1`, envelope `{version: 1, items}` and every mutation uses one promise-tail critical section. Corrupt data throws `repository_corrupt`. Policy reads config before each operation: disabled memory returns `[]` for list and rejects mutation; `device` selects local; `visual_agent` requires `visualAgent.enabled=true`, non-null `memoryProfileId`, matching enabled profile and remote availability, with no fallback. `PrivacyViewState.memoryLocation` is `'device' | 'visual_agent'`; it exposes `memoryProfileId` and `canUseVisualAgentMemory`, never tool credentials or raw errors.

- [ ] **Step 4: Run targeted tests and type checking**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/core/engine/preference && npx tsc --noEmit`

Expected: `2 passed`; all assertions pass; TypeScript exits 0.

- [ ] **Step 5: Commit preference domain**

```bash
git add AwesomeProject/src/core/engine/preference AwesomeProject/src/features/preference AwesomeProject/src/__tests__/core/engine/preference
git commit -m "feat: add visual agent preference routing"
```

### Task 3: Companion Dialogue, Intent, and Proposal Confirmation

**Files:**

- Create: `AwesomeProject/src/core/engine/companion/domain/CompanionTypes.ts`
- Create: `AwesomeProject/src/core/engine/companion/ports/CompanionModelPort.ts`
- Create: `AwesomeProject/src/core/engine/companion/application/CompanionService.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/companion/CompanionService.test.ts`

**Interfaces:**

- Consumes: `Clock`、`IdGenerator`、`PreferenceRepository`、`projectCompanionRequest`、`CompanionModelPort.complete`。
- Produces: `CompanionIntent`、`CompanionProposal`、`CompanionTurn`、`ConfirmedCompanionAction`、`CompanionService.submit/confirm/dismiss`。`operate` is an intent, not a persisted proposal.

- [ ] **Step 1: Write failing safe-request and one-time-confirm tests**

```ts
it('does not persist while submitting and confirms once', async () => {
  const turn = await service.submit({conversationId: 'c1', text: '以后咖啡少糖', recentReplies: []});
  expect(preferences.upsertConfirmed).not.toHaveBeenCalled();
  await expect(service.confirm(turn.proposal!.id)).resolves.toEqual({kind: 'preference', title: '咖啡', summary: '少糖'});
  await expect(service.confirm(turn.proposal!.id)).rejects.toThrow('proposal_not_found');
});
```

- [ ] **Step 2: Run test and verify red**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/core/engine/companion/CompanionService.test.ts`

Expected: FAIL with missing `CompanionService`.

- [ ] **Step 3: Implement exact intent and proposal unions**

Use `CompanionIntent = 'companion' | 'operate' | 'preference' | 'errand' | 'ambiguous'`. Strictly validate model output; keep at most one in-memory pending proposal per ID; `confirm` consumes once; `dismiss` has no side effect. Companion may not import Visual Agent, screenshots, credentials, action internals or task runner.

- [ ] **Step 4: Run targeted tests and type checking**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/core/engine/companion/CompanionService.test.ts && npx tsc --noEmit`

Expected: `1 passed`; all Companion service assertions pass; TypeScript exits 0.

- [ ] **Step 5: Commit Companion domain**

```bash
git add AwesomeProject/src/core/engine/companion AwesomeProject/src/__tests__/core/engine/companion/CompanionService.test.ts
git commit -m "feat: add companion intent proposals"
```

### Task 4: Companion Facade and UI-Neutral ViewState

**Files:**

- Create: `AwesomeProject/src/features/companion/application/CompanionViewState.ts`
- Create: `AwesomeProject/src/features/companion/application/CompanionFacade.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/companion/CompanionFacade.test.ts`

**Interfaces:**

- Consumes: `CompanionService`、`PreferenceRepository.upsertConfirmed`、Task 6 `ErrandProposalPort.create`。
- Produces: `CompanionViewState`、`CompanionTurnViewState`、`CompanionFacade.getState/submitTranscript/confirmProposal/dismissTurn`。

- [ ] **Step 1: Write the failing Facade test**

```ts
it('routes persistence only after explicit confirmation by turn id', async () => {
  const turn = await facade.submitTranscript('以后咖啡少糖');
  expect(turn.intent).toBe('preference');
  expect(preferences.upsertConfirmed).not.toHaveBeenCalled();
  await facade.confirmProposal(turn.id);
  expect(preferences.upsertConfirmed).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test and verify red**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/core/engine/companion/CompanionFacade.test.ts`

Expected: FAIL with missing `CompanionFacade`.

- [ ] **Step 3: Implement the immutable Facade snapshot**

View phase is `idle | listening | thinking | ready | error`. Facade owns `turnId → proposalId` only in memory. Preference/errand proposals route after confirmation. Operate intent has no persisted handoff; later Home integration calls the single operate facade only after explicit user action.

- [ ] **Step 4: Run Companion tests and type checking**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/core/engine/companion && npx tsc --noEmit`

Expected: `2 passed`; all Companion assertions pass; TypeScript exits 0.

- [ ] **Step 5: Commit Companion Facade**

```bash
git add AwesomeProject/src/features/companion/application AwesomeProject/src/__tests__/core/engine/companion/CompanionFacade.test.ts
git commit -m "feat: expose companion facade state"
```

### Task 5: Errand Domain, Deterministic Time Parser, and Atomic Repository

**Files:**

- Create: `AwesomeProject/src/core/engine/errand/domain/Errand.ts`
- Create: `AwesomeProject/src/core/engine/errand/domain/parseErrandTime.ts`
- Create: `AwesomeProject/src/core/engine/errand/ports/ErrandRepository.ts`
- Create: `AwesomeProject/src/features/errand/data/AsyncStorageErrandRepository.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/errand/parseErrandTime.test.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/errand/AsyncStorageErrandRepository.test.ts`

**Interfaces:**

- Consumes: `Clock`、`IdGenerator`、injected `AsyncStorageLike`。
- Produces: `Errand`、`ErrandSchedule`、`ErrandLease`、`parseErrandTime`、`nextDueAfter`、`ErrandRepository.create/list/claimDue/complete/fail/cancel/updateDraft`。

- [ ] **Step 1: Write failing parser and lease tests**

```ts
it('parses explicit weekly time and rejects ambiguity', () => {
  expect(parseErrandTime('每周五 18:00', context)).toEqual({kind: 'weekly', weekday: 5, hour: 18, minute: 0, timeZoneOffsetMinutes: 480});
  expect(() => parseErrandTime('下班前', context)).toThrow('errand_time_ambiguous');
});

it('allows one claimant for one due errand', async () => {
  const [a, b] = await Promise.all([claim('worker-a'), claim('worker-b')]);
  expect(a.length + b.length).toBe(1);
});
```

- [ ] **Step 2: Run tests and verify red**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/core/engine/errand/parseErrandTime.test.ts src/__tests__/core/engine/errand/AsyncStorageErrandRepository.test.ts`

Expected: FAIL with missing Errand modules.

- [ ] **Step 3: Implement exact schedule, status, lease, and storage contracts**

Accept only `明天 HH:mm`、`周一..周日 HH:mm`、`每周一..周日 HH:mm`、ISO-8601 with timezone. Device key is `@nono:errands:v1`. Legacy errands become `needs_attention`; never auto-run. Claim, reclaim, complete and fail are serialized; stale/expired lease writes throw `errand_lease_lost`.

- [ ] **Step 4: Run targeted tests and type checking**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/core/engine/errand/parseErrandTime.test.ts src/__tests__/core/engine/errand/AsyncStorageErrandRepository.test.ts && npx tsc --noEmit`

Expected: `2 passed`; parser and repository assertions pass; TypeScript exits 0.

- [ ] **Step 5: Commit Errand domain**

```bash
git add AwesomeProject/src/core/engine/errand/domain AwesomeProject/src/core/engine/errand/ports AwesomeProject/src/features/errand/data AwesomeProject/src/__tests__/core/engine/errand/parseErrandTime.test.ts AwesomeProject/src/__tests__/core/engine/errand/AsyncStorageErrandRepository.test.ts
git commit -m "feat: add atomic errand repository"
```

### Task 6: Errand Due Sweep, Lease Ownership, and Facade

**Files:**

- Create: `AwesomeProject/src/core/engine/errand/application/ErrandDueSweep.ts`
- Create: `AwesomeProject/src/features/errand/application/ErrandsViewState.ts`
- Create: `AwesomeProject/src/features/errand/application/ErrandFacade.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/errand/ErrandDueSweep.test.ts`
- Test: `AwesomeProject/src/__tests__/core/engine/errand/ErrandFacade.test.ts`

**Interfaces:**

- Consumes: `ErrandRepository`、`Clock`、`IdGenerator`、`CapabilityConfigPort`、single injected `ErrandExecutionPort.execute` supplied by later runtime composition。
- Produces: `ErrandDueSweep.run`、`SweepResult`、`ErrandFacade.read/setEnabled/create/update/cancel`。

- [ ] **Step 1: Write failing execute/failure tests**

```ts
it('executes one claimed lease and persists a generic failure code', async () => {
  executor.execute.mockRejectedValueOnce(new Error('visual_agent_disconnected'));
  await expect(sweep.run(options)).resolves.toEqual({claimed: 1, succeeded: 0, failed: 1});
  expect(repository.fail).toHaveBeenCalledWith(expect.objectContaining({
    errandId: 'e1', leaseId: 'l1', errorCode: 'visual_agent_disconnected',
  }));
  expect(executor.execute).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Write failing Facade confirmation test**

```ts
it('parses and persists only a confirmed proposal', async () => {
  await expect(facade.create({kind: 'errand', title: '交周报', errandType: 'schedule', when: '每周五 18:00'})).resolves.toBe('e1');
  expect(repository.create).toHaveBeenCalledWith({title: '交周报', schedule: expect.objectContaining({kind: 'weekly', weekday: 5})});
});
```

- [ ] **Step 3: Run tests and verify red**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/core/engine/errand/ErrandDueSweep.test.ts src/__tests__/core/engine/errand/ErrandFacade.test.ts`

Expected: FAIL with missing DueSweep/Facade modules.

- [ ] **Step 4: Implement one-owner sweep and sanitized ViewState**

One run generates one worker ID and calls `claimDue` once. It uses one injected execution port and has no local/Visual-Agent fallback branch. Unknown errors become `capability_invalid_input`; known generic codes may be persisted. `needs_attention` maps to UI failed with `needs_confirmation`. ViewState contains no lease ID, worker ID, tool raw error, image or credential.

- [ ] **Step 5: Run Errand tests and type checking**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/core/engine/errand && npx tsc --noEmit`

Expected: `4 passed`; all Errand assertions pass; TypeScript exits 0.

- [ ] **Step 6: Commit Errand application surfaces**

```bash
git add AwesomeProject/src/core/engine/errand/application AwesomeProject/src/features/errand/application AwesomeProject/src/__tests__/core/engine/errand/ErrandDueSweep.test.ts AwesomeProject/src/__tests__/core/engine/errand/ErrandFacade.test.ts
git commit -m "feat: add leased errand due sweep"
```

### Task 7: Verify Runtime Canonical Contracts and Implement the Bridge Codec

**Files:**

- Create: `AwesomeProject/src/connectorBridge/visualAgent/ports/VisualAgentUpstreamPort.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/protocol/VisualAgentProtocolCodec.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/conformance/VisualAgentAdapterConformance.ts`
- Test: `AwesomeProject/src/__tests__/connectorBridge/visualAgent/VisualAgentCanonicalContracts.test.ts`
- Test: `AwesomeProject/src/__tests__/connectorBridge/visualAgent/VisualAgentProtocolCodec.test.ts`

**Interfaces:**

- Consumes: the nine exact canonical contracts and `VisualAgentErrorCode` from Runtime Wave 1 Task 4B; Task 1 generic privacy/error wrapper.
- Produces: compile-time proof that Task 4B matches the Frozen Cross-Task Contracts, plus bridge-only `VisualAgentBindingPort`、`VisualAgentUpstreamPort`, strict `VisualAgentProtocolCodec`, and the tool-agnostic `defineVisualAgentAdapterConformance` runner available before adapter branches fork; it produces no second Visual Agent domain type。

The runner's seam is frozen in this task and internal to Connector Bridge tests/composition:

```ts
export interface VisualAgentAdapterConformanceFixture {
  readonly toolId: VisualAgentToolId;
  readonly adapter: VisualAgentToolAdapter;
  readonly profile: VisualAgentProfileV1;
  readonly binding: Readonly<Record<string, unknown>>;
  readonly upstream: VisualAgentUpstreamPort;
  readonly supportedCapabilities: VisualAgentCapabilitySet;
  readonly fallbackSpy: {readonly callCount: () => number};
  emitStatus(status: 'queued' | 'running'): void;
  emitApproval(approvalId: string): void;
  emitDelta(input: {textDelta?: string; visualUnderstandingDelta?: string; structuredAction?: VisualAgentStructuredAction}): void;
  emitCompleted(result: VisualAgentResultV1): void;
  emitFailed(errorCode: VisualAgentErrorCode, resumeToken?: string): void;
  emitCancelled(resumeToken?: string): void;
  emitDisconnect(): void;
}

export interface VisualAgentConformanceOptions {
  readonly requiredStatuses: readonly VisualAgentRunStatus[];
  readonly negotiatedCapabilities: readonly (keyof VisualAgentCapabilitySet)[];
}
```

- [ ] **Step 1: Write failing contract/registry tests**

```ts
it('uses the runtime canonical registry without a local alias', () => {
  const registry = createVisualAgentToolRegistry(adapters);
  expect(registry.list()).toEqual(['openclaw', 'codex', 'cursor', 'dsh', 'hermes']);
  expect(() => createVisualAgentToolRegistry([...adapters, adapters[0]])).toThrow('visual_agent_adapter_duplicate');
  expect(() => registry.require('other' as never)).toThrow('visual_agent_adapter_not_found');
  type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
  type RuntimeRegistry = import('@core/engine/operateRuntime/visualAgent/VisualAgentToolRegistry').VisualAgentToolRegistry;
  const exact: Equal<ReturnType<typeof createVisualAgentToolRegistry>, RuntimeRegistry> = true;
  expect(exact).toBe(true);
});

it('fails capability negotiation before execute', async () => {
  await expect(negotiateCapabilities(requestedAll, {...requestedAll, imageInput: false}))
    .rejects.toThrow('visual_agent_capability_unsupported');
  expect(execution.execute).not.toHaveBeenCalled();
});

it('runs the reusable conformance contract against a fake adapter', () => {
  expect(() => defineVisualAgentAdapterConformance(fakeFixture, {
    requiredStatuses: ['queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled'],
    negotiatedCapabilities: capabilityKeys,
  })).not.toThrow();
});
```

- [ ] **Step 2: Write failing strict codec tests**

```ts
it.each([
  'not-json',
  '{"version":2,"type":"session.ready"}',
  '{"version":1,"type":"task.status","status":"unknown"}',
])('rejects malformed frames without echoing input', raw => {
  expect(() => decodeVisualAgentMessage(raw)).toThrow('visual_agent_protocol_error');
});

it('rejects a second terminal state for one task/session', () => {
  tracker.accept(completed);
  expect(() => tracker.accept(cancelledForSameTask)).toThrow('visual_agent_protocol_error');
});

it('round-trips steer only for the correlated running task', () => {
  const raw = encodeVisualAgentMessage({
    version: 1, type: 'task.steer', requestId: 'r2',
    taskId: 't1', sessionRevision: 3, instruction: '先查看右上角',
  });
  expect(decodeVisualAgentMessage(raw)).toEqual(expect.objectContaining({
    type: 'task.steer', taskId: 't1', sessionRevision: 3,
  }));
  expect(() => tracker.acceptSteer({taskId: 't1', sessionRevision: 4}))
    .toThrow('visual_agent_protocol_error');
});
```

- [ ] **Step 3: Run tests and verify red**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/connectorBridge/visualAgent/VisualAgentCanonicalContracts.test.ts src/__tests__/connectorBridge/visualAgent/VisualAgentProtocolCodec.test.ts`

Expected: FAIL if Runtime Wave 1 Task 4B lacks any exact canonical export or while bridge codec/upstream port is missing.

- [ ] **Step 4: Verify and consume the frozen runtime contracts exactly**

Import all nine names from `@core/engine/operateRuntime/visualAgent/*` and use compile-time equality assertions against the acceptance excerpt. Do not declare an interface/type with any of those names in capability-owned files. The runtime-owned `createVisualAgentToolRegistry(adapters)` validates built-in IDs or nonempty `custom:` names, rejects duplicates, copies/freezes input and returns the read-only canonical registry. Capability code may not wrap it in an alternate registry. Define bridge-only `VisualAgentUpstreamProtocol` exactly as `'gateway_ws' | 'cli_exec_jsonl' | 'agent_cli_ndjson' | 'acp_json_rpc_stdio' | 'app_server_json_rpc_stdio' | 'gateway_json_rpc_stdio' | 'gateway_json_rpc_ws' | 'cloud_agents_http' | 'runs_http_sse' | 'dsh_cli' | 'custom_bridge'`.

- [ ] **Step 5: Implement the codec for canonical `VisualAgentProtocolV1`**

Consume the runtime-owned union containing client `session.open`、`task.start`、`task.cancel`、`task.approval.resolve`、`task.resume`、`task.steer`、`preference.request`; server `session.ready`、`session.failed`、`task.status`、`task.event`、`task.completed`、`task.failed`、`task.cancelled`、`preference.result`、`protocol.error`. Task status uses the six frozen run states. Event sequence must strictly increase. Decoder rejects wrong version, unknown type, missing/extra security-sensitive fields, task/session mismatch, steer mismatch, duplicate terminal and frames over 1 MiB. Errors expose only `visual_agent_protocol_error`.

In the same core task, implement `defineVisualAgentAdapterConformance` without importing any built-in adapter. It validates manifest/tool identity, adapter/protocol version, declared-versus-negotiated capability subset, correlation, consent, structured actions, stream ordering, approval, cancel, resume, steer, preferences, disconnect, one terminal result, sanitized errors, and zero fallback calls. Task 9–11 unit suites import this runner and execute it against their own fixtures before their branch can pass; Task 12 only aggregates those already-valid fixtures and does not create the runner late.

- [ ] **Step 6: Run targeted tests and type checking**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/connectorBridge/visualAgent/VisualAgentCanonicalContracts.test.ts src/__tests__/connectorBridge/visualAgent/VisualAgentProtocolCodec.test.ts && npx tsc --noEmit`

Expected: `2 passed`; contracts and codec assertions pass; TypeScript exits 0.

- [ ] **Step 7: Commit the bridge codec and canonical-contract proof**

```bash
git add AwesomeProject/src/connectorBridge/visualAgent/ports AwesomeProject/src/connectorBridge/visualAgent/protocol AwesomeProject/src/connectorBridge/visualAgent/conformance/VisualAgentAdapterConformance.ts AwesomeProject/src/__tests__/connectorBridge/visualAgent/VisualAgentCanonicalContracts.test.ts AwesomeProject/src/__tests__/connectorBridge/visualAgent/VisualAgentProtocolCodec.test.ts
git commit -m "feat: consume visual agent runtime contracts"
```

### Task 8: Generic Profile Controller and Legacy Projection Verification

**Files:**

- Create: `AwesomeProject/src/features/visualAgent/application/VisualAgentProfileController.ts`
- Test: `AwesomeProject/src/__tests__/features/visualAgent/VisualAgentProfileController.test.ts`
- Test: `AwesomeProject/src/__tests__/features/visualAgent/LegacyOpenClawProjection.test.ts`

**Interfaces:**

- Consumes: Runtime Wave 1 Task 4B current-schema `RuntimeConfigEnvelopeV1` and `RuntimeConfigRepository.load/compareAndActivate`; Wave 1 `CredentialStore` and `CredentialRetirementRepository`; canonical `VisualAgentToolRegistry`; `IdGenerator`. The runtime repository has already completed `RuntimeConfigMigrationV1` before this controller sees the envelope, and Runtime Task 6 is the only cold-start retired-ref deletion owner.
- Produces: only the production component `VisualAgentProfileController` with `list/readActiveProjection/save/remove/setActive/setEnabled`; `VisualAgentProfileProjectionV1` is its safe return shape, not a second migration component. It produces no migration function, legacy key reader, binding port or retry owner.

```ts
export interface VisualAgentProfileDraftV1 {
  readonly expectedRevision: number;
  readonly profileId?: string;
  readonly toolId: VisualAgentToolId;
  readonly enabled: boolean;
  readonly bridgeUrl: string;
  readonly bindingId: string;
  readonly credential:
    | {readonly action: 'keep'}
    | {readonly action: 'replace'; readonly plaintext: string}
    | {readonly action: 'remove'};
  readonly requestedCapabilities: VisualAgentCapabilitySet;
}

export interface VisualAgentProfileProjectionV1 {
  readonly profileId: string;
  readonly toolId: VisualAgentToolId;
  readonly connectorRef: {
    readonly kind: 'connector_bridge';
    readonly bindingId: string;
  };
}

export class VisualAgentProfileController {
  constructor(
    runtimeConfig: RuntimeConfigRepository,
    credentials: CredentialStore,
    retirements: CredentialRetirementRepository,
    registry: VisualAgentToolRegistry,
    ids: IdGenerator,
  );
  list(): Promise<readonly VisualAgentProfileV1[]>;
  readActiveProjection(): Promise<VisualAgentProfileProjectionV1 | null>;
  save(input: VisualAgentProfileDraftV1): Promise<VisualAgentProfileV1>;
  remove(profileId: string, expectedRevision: number): Promise<RuntimeConfigEnvelopeV1>;
  setActive(profileId: string | null, expectedRevision: number): Promise<RuntimeConfigEnvelopeV1>;
  setEnabled(enabled: boolean, expectedRevision: number): Promise<RuntimeConfigEnvelopeV1>;
}
```

- [ ] **Step 1: Write failing profile CAS and secret-rotation tests**

```ts
it('stores only a bridge secret ref and atomically preserves unrelated runtime fields', async () => {
  const saved = await controller.save({
    expectedRevision: 4, profileId: 'codex-main', toolId: 'codex', enabled: true,
    bridgeUrl: 'https://bridge.example', bindingId: 'codex-main',
    credential: {action: 'replace', plaintext: 'secret'},
    requestedCapabilities: capabilities,
  });
  expect(registry.require).toHaveBeenCalledWith('codex');
  expect(credentials.put).toHaveBeenCalledWith(expect.stringMatching(/^visual-agent:/), 'secret');
  expect(retirements.stage).toHaveBeenCalledWith(expect.objectContaining({
    oldSecretRef: 'visual-agent:old-ref',
    replacementSecretRef: expect.stringMatching(/^visual-agent:/),
  }));
  expect(retirements.stage.mock.invocationCallOrder[0])
    .toBeLessThan(credentials.put.mock.invocationCallOrder[0]);
  expect(runtimeConfig.compareAndActivate).toHaveBeenCalledWith(4, expect.any(Function));
  const mutate = runtimeConfig.compareAndActivate.mock.calls[0][1];
  expect(mutate(activeRoute)).toEqual(expect.objectContaining({
    capabilities: activeRoute.capabilities,
    modelAPI: activeRoute.modelAPI,
    visualAgent: expect.objectContaining({enabled: true, activeProfileId: 'codex-main'}),
  }));
  expect(JSON.stringify(saved)).not.toContain('secret');
});

it('keeps or removes an existing bridge credential only by explicit intent', async () => {
  await controller.save({
    expectedRevision: 5, profileId: 'codex-main', toolId: 'codex', enabled: true,
    bridgeUrl: 'https://bridge.example', bindingId: 'codex-main',
    credential: {action: 'keep'}, requestedCapabilities: capabilities,
  });
  expect(credentials.put).not.toHaveBeenCalled();
  expect(credentials.get).not.toHaveBeenCalled();
  const keepMutate = runtimeConfig.compareAndActivate.mock.calls[0][1];
  expect(keepMutate(activeRoute).visualAgent.profiles[0].connector.secretRef)
    .toBe('visual-agent:old-ref');

  await controller.save({
    expectedRevision: 6, profileId: 'codex-main', toolId: 'codex', enabled: true,
    bridgeUrl: 'https://bridge.example', bindingId: 'codex-main',
    credential: {action: 'remove'}, requestedCapabilities: capabilities,
  });
  const removeMutate = runtimeConfig.compareAndActivate.mock.calls[1][1];
  expect(removeMutate(activeRoute).visualAgent.profiles[0].connector.secretRef)
    .toBeNull();
  expect(retirements.stage).toHaveBeenCalledWith(expect.objectContaining({
    oldSecretRef: 'visual-agent:old-ref', replacementSecretRef: null,
  }));
  expect(retirements.commit).toHaveBeenCalled();
  expect(credentials.delete).not.toHaveBeenCalledWith('visual-agent:old-ref');
});

it('rejects create+keep and cleans only the staged replacement on CAS failure', async () => {
  await expect(controller.save({
    expectedRevision: 6, toolId: 'cursor', enabled: true,
    bridgeUrl: 'https://bridge.example', bindingId: 'cursor-main',
    credential: {action: 'keep'}, requestedCapabilities: capabilities,
  })).rejects.toThrow('visual_agent_invalid_profile');
  runtimeConfig.compareAndActivate.mockRejectedValueOnce(new Error('config_revision_conflict'));
  await expect(controller.save({
    expectedRevision: 5, profileId: 'codex-main', toolId: 'codex', enabled: true,
    bridgeUrl: 'https://bridge.example', bindingId: 'codex-main',
    credential: {action: 'replace', plaintext: 'rotated'},
    requestedCapabilities: capabilities,
  })).rejects.toThrow('config_revision_conflict');
  expect(credentials.delete).toHaveBeenCalledWith(expect.stringMatching(/^visual-agent:/));
  expect(retirements.rollback).toHaveBeenCalled();
  expect(credentials.delete).not.toHaveBeenCalledWith('visual-agent:old-ref');
});

it.each([
  [{action: 'replace', plaintext: 'first-secret'} as const, expect.stringMatching(/^visual-agent:/)],
  [{action: 'remove'} as const, null],
])('creates a generated profile with an explicit credential intent', async (credential, expectedRef) => {
  ids.next.mockReturnValueOnce('cursor-generated');
  const saved = await controller.save({
    expectedRevision: 7, toolId: 'cursor', enabled: false,
    bridgeUrl: 'https://bridge.example', bindingId: 'cursor-generated',
    credential, requestedCapabilities: capabilities,
  });
  expect(saved.profileId).toBe('cursor-generated');
  expect(saved.connector.secretRef).toEqual(expectedRef);
  if (credential.action === 'replace') {
    expect(retirements.stage).toHaveBeenCalledWith(expect.objectContaining({
      oldSecretRef: null, replacementSecretRef: expect.stringMatching(/^visual-agent:/),
    }));
  } else {
    expect(retirements.stage).not.toHaveBeenCalledWith(expect.objectContaining({
      oldSecretRef: null, replacementSecretRef: null,
    }));
  }
});
```

- [ ] **Step 2: Write the read-only legacy projection boundary test**

```ts
it('projects a runtime-migrated OpenClaw profile without invoking migration or reading legacy keys', async () => {
  const fixture = createMigratedRuntimeConfigRepositoryFixture({
    revision: 7,
    visualAgent: {
      enabled: true,
      activeProfileId: 'legacy-openclaw',
      profiles: [{
        schemaVersion: 1,
        profileId: 'legacy-openclaw',
        toolId: 'openclaw',
        enabled: true,
        connector: {
          kind: 'connector_bridge',
          bridgeUrl: 'https://bridge.example',
          bindingId: 'legacy-openclaw-gateway',
          secretRef: 'visual-agent:legacy-openclaw',
        },
        requestedCapabilities: capabilities,
      }],
    },
  });
  const controller = new VisualAgentProfileController(
    fixture.repository, credentials, retirements, registry, ids,
  );

  const projection = await controller.readActiveProjection();
  expect(projection).toEqual({
    profileId: 'legacy-openclaw',
    toolId: 'openclaw',
    connectorRef: {kind: 'connector_bridge', bindingId: 'legacy-openclaw-gateway'},
  });
  expect(fixture.repository.load).toHaveBeenCalledTimes(1);
  expect(fixture.repository.compareAndActivate).not.toHaveBeenCalled();
  expect(fixture.migrationRun).not.toHaveBeenCalled();
  expect(fixture.legacyStorage.getItem).not.toHaveBeenCalled();
  expect(JSON.stringify(projection))
    .not.toMatch(/gatewayUrl|deviceId|cluster|openClaw|secretRef/i);
});
```

`createMigratedRuntimeConfigRepositoryFixture` is local to `LegacyOpenClawProjection.test.ts`. Its `repository.load` returns a frozen, valid current-schema envelope containing the supplied `visualAgent` group; `compareAndActivate` is a Jest mock; `migrationRun` and `legacyStorage.getItem` are independent forbidden-call spies. The controller constructor accepts none of the forbidden spies, proving the capability boundary has no migration/legacy dependency.

- [ ] **Step 3: Run tests and verify red**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/features/visualAgent/VisualAgentProfileController.test.ts src/__tests__/features/visualAgent/LegacyOpenClawProjection.test.ts`

Expected: FAIL with missing `VisualAgentProfileController` and its safe projection method; there is no missing migration production module.

- [ ] **Step 4: Implement validation, CAS, and read-only projection**

Require HTTPS/WSS Connector Bridge URL with no userinfo/hash; an omitted `profileId` means create with `IdGenerator`, while a supplied profile ID must already exist for update; profile/binding IDs are trimmed printable 1..128; `registry.require(toolId)` must succeed; requested capabilities contain all eight booleans. Credential intent is explicit: `keep` is update-only and retains the exact existing `secretRef` without reading it; `replace` uses generate new ref → `retirement.stage(old|null,new)` → put new ref → exact readback → one `RuntimeConfigRepository.compareAndActivate` → `retirement.commit`; `remove` on an update stages `(old,null)` only when old is non-null, CAS-writes `secretRef:null`, then commits retirement. Stage failure writes no credential. Create plus `replace` generates the profile/ref and stages `(null,new)` before secure put so any crash can reconcile the orphan; create plus `remove` creates a no-Bridge-auth profile with `secretRef:null` and writes no invalid `(null,null)` retirement record. A profile with null ref remains configurable but readiness is blocked whenever the selected Bridge binding requires authentication. Neither successful path deletes the old ref inline, because a nonterminal session may pin it; Runtime Task 6 cold-start GC is the sole deletion owner. A create with `keep`, empty replace plaintext, unknown update ID or stale revision fails before mutation. Put/readback/CAS failure deletes only the unreferenced newly staged ref, verifies `get(newRef) === null`, then rolls back the retirement record; deletion/readback failure leaves the staged record for cold-start GC and always leaves the old ref untouched. Profile `remove(profileId)` stages its non-null connector ref when present, atomically removes the profile and clears `activeProfileId` if needed, commits retirement, and lets cold-start GC delete only after no active/draft profile or nonterminal session references it; removing a null-ref profile performs only the CAS. `setActive/setEnabled` each use one expected-revision CAS and preserve unrelated route fields. `readActiveProjection` calls only `runtimeConfig.load()`, resolves `active.visualAgent.activeProfileId` inside the already-migrated profile list, and returns only `profileId/toolId/connectorRef.kind/bindingId`; it never imports or invokes `RuntimeConfigMigrationV1`/`LegacyOpenClawBindingPort`, reads a legacy key or projects upstream metadata/credentials.

- [ ] **Step 5: Run targeted tests and type checking**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/features/visualAgent/VisualAgentProfileController.test.ts src/__tests__/features/visualAgent/LegacyOpenClawProjection.test.ts && npx tsc --noEmit`

Expected: `2 passed`; controller and read-only projection assertions pass; TypeScript exits 0.

- [ ] **Step 6: Commit the profile controller and projection boundary**

```bash
git add AwesomeProject/src/features/visualAgent/application/VisualAgentProfileController.ts AwesomeProject/src/__tests__/features/visualAgent/VisualAgentProfileController.test.ts AwesomeProject/src/__tests__/features/visualAgent/LegacyOpenClawProjection.test.ts
git commit -m "feat: project migrated visual agent profiles"
```

## Built-In Adapter Wave: Three Parallel Workers

Task 9–11 start only after Tasks 7–8 pass and share the same core commit. Exactly three workers may run concurrently. Their writable file sets are disjoint:

| Worker | Owns | Must not touch |
| --- | --- | --- |
| A / Task 9 | `adapters/openclaw/**` and `__tests__/connectorBridge/visualAgent/openclaw/**` | core contracts, other adapter dirs, conformance runner, registry, mobile feature |
| B / Task 10 | `adapters/codex/**`、`adapters/cursor/**` and matching test dirs | core contracts, OpenClaw/DSH/Hermes dirs, conformance runner, registry, mobile feature |
| C / Task 11 | `adapters/dsh/**`、`adapters/hermes/**` and matching test dirs | core contracts, OpenClaw/Codex/Cursor dirs, conformance runner, registry, mobile feature |

Each worker exports one `conformanceFixture.ts` per adapter and its own unit test invokes the Task 7 shared conformance runner, but no worker edits that runner. The integration owner alone executes Task 12, aggregates all five passing fixtures, registers all five adapters, and owns every shared barrel/gate file. A worker needing a core contract change must stop; it cannot patch Task 7 files locally.

The five manifests are part of the Wave 2A acceptance contract. Each worker defines its named constant in that adapter's `*Binding.ts`; these are maximum implementation capabilities, not a promise for every upstream mode. Handshake negotiation must return a subset and profile activation still requires negotiated image input plus structured action.

```ts
export const openClawManifest: VisualAgentToolManifestV1 = {
  toolId: 'openclaw', displayName: 'OpenClaw', maturity: 'stable',
  adapterVersion: '1.0.0', protocolVersions: [1],
  declaredCapabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: true},
};

export const codexManifest: VisualAgentToolManifestV1 = {
  toolId: 'codex', displayName: 'Codex', maturity: 'beta',
  adapterVersion: '1.0.0', protocolVersions: [1],
  declaredCapabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: false},
};

export const cursorManifest: VisualAgentToolManifestV1 = {
  toolId: 'cursor', displayName: 'Cursor', maturity: 'beta',
  adapterVersion: '1.0.0', protocolVersions: [1],
  declaredCapabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: false, preferences: false},
};

export const dshManifest: VisualAgentToolManifestV1 = {
  toolId: 'dsh', displayName: 'DSH (DeepSeek Harness)', maturity: 'experimental',
  adapterVersion: '1.0.0', protocolVersions: [1],
  declaredCapabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: false, resume: false, steer: false, preferences: false},
};

export const hermesManifest: VisualAgentToolManifestV1 = {
  toolId: 'hermes', displayName: 'Hermes', maturity: 'beta',
  adapterVersion: '1.0.0', protocolVersions: [1],
  declaredCapabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: false},
};
```

Changing any value requires official-source evidence, an adapter-version increment, the adapter's unit/conformance suite, the Task 12 exact-manifest snapshot, UI projection tests, and a new candidate; a worker cannot silently widen a boolean.

### Task 9: Worker A — OpenClaw Gateway WebSocket Adapter

**Files:**

- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/openclaw/OpenClawAdapter.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/openclaw/OpenClawBinding.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/openclaw/conformanceFixture.ts`
- Test: `AwesomeProject/src/__tests__/connectorBridge/visualAgent/openclaw/OpenClawAdapter.test.ts`

**Interfaces:**

- Consumes: frozen `VisualAgentToolAdapter`/`VisualAgentExecutionPort`、`VisualAgentUpstreamPort` mode `gateway_ws`、sanitized binding `{gatewayUrl, deviceId, cluster, secretRef}`。
- Produces: adapter `toolId='openclaw'`, Gateway WS message mapping, capability mapping, and conformance fixture。

```ts
export interface OpenClawBindingV1 {
  readonly schemaVersion: 1;
  readonly toolId: 'openclaw';
  readonly protocol: 'gateway_ws';
  readonly gatewayUrl: string;
  readonly deviceId: string;
  readonly cluster: string;
  readonly secretRef: string | null;
}

export class OpenClawAdapter implements VisualAgentToolAdapter {
  readonly toolId = 'openclaw' as const;
  readonly manifest = openClawManifest;
  constructor(bindings: VisualAgentBindingPort, upstream: VisualAgentUpstreamPort, timer: TimerPort);
  create(profile: VisualAgentProfileV1): VisualAgentExecutionPort;
}
```

- [ ] **Step 1: Write failing mapping/correlation tests**

```ts
it('maps one normalized task to one Gateway task and correlates cancellation', async () => {
  await execution.execute(envelope, signal);
  expect(upstreamSession.send).toHaveBeenCalledWith(expect.objectContaining({type: 'task.start', taskId: 't1', sessionRevision: 3}));
  await execution.cancel({taskId: 't1', sessionRevision: 3}, signal);
  expect(upstreamSession.send).toHaveBeenCalledWith(expect.objectContaining({type: 'task.cancel', taskId: 't1', sessionRevision: 3}));
});

it('never connects when Gateway capabilities omit requested image input', async () => {
  upstreamSession.negotiate.mockResolvedValue({...allCapabilities, imageInput: false});
  await expect(execution.connect(profile, signal)).rejects.toThrow('visual_agent_capability_unsupported');
});

defineVisualAgentAdapterConformance(openClawConformanceFixture, requiredConformance);
```

- [ ] **Step 2: Run test and verify red**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/connectorBridge/visualAgent/openclaw/OpenClawAdapter.test.ts`

Expected: FAIL with missing OpenClaw adapter.

- [ ] **Step 3: Implement strict Gateway mapping**

Validate only `wss:` URL, nonempty device/cluster and opaque ref. Authenticate before ready, map Gateway accepted/event/completed/failed/cancelled into normalized status/event/terminal messages, require heartbeat acknowledgment, reject all pending requests on disconnect, and map all public failures to generic codes. Preference and steer operations are enabled only if Gateway negotiation explicitly returns the corresponding capability; otherwise each fails before sending. No local pipeline or HTTP fallback exists.

- [ ] **Step 4: Run targeted tests and type checking**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/connectorBridge/visualAgent/openclaw/OpenClawAdapter.test.ts && npx tsc --noEmit`

Expected: `1 passed`; OpenClaw mapping assertions pass; TypeScript exits 0.

- [ ] **Step 5: Commit Worker A files**

```bash
git add AwesomeProject/src/connectorBridge/visualAgent/adapters/openclaw AwesomeProject/src/__tests__/connectorBridge/visualAgent/openclaw
git commit -m "feat: add openclaw visual agent adapter"
```

### Task 10: Worker B — Codex and Cursor Adapters

**Files:**

- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/codex/CodexAdapter.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/codex/CodexBinding.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/codex/conformanceFixture.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/cursor/CursorAdapter.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/cursor/CursorBinding.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/cursor/conformanceFixture.ts`
- Test: `AwesomeProject/src/__tests__/connectorBridge/visualAgent/codex/CodexAdapter.test.ts`
- Test: `AwesomeProject/src/__tests__/connectorBridge/visualAgent/cursor/CursorAdapter.test.ts`

**Interfaces:**

- Consumes: frozen adapter contract; upstream modes `cli_exec_jsonl | app_server_json_rpc_stdio` for Codex and `agent_cli_ndjson | acp_json_rpc_stdio | cloud_agents_http` for Cursor.
- Produces: `codex` and `cursor` adapters plus independent conformance fixtures。

```ts
export type CodexBindingV1 = {
  readonly schemaVersion: 1;
  readonly toolId: 'codex';
  readonly protocol: 'cli_exec_jsonl' | 'app_server_json_rpc_stdio';
  readonly executable: 'codex';
  readonly cwd: string;
  readonly args: readonly string[];
  readonly secretRef: string | null;
};

export type CursorBindingV1 = {
  readonly schemaVersion: 1;
  readonly toolId: 'cursor';
  readonly protocol: 'agent_cli_ndjson' | 'acp_json_rpc_stdio' | 'cloud_agents_http';
  readonly endpointOrExecutable: string;
  readonly cwd: string | null;
  readonly args: readonly string[];
  readonly secretRef: string | null;
};

export class CodexAdapter implements VisualAgentToolAdapter {
  readonly toolId = 'codex' as const;
  readonly manifest = codexManifest;
  constructor(bindings: VisualAgentBindingPort, upstream: VisualAgentUpstreamPort);
  create(profile: VisualAgentProfileV1): VisualAgentExecutionPort;
}
export class CursorAdapter implements VisualAgentToolAdapter {
  readonly toolId = 'cursor' as const;
  readonly manifest = cursorManifest;
  constructor(bindings: VisualAgentBindingPort, upstream: VisualAgentUpstreamPort);
  create(profile: VisualAgentProfileV1): VisualAgentExecutionPort;
}
```

- [ ] **Step 1: Write failing Codex transport-selection and approval tests**

```ts
it.each(['cli_exec_jsonl', 'app_server_json_rpc_stdio'] as const)('uses one configured Codex mode: %s', async protocol => {
  const execution = createCodex(protocol);
  await execution.execute(envelope, signal);
  expect(upstream.open).toHaveBeenCalledWith(expect.objectContaining({protocol}));
  expect(upstream.open).toHaveBeenCalledTimes(1);
});

it('maps App Server approval without auto-approving', async () => {
  upstreamSession.emit({method: 'approval/request', params: {id: 'a1'}});
  expect(events.at(-1)).toEqual(expect.objectContaining({status: 'waiting_approval', approvalId: 'a1'}));
  expect(upstreamSession.send).not.toHaveBeenCalledWith(expect.objectContaining({decision: 'approve'}));
});
```

- [ ] **Step 2: Write failing Cursor mode/capability tests**

```ts
it.each(['agent_cli_ndjson', 'acp_json_rpc_stdio', 'cloud_agents_http'] as const)('maps the configured Cursor mode: %s', async protocol => {
  await createCursor(protocol).execute(envelope, signal);
  expect(upstream.open).toHaveBeenCalledWith(expect.objectContaining({protocol}));
});

it('does not claim cancel for a CLI profile that cannot acknowledge it', async () => {
  await expect(createCursor('agent_cli_ndjson').connect(profileRequiringCancel, signal))
    .rejects.toThrow('visual_agent_capability_unsupported');
});

defineVisualAgentAdapterConformance(codexConformanceFixture, requiredConformance);
defineVisualAgentAdapterConformance(cursorConformanceFixture, requiredConformance);
```

- [ ] **Step 3: Run tests and verify red**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/connectorBridge/visualAgent/codex/CodexAdapter.test.ts src/__tests__/connectorBridge/visualAgent/cursor/CursorAdapter.test.ts`

Expected: FAIL with missing Codex/Cursor adapters.

- [ ] **Step 4: Implement Codex mappings**

`cli_exec_jsonl` spawns exactly one bridge-owned child session through `VisualAgentUpstreamPort`, parses JSONL only, closes stdin/process on cancellation, and advertises only observed capabilities. `app_server_json_rpc_stdio` maps request IDs, thread/turn events, approval requests, cancellation and in-flight steer only when the fixture demonstrates correlated input for the same task/session. Do not enable experimental App Server WebSocket in this plan. `codex mcp-server` is excluded from binding modes because it does not provide the complete normalized lifecycle.

- [ ] **Step 5: Implement Cursor mappings**

`agent_cli_ndjson` parses stream-json/NDJSON; `acp_json_rpc_stdio` maps ACP session/prompt/update/cancel; `cloud_agents_http` maps REST create/status/stop plus server stream only when present. The binding chooses one mode. Cloud auth and local CLI auth are separate secret refs. Cursor MCP configuration is not exposed as a transport. Unsupported image/cancel/approval/resume/steer/preferences fail before sending; steer is true only for a mode with a correlated in-flight input primitive.

- [ ] **Step 6: Run targeted tests and type checking**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/connectorBridge/visualAgent/codex/CodexAdapter.test.ts src/__tests__/connectorBridge/visualAgent/cursor/CursorAdapter.test.ts && npx tsc --noEmit`

Expected: `2 passed`; Codex/Cursor assertions pass; TypeScript exits 0.

- [ ] **Step 7: Commit Worker B files**

```bash
git add AwesomeProject/src/connectorBridge/visualAgent/adapters/codex AwesomeProject/src/connectorBridge/visualAgent/adapters/cursor AwesomeProject/src/__tests__/connectorBridge/visualAgent/codex AwesomeProject/src/__tests__/connectorBridge/visualAgent/cursor
git commit -m "feat: add codex and cursor visual agent adapters"
```

### Task 11: Worker C — DSH and Hermes Adapters

**Files:**

- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/dsh/DshAdapter.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/dsh/DshBinding.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/dsh/conformanceFixture.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/hermes/HermesAdapter.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/hermes/HermesBinding.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/hermes/conformanceFixture.ts`
- Test: `AwesomeProject/src/__tests__/connectorBridge/visualAgent/dsh/DshAdapter.test.ts`
- Test: `AwesomeProject/src/__tests__/connectorBridge/visualAgent/hermes/HermesAdapter.test.ts`

**Interfaces:**

- Consumes: frozen adapter contract; `dsh_cli | custom_bridge` for DSH and `acp_json_rpc_stdio | gateway_json_rpc_stdio | gateway_json_rpc_ws | runs_http_sse` for Hermes.
- Produces: disabled-by-default `dsh` adapter, `hermes` adapter, and conformance fixtures。

```ts
export type DshBindingV1 = {
  readonly schemaVersion: 1;
  readonly toolId: 'dsh';
  readonly product: 'deepseek-harness';
  readonly protocol: 'dsh_cli' | 'custom_bridge';
  readonly version: string;
  readonly endpointOrExecutable: string;
  readonly cwd: string | null;
  readonly args: readonly string[];
  readonly secretRef: string | null;
  readonly enabled: boolean;
  readonly declaredCapabilities: VisualAgentCapabilitySet;
};

export type HermesBindingV1 = {
  readonly schemaVersion: 1;
  readonly toolId: 'hermes';
  readonly protocol: 'acp_json_rpc_stdio' | 'gateway_json_rpc_stdio' | 'gateway_json_rpc_ws' | 'runs_http_sse';
  readonly endpointOrExecutable: string;
  readonly cwd: string | null;
  readonly args: readonly string[];
  readonly secretRef: string | null;
};

export class DshAdapter implements VisualAgentToolAdapter {
  readonly toolId = 'dsh' as const;
  readonly manifest = dshManifest;
  constructor(bindings: VisualAgentBindingPort, upstream: VisualAgentUpstreamPort);
  create(profile: VisualAgentProfileV1): VisualAgentExecutionPort;
}
export class HermesAdapter implements VisualAgentToolAdapter {
  readonly toolId = 'hermes' as const;
  readonly manifest = hermesManifest;
  constructor(bindings: VisualAgentBindingPort, upstream: VisualAgentUpstreamPort);
  create(profile: VisualAgentProfileV1): VisualAgentExecutionPort;
}
```

- [ ] **Step 1: Write failing DSH identity/default-disable tests**

```ts
it('binds dsh only to an explicit DeepSeek Harness binding and remains disabled by default', () => {
  expect(() => adapter.validateBinding({product: 'dify', protocol: 'custom_bridge'}))
    .toThrow('visual_agent_invalid_profile');
  expect(adapter.validateBinding({product: 'deepseek-harness', protocol: 'dsh_cli', enabled: false}))
    .toEqual(expect.objectContaining({enabled: false}));
});

it('does not infer unsupported capabilities from unstructured CLI text', async () => {
  upstreamSession.negotiate.mockResolvedValue(noCapabilities);
  await expect(execution.connect(profileRequiringStream, signal))
    .rejects.toThrow('visual_agent_capability_unsupported');
});
```

- [ ] **Step 2: Write failing Hermes lifecycle tests**

```ts
it.each(['acp_json_rpc_stdio', 'gateway_json_rpc_stdio', 'gateway_json_rpc_ws', 'runs_http_sse'] as const)
('maps one Hermes mode: %s', async protocol => {
  await createHermes(protocol).execute(envelope, signal);
  expect(upstream.open).toHaveBeenCalledWith(expect.objectContaining({protocol}));
});

it('maps run approval, steer/cancel, resume, and inline images only when negotiated', async () => {
  await execution.connect(profile, signal);
  expect(negotiated).toEqual(expect.objectContaining({imageInput: true, approval: true, resume: true}));
});

defineVisualAgentAdapterConformance(dshConformanceFixture, requiredConformance);
defineVisualAgentAdapterConformance(hermesConformanceFixture, requiredConformance);
```

- [ ] **Step 3: Run tests and verify red**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/connectorBridge/visualAgent/dsh/DshAdapter.test.ts src/__tests__/connectorBridge/visualAgent/hermes/HermesAdapter.test.ts`

Expected: FAIL with missing DSH/Hermes adapters.

- [ ] **Step 4: Implement conservative DSH mapping**

Accept `product='deepseek-harness'` only. `dsh_cli` and `custom_bridge` each require an explicit version and a fixture-declared capability set. Unknown versions and unstructured output fail closed. Default binding `enabled=false`. Do not claim ACP/MCP/HTTP or steer support unless the selected bridge fixture demonstrates it with task/session correlation. Never use Dify as an alias.

- [ ] **Step 5: Implement Hermes mappings**

Map ACP/stdin, TUI Gateway JSON-RPC over stdio or WS, and Runs HTTP+SSE as separate bindings. Runs endpoints map status/events/approval/steer/stop/resume and inline image input only when reported. `hermes mcp serve` is excluded because its messaging bridge is not a complete Visual Agent lifecycle. No binding mode fallback is allowed.

- [ ] **Step 6: Run targeted tests and type checking**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/connectorBridge/visualAgent/dsh/DshAdapter.test.ts src/__tests__/connectorBridge/visualAgent/hermes/HermesAdapter.test.ts && npx tsc --noEmit`

Expected: `2 passed`; DSH/Hermes assertions pass; TypeScript exits 0.

- [ ] **Step 7: Commit Worker C files**

```bash
git add AwesomeProject/src/connectorBridge/visualAgent/adapters/dsh AwesomeProject/src/connectorBridge/visualAgent/adapters/hermes AwesomeProject/src/__tests__/connectorBridge/visualAgent/dsh AwesomeProject/src/__tests__/connectorBridge/visualAgent/hermes
git commit -m "feat: add dsh and hermes visual agent adapters"
```

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
