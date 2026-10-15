// Wave 4B Task 11 Step 3 fixture for `RuntimeChannelEndToEnd.test.ts`.
//
// Composes the real `OperateRuntime` + `OperateSessionStore` +
// `OperateSessionResolver` + `OperateTaskRunner` with deterministic fake
// native ports: a fake `ModelProviderRegistry`/transports (see
// `operateRuntimeTestKit`), a fake `VisualAgentToolRegistry`, and a fake
// `snapshotAgentRuntime` port that dispatches through the fake registry
// instead of the real `AgentRuntime`/pipeline stack (that stack is exercised
// by its own unit tests elsewhere; this suite only needs to prove that
// `OperateSessionResolver` + `OperateTaskRunner` route each channel/provider
// through exactly the expected fake native port, with zero fallback).
import {OperateRuntime} from '@core/engine/operateRuntime/OperateRuntime';
import {OperateSessionStore} from '@core/engine/operateRuntime/session/OperateSessionStore';
import {OperateSessionResolver} from '@core/engine/operateRuntime/session/OperateSessionResolver';
import {OperateTaskRunner} from '@core/engine/operateRuntime/runner/OperateTaskRunner';
import type {OperateTaskRunnerPorts} from '@core/engine/operateRuntime/runner/OperateTaskPorts';
import type {SnapshotAgentRuntimePort} from '@core/engine/operateRuntime/runner/SnapshotAgentRuntimeAdapter';
import type {RuntimeStepResult} from '@core/engine/agentRuntime/runtime/AgentRuntime';
import type {ModelBindingV1, ModelEndpointProfileV1, ModelRole} from '@core/engine/operateRuntime/model/ModelProviderContracts';
import type {RuntimeConfigEnvelopeV1, RuntimeRouteConfigV1} from '@core/engine/operateRuntime/contracts/RuntimeConfigContracts';
import type {ResolvedOperateSessionV1} from '@core/engine/operateRuntime/contracts/OperateSessionContracts';
import {
  buildModelBinding,
  buildModelProfile,
  createFakeModelProviderRegistry,
  createFakeVisualAgentRegistry,
  dispatchCloudChat,
  visualAgentRoute,
  wireInMemoryAsyncStorage,
  type FakeProviderSpec,
  type FakeVisualAgentSpec,
} from './operateRuntimeTestKit';

type ChannelMode = 'cloud_direct' | 'cloud_split' | 'local_vision_cloud_planner';
type FrozenProvider = 'openai-compatible' | 'anthropic' | 'gemini' | 'custom';
type VisualAgentToolId = 'openclaw' | 'codex' | 'cursor' | 'dsh' | 'hermes';
type VisualAgentReadiness = 'disconnected' | 'ready';

interface RuntimeHarnessOptions {
  readonly mode?: ChannelMode;
  readonly provider?: FrozenProvider;
  readonly visualAgent?: {
    readonly toolId: VisualAgentToolId;
    readonly readiness: VisualAgentReadiness;
    readonly imageInput: boolean;
    readonly structuredAction: boolean;
    readonly profileId?: string;
    readonly sourceConfigRevision?: number;
  };
}

interface StartedTask {
  readonly kind: 'started';
  readonly taskId: string;
}
interface BlockedTask {
  readonly kind: 'blocked';
  readonly reason?: string;
}
type StartOutcome = StartedTask | BlockedTask;
interface CompletedOutcome {
  readonly status: 'success' | 'failed' | 'cancelled';
}

function resolveProviderSpec(provider: FrozenProvider | undefined): FakeProviderSpec {
  switch (provider) {
    case 'anthropic':
      return {mode: 'preset', preset: 'anthropic', transportAdapterId: 'anthropic'};
    case 'gemini':
      return {mode: 'preset', preset: 'gemini', transportAdapterId: 'gemini'};
    case 'custom':
      return {mode: 'custom', transportAdapterId: 'custom'};
    case 'openai-compatible':
    default:
      return {mode: 'preset', preset: 'openai', transportAdapterId: 'openai'};
  }
}

