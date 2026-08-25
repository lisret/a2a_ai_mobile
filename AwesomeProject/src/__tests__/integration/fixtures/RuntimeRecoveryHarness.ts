// Wave 4B Task 11 Step 3 fixture for `RuntimeRecoveryAndConcurrency.test.ts`'s
// "Scenarios needing the not-yet-built cross-module runtime harness" section.
//
// Each method below composes the real production class that already owns
// the invariant under test (`OperateSessionStore` for leasing/snapshot
// immutability, `ScopedTaskUiEvents` for duplicate-sequence dedup,
// `DefaultModelConfigFacade` for requestGeneration acceptance) with
// deterministic fakes; no production source is edited.
import {OperateRuntime} from '@core/engine/operateRuntime/OperateRuntime';
import {OperateSessionStore} from '@core/engine/operateRuntime/session/OperateSessionStore';
import {OperateSessionResolver} from '@core/engine/operateRuntime/session/OperateSessionResolver';
import {OperateTaskRunner} from '@core/engine/operateRuntime/runner/OperateTaskRunner';
import type {OperateTaskRunnerPorts} from '@core/engine/operateRuntime/runner/OperateTaskPorts';
import {DefaultModelConfigFacade} from '../../../application/facades/ModelConfigFacade';
import {ScopedTaskUiEvents} from '../../../application/events/ScopedTaskUiEvents';
import type {
  ModelConfigApplicationPort,
  ModelCatalogRefreshInput,
  TaskUiEvent,
  TaskUiEventSource,
} from '../../../application/facades/UiRuntimeContracts';
import type {RuntimeConfigEnvelopeV1, RuntimeRouteConfigV1} from '@core/engine/operateRuntime/contracts/RuntimeConfigContracts';
import {
  buildModelBinding,
  buildModelProfile,
  createFakeModelProviderRegistry,
  createFakeVisualAgentRegistry,
  dispatchCloudChat,
  wireInMemoryAsyncStorage,
} from './operateRuntimeTestKit';

interface RecoveryRuntimeHarness {
  createSessionThenMutateActiveConfig(taskId: string): Promise<{boundProfileId: string}>;
  consumeDuplicatedUiSequence(sequence: number): Promise<{consumedCount: number}>;
  leaseDueTaskAcrossTwoSweeps(taskId: string): Promise<{leaseCount: number}>;
  rapidlySwitchModelCatalog(generations: readonly number[]): Promise<{
    acceptedGeneration: number;
    foldedStatusCount: number;
  }>;
  scanViewStateAndTraceForPlaintext(): Promise<{plaintextMatches: readonly string[]}>;
}

function cloudDirectRoute(
  profileModeByProfileId: Map<string, 'preset' | 'custom'>,
  profileId: string,
): RuntimeRouteConfigV1 {
  const profile = buildModelProfile(
    profileId,
    'direct',
    {mode: 'preset', preset: 'openai', transportAdapterId: 'openai'},
    profileModeByProfileId,
  );
  const binding = buildModelBinding('direct', profileId, `model:${profileId}`);
  return {
    capabilities: {phoneOperate: true, errands: false},
    privacy: {memoryEnabled: false, memoryLocation: 'device', memoryProfileId: null},
    modelAPI: {
      agentConfig: {
        version: 2,
        activeMode: 'cloud_direct',
        modeDrafts: {cloudDirect: {}, cloudSplit: {}, localVisionCloudPlanner: {localModelId: 'minicpm-v-4.6-q4'}},
        maxSteps: 5,
      },
      profiles: [profile],
      bindings: [binding],
    },
    visualAgent: {enabled: false, activeProfileId: null, profiles: []},
  };
}