function cloudRoute(
  mode: ChannelMode,
  spec: FakeProviderSpec,
  profileModeByProfileId: Map<string, 'preset' | 'custom'>,
): RuntimeRouteConfigV1 {
  const profiles: ModelEndpointProfileV1[] = [];
  const bindings: ModelBindingV1[] = [];
  const addRole = (role: ModelRole, profileId: string) => {
    profiles.push(buildModelProfile(profileId, role, spec, profileModeByProfileId));
    bindings.push(buildModelBinding(role, profileId, `model:${role}`));
  };
  if (mode === 'cloud_direct') {
    addRole('direct', 'profile:direct');
  } else if (mode === 'cloud_split') {
    addRole('vision', 'profile:vision');
    addRole('split_planner', 'profile:planner');
  } else {
    addRole('local_planner', 'profile:planner');
  }
  return {
    capabilities: {phoneOperate: true, errands: false},
    privacy: {memoryEnabled: false, memoryLocation: 'device', memoryProfileId: null},
    modelAPI: {
      agentConfig: {
        version: 2,
        activeMode: mode,
        modeDrafts: {cloudDirect: {}, cloudSplit: {}, localVisionCloudPlanner: {localModelId: 'minicpm-v-4.6-q4'}},
        maxSteps: 5,
      },
      profiles,
      bindings,
    },
    visualAgent: {enabled: false, activeProfileId: null, profiles: []},
  };
}