async function createSessionThenMutateActiveConfig(taskId: string): Promise<{boundProfileId: string}> {
  wireInMemoryAsyncStorage();
  const registryKit = createFakeModelProviderRegistry();
  let active = cloudDirectRoute(registryKit.profileModeByProfileId, 'profile:direct');
  const configRepository = {
    load: async (): Promise<RuntimeConfigEnvelopeV1> => ({schemaVersion: 1, revision: 1, active, draft: active}),
  };
  const resolver = new OperateSessionResolver({
    modelProviderRegistry: registryKit.registry,
    visualAgentToolRegistry: createFakeVisualAgentRegistry(undefined),
    localEligibility: {check: async () => ({state: 'ready'})},
  });
  const runtime = new OperateRuntime({configRepository, sessionStore: new OperateSessionStore(), resolver});

  const created = await runtime.createSession({taskId});
  if (!created.ok) {
    throw new Error(`fixture_session_create_failed:${created.code}`);
  }
  const boundProfileId = created.session.modelBindings.direct!.profileId;

  // Mutating "active" after the session was created must never change the
  // already-frozen snapshot bound to this taskId.
  active = cloudDirectRoute(registryKit.profileModeByProfileId, 'profile:mutated-after-create');

  return {boundProfileId};
}

async function consumeDuplicatedUiSequence(sequence: number): Promise<{consumedCount: number}> {
  const listeners: Array<(event: TaskUiEvent) => void> = [];
  const source: TaskUiEventSource = {
    subscribe(listener) {
      listeners.push(listener);
      return () => undefined;
    },
  };
  const scoped = new ScopedTaskUiEvents(source);
  let consumedCount = 0;
  scoped.subscribe('task-duplicated-sequence', 1, () => {
    consumedCount += 1;
  });

  const event: TaskUiEvent = {
    taskId: 'task-duplicated-sequence',
    sessionRevision: 1,
    sequence,
    occurredAtMs: Date.now(),
    type: 'step_completed',
    step: 1,
    actionLabel: 'tap',
  };
  listeners.forEach(listener => listener(event));
  listeners.forEach(listener => listener(event));

  return {consumedCount};
}

async function leaseDueTaskAcrossTwoSweeps(taskId: string): Promise<{leaseCount: number}> {
  wireInMemoryAsyncStorage();
  const registryKit = createFakeModelProviderRegistry();
  const active = cloudDirectRoute(registryKit.profileModeByProfileId, 'profile:due');
  const configRepository = {
    load: async (): Promise<RuntimeConfigEnvelopeV1> => ({schemaVersion: 1, revision: 1, active, draft: active}),
  };
  const sessionStore = new OperateSessionStore();
  const resolver = new OperateSessionResolver({
    modelProviderRegistry: registryKit.registry,
    visualAgentToolRegistry: createFakeVisualAgentRegistry(undefined),
    localEligibility: {check: async () => ({state: 'ready'})},
  });
  const runtime = new OperateRuntime({configRepository, sessionStore, resolver});
  const created = await runtime.createSession({taskId});
  if (!created.ok) {
    throw new Error(`fixture_session_create_failed:${created.code}`);
  }

  // Two concurrent due-sweep passes both try to lease the same due task
  // headlessly; `OperateSessionStore.claim` is the real mutual-exclusion
  // gate that must grant exactly one lease.
  const [first, second] = await Promise.all([
    sessionStore.claim(taskId, created.session.sessionRevision, 'headless'),
    sessionStore.claim(taskId, created.session.sessionRevision, 'headless'),
  ]);
  const leaseCount = [first, second].filter(result => result.ok).length;
  return {leaseCount};
}

async function rapidlySwitchModelCatalog(
  generations: readonly number[],
): Promise<{acceptedGeneration: number; foldedStatusCount: number}> {
  const maxGeneration = Math.max(...generations);
  const unused = async (): Promise<never> => {
    throw new Error('fixture_model_config_port_method_unused');
  };
  const port: ModelConfigApplicationPort = {
    read: unused,
    readList: unused,
    fetchCatalog: async input => {
      // Reverses arrival order on purpose: the lowest generation resolves
      // last, so only `DefaultModelConfigFacade`'s requestGeneration guard
      // (not arrival order) may decide which result is accepted.
      const delayMs = (maxGeneration - input.requestGeneration) * 5;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return {requestGeneration: input.requestGeneration, status: 'ready', models: []};
    },
    save: unused,
    selectBinding: unused,
    deleteBinding: unused,
  };
  const facade = new DefaultModelConfigFacade(port);
  const refreshInput = (generation: number): ModelCatalogRefreshInput => ({
    list: 'unified',
    requestGeneration: generation,
    credential: {action: 'keep'},
    mode: 'preset',
    presetId: 'openai',
    baseUrlOverride: null,
  });

  const results = await Promise.all(generations.map(generation => facade.refreshCatalog(refreshInput(generation))));
  const nonStale = results.filter(result => result.status !== 'stale');
  const acceptedGeneration = Math.max(...nonStale.map(result => result.requestGeneration));
  const foldedStatusCount = results.filter(
    result => result.status !== 'stale' && result.requestGeneration !== acceptedGeneration,
  ).length;
  return {acceptedGeneration, foldedStatusCount};
}

async function scanViewStateAndTraceForPlaintext(): Promise<{plaintextMatches: readonly string[]}> {
  wireInMemoryAsyncStorage();
  const registryKit = createFakeModelProviderRegistry();
  const active = cloudDirectRoute(registryKit.profileModeByProfileId, 'profile:trace-scan');
  const configRepository = {
    load: async (): Promise<RuntimeConfigEnvelopeV1> => ({schemaVersion: 1, revision: 1, active, draft: active}),
  };
  const sessionStore = new OperateSessionStore();
  const resolver = new OperateSessionResolver({
    modelProviderRegistry: registryKit.registry,
    visualAgentToolRegistry: createFakeVisualAgentRegistry(undefined),
    localEligibility: {check: async () => ({state: 'ready'})},
  });
  const runtime = new OperateRuntime({configRepository, sessionStore, resolver});
  const taskId = 'task-trace-scan';
  const created = await runtime.createSession({taskId});
  if (!created.ok) {
    throw new Error(`fixture_session_create_failed:${created.code}`);
  }

  const capturedEvents: unknown[] = [];
  const capturedTasks: unknown[] = [];
  const ports: OperateTaskRunnerPorts = {
    instruction: {load: async () => '打开设置'},
    screenshot: {capture: async () => 'data:image/png;base64,stub-not-persisted'},
    snapshotAgentRuntime: {
      decideStep: async () => {
        await dispatchCloudChat(registryKit, created.session.modelBindings.direct!, new AbortController().signal);
        return {
          decision: {
            schemaVersion: 1,
            subtaskId: 'trace-scan',
            action: 'finish',
            expectedState: 'trace scan complete',
            risk: 'low',
            requiresConfirmation: false,
          },
          taskAction: {type: 'complete', message: 'trace scan complete', requiresConfirmation: false},
          diagnostics: {mode: 'cloud_direct', durationMs: 0},
        };
      },
    },
    visualAgentRegistry: createFakeVisualAgentRegistry(undefined),
    visualAgentImage: {capture: async () => ({mimeType: 'image/png', base64: '', sharingConfirmed: true})},
    visualAgentApproval: {decide: async () => 'approve'},
    action: {execute: async () => undefined},
    confirmation: {confirm: async () => true},
    history: {
      saveTask: async task => {
        capturedTasks.push(task);
      },
      getTaskById: async () => null,
    },
    events: {
      emit: async event => {
        capturedEvents.push(event);
      },
    },
    now: () => Date.now(),
    delay: async () => undefined,
  };
  const runner = new OperateTaskRunner(ports);
  const claimed = await sessionStore.claim(taskId, created.session.sessionRevision, 'foreground');
  if (!claimed.ok) {
    throw new Error(`fixture_claim_failed:${claimed.code}`);
  }
  await runner.run(claimed.lease);

  const serializedTrace = JSON.stringify([...capturedEvents, ...capturedTasks]);
  const leakPattern =
    /apiKey|Authorization|Bearer\s+[A-Za-z0-9._-]+|data:image\/[a-z]+;base64,[A-Za-z0-9+/=]{16,}|secret:[A-Za-z0-9:_-]+/g;
  const plaintextMatches = Array.from(new Set(serializedTrace.match(leakPattern) ?? []));
  return {plaintextMatches};
}

export function createRuntimeHarness(): RecoveryRuntimeHarness {
  return {
    createSessionThenMutateActiveConfig,
    consumeDuplicatedUiSequence,
    leaseDueTaskAcrossTwoSweeps,
    rapidlySwitchModelCatalog,
    scanViewStateAndTraceForPlaintext,
  };
}