export function createRuntimeHarness(options: RuntimeHarnessOptions) {
  wireInMemoryAsyncStorage();

  const direct = jest.fn();
  const perception = jest.fn();
  const planner = jest.fn();
  const local = jest.fn();

  const registryKit = createFakeModelProviderRegistry();
  const visualAgentRegistry = createFakeVisualAgentRegistry(
    options.visualAgent as FakeVisualAgentSpec | undefined,
  );

  let revision = options.visualAgent?.sourceConfigRevision ?? 1;
  const visualProfileId = options.visualAgent?.profileId ?? 'profile:visual';
  let active: RuntimeRouteConfigV1 = options.visualAgent
    ? visualAgentRoute(options.visualAgent, visualProfileId)
    : cloudRoute(options.mode ?? 'cloud_direct', resolveProviderSpec(options.provider), registryKit.profileModeByProfileId);

  let totalConfigReads = 0;
  const configRepository = {
    load: async (): Promise<RuntimeConfigEnvelopeV1> => {
      totalConfigReads += 1;
      return {schemaVersion: 1, revision, active, draft: active};
    },
  };

  const sessionStore = new OperateSessionStore();
  const resolver = new OperateSessionResolver({
    modelProviderRegistry: registryKit.registry,
    visualAgentToolRegistry: visualAgentRegistry,
    localEligibility: {check: async () => ({state: 'ready'})},
  });
  const runtime = new OperateRuntime({configRepository, sessionStore, resolver});

  const snapshotAgentRuntime: SnapshotAgentRuntimePort = {
    async decideStep(session: ResolvedOperateSessionV1, input): Promise<RuntimeStepResult> {
      if (session.channel === 'cloud_direct') {
        direct();
        await dispatchCloudChat(registryKit, session.modelBindings.direct!, input.signal);
      } else if (session.channel === 'cloud_split') {
        perception();
        await dispatchCloudChat(registryKit, session.modelBindings.vision!, input.signal);
        planner();
        await dispatchCloudChat(registryKit, session.modelBindings.planner!, input.signal);
      } else if (session.channel === 'local_vision_cloud_planner') {
        local();
        planner();
        await dispatchCloudChat(registryKit, session.modelBindings.planner!, input.signal);
      }
      return {
        decision: {
          schemaVersion: 1,
          subtaskId: 'harness-step',
          action: 'finish',
          expectedState: 'harness task complete',
          risk: 'low',
          requiresConfirmation: false,
        },
        taskAction: {type: 'complete', message: 'harness task complete', requiresConfirmation: false},
        diagnostics: {mode: session.channel as 'cloud_direct' | 'cloud_split' | 'local_vision_cloud_planner', durationMs: 0},
      };
    },
  };

  const instructionByTaskId = new Map<string, string>();
  const sessionByTaskId = new Map<string, ResolvedOperateSessionV1>();
  let taskCounter = 0;

  const ports: OperateTaskRunnerPorts = {
    instruction: {load: async taskId => instructionByTaskId.get(taskId) ?? null},
    screenshot: {capture: async () => 'data:image/png;base64,stub'},
    snapshotAgentRuntime,
    visualAgentRegistry,
    visualAgentImage: {capture: async () => ({mimeType: 'image/png', base64: '', sharingConfirmed: true})},
    visualAgentApproval: {decide: async () => 'approve'},
    action: {execute: jest.fn(async () => undefined)},
    confirmation: {confirm: jest.fn(async () => true)},
    history: {saveTask: async () => undefined, getTaskById: async () => null},
    events: {emit: async () => undefined},
    now: () => Date.now(),
    delay: async () => undefined,
  };
  const taskRunner = new OperateTaskRunner(ports);

  async function start(instruction: string): Promise<StartOutcome> {
    taskCounter += 1;
    const taskId = `task-${taskCounter}`;
    const created = await runtime.createSession({taskId});
    if (!created.ok) {
      return {kind: 'blocked', reason: created.code};
    }
    sessionByTaskId.set(taskId, created.session);
    instructionByTaskId.set(taskId, instruction);
    return {kind: 'started', taskId};
  }

  let liveConfigReadDuringRun = 0;

  async function startAndComplete(instruction: string): Promise<CompletedOutcome> {
    const outcome = await start(instruction);
    if (outcome.kind !== 'started') {
      throw new Error(`runtime_harness_blocked:${outcome.reason ?? 'unknown'}`);
    }
    const session = sessionByTaskId.get(outcome.taskId)!;
    const baseline = totalConfigReads;
    const claimed = await sessionStore.claim(outcome.taskId, session.sessionRevision, 'foreground');
    if (!claimed.ok) {
      throw new Error(`runtime_harness_claim_failed:${claimed.code}`);
    }
    const result = await taskRunner.run(claimed.lease);
    liveConfigReadDuringRun = totalConfigReads - baseline;
    return {status: result.kind};
  }

  function otherTransportCallCount(transportId: string): number {
    return Object.values(registryKit.transports)
      .filter(transport => transport.id !== transportId)
      .reduce((sum, transport) => sum + transport.sendChat.mock.calls.length, 0);
  }

  function liveConfigReadCountDuringRun(): number {
    return liveConfigReadDuringRun;
  }

  function allPipelineCalls(): number {
    return (
      direct.mock.calls.length +
      perception.mock.calls.length +
      planner.mock.calls.length +
      local.mock.calls.length
    );
  }

  async function saveAndActivateProfile(input: {toolId: VisualAgentToolId; profileId: string}): Promise<void> {
    revision += 1;
    active = visualAgentRoute(
      {toolId: input.toolId, readiness: 'ready', imageInput: true, structuredAction: true},
      input.profileId,
    );
  }

  async function readTaskProfileSnapshot(
    taskId: string,
  ): Promise<{toolId: VisualAgentToolId; profileId: string; sourceConfigRevision: number}> {
    const record = await sessionStore.load(taskId);
    if (!record || !record.session.visualAgent) {
      throw new Error('runtime_harness_no_visual_snapshot');
    }
    return {
      toolId: record.session.visualAgent.toolId as VisualAgentToolId,
      profileId: record.session.visualAgent.profileId,
      sourceConfigRevision: record.session.configRevision,
    };
  }

  return {
    direct,
    perception,
    planner,
    local,
    registry: {resolveTransport: registryKit.resolveTransportSpy},
    transports: registryKit.transports,
    start,
    startAndComplete,
    otherTransportCallCount,
    liveConfigReadCountDuringRun,
    allPipelineCalls,
    saveAndActivateProfile,
    readTaskProfileSnapshot,
  };
}
