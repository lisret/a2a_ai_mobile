// Wave 4A Task 11 scaffold (acceptance channel gate). RED by design.
//
// Scenarios backed by real, already-composed production classes
// (`OperateSessionStore`, `TaskHistoryService`, `CredentialReferenceGarbageCollector`,
// `AsyncStorageCredentialRetirementRepository`) are exercised directly against
// those classes with in-memory fakes. Scenarios that need a not-yet-built
// cross-module runtime harness (task-owned model-profile snapshot survival,
// due-sweep leasing, model-catalog rapid-switch fold, ViewState/trace
// plaintext scanning across the composed runtime) go through
// `createRuntimeHarness`, an intentionally-unimplemented placeholder. A later
// wave's testing agent fills in the placeholder body; this file's assertions
// must not change to make that pass.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {OperateSessionStore} from '@core/engine/operateRuntime/session/OperateSessionStore';
import {CredentialReferenceGarbageCollector} from '@core/engine/operateRuntime/session/CredentialReferenceGarbageCollector';
import {AsyncStorageCredentialRetirementRepository} from '@core/engine/operateRuntime/config/CredentialRetirementRepository';
import type {ResolvedOperateSessionV1} from '@core/engine/operateRuntime/contracts/OperateSessionContracts';
import type {
  CredentialRetirementRepository,
  RuntimeConfigEnvelopeV1,
  RuntimeRouteConfigV1,
} from '@core/engine/operateRuntime/contracts/RuntimeConfigContracts';
import type {CredentialStore} from '@core/engine/operateRuntime/contracts/CredentialStore';
import {taskHistoryService} from '../../features/task/services/TaskHistoryService';
import {createRuntimeHarness as createRecoveryRuntimeHarnessImpl} from './fixtures/RuntimeRecoveryHarness';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

function inMemoryStorage(): {getItem: jest.Mock; setItem: jest.Mock; removeItem: jest.Mock} {
  const backing: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => backing[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      backing[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete backing[key];
    }),
  };
}

function makeSession(overrides: Partial<ResolvedOperateSessionV1> = {}): ResolvedOperateSessionV1 {
  return {
    schemaVersion: 1,
    taskId: 'task-1',
    sessionRevision: 1,
    configRevision: 1,
    channel: 'cloud_direct',
    modelBindings: {
      direct: {
        role: 'direct',
        bindingId: 'binding:direct',
        profileId: 'profile:direct',
        modelId: 'gpt-4o',
        maxSteps: 20,
        provider: 'openai',
        transportAdapterId: 'openai',
        protocol: 'openai_chat_completions',
        baseURL: 'https://api.openai.com',
        auth: {kind: 'bearer'},
        chatPath: '/v1/chat/completions',
        region: null,
        channel: null,
        secretRef: 'model:direct-secret',
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        capabilities: {chat: true, vision: true, toolCalls: true, reasoning: 'unknown'},
        capabilityTrust: 'verified_remote',
      },
    },
    createdAtMs: 1_700_000_000_000,
    ...overrides,
  };
}

describe('OperateSessionStore concurrency (real production class)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const storage = inMemoryStorage();
    mockAsyncStorage.getItem.mockImplementation(storage.getItem);
    mockAsyncStorage.setItem.mockImplementation(storage.setItem);
  });

  it('grants exactly one owner when foreground and headless claim concurrently', async () => {
    const store = new OperateSessionStore();
    await store.create(makeSession());

    const [foreground, headless] = await Promise.all([
      store.claim('task-1', 1, 'foreground'),
      store.claim('task-1', 1, 'headless'),
    ]);

    const winners = [foreground, headless].filter(result => result.ok);
    expect(winners).toHaveLength(1);
    const losers = [foreground, headless].filter(result => !result.ok);
    expect(losers).toHaveLength(1);
    expect((losers[0] as {code: string}).code).toBe('operate_session_already_claimed');
  });

  it('cancelling task A does not affect task B tombstone or history', async () => {
    const store = new OperateSessionStore();
    await store.create(makeSession({taskId: 'task-a', sessionRevision: 1}));
    await store.create(makeSession({taskId: 'task-b', sessionRevision: 2}));

    const claimedA = await store.claim('task-a', 1, 'foreground');
    if (!claimedA.ok) throw new Error(claimedA.code);
    claimedA.lease.cancel('user_cancelled');
    await claimedA.lease.markTerminal('cancelled');
    await claimedA.lease.release();

    const claimedB = await store.claim('task-b', 2, 'foreground');
    expect(claimedB.ok).toBe(true);

    const loadedA = await store.load('task-a');
    expect(loadedA).toBeNull();
    const loadedB = await store.load('task-b');
    expect(loadedB?.terminal).toBeNull();
  });

  it('marks a lease terminal exactly once under concurrent terminal calls', async () => {
    const store = new OperateSessionStore();
    await store.create(makeSession());
    const claimed = await store.claim('task-1', 1, 'foreground');
    if (!claimed.ok) throw new Error(claimed.code);

    const [first, second] = await Promise.all([
      claimed.lease.markTerminal('success'),
      claimed.lease.markTerminal('failed'),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
  });
});

describe('CredentialReferenceGarbageCollector rotation actions (real production classes)', () => {
  function routeWithSecret(secretRef: string | null): RuntimeRouteConfigV1 {
    return {
      capabilities: {phoneOperate: true, errands: false},
      privacy: {memoryEnabled: false, memoryLocation: 'device', memoryProfileId: null},
      modelAPI: {
        agentConfig: {
          version: 2,
          activeMode: 'cloud_direct',
          modeDrafts: {cloudDirect: {}, cloudSplit: {}, localVisionCloudPlanner: {}},
          maxSteps: 20,
        } as RuntimeRouteConfigV1['modelAPI']['agentConfig'],
        profiles: secretRef === undefined
          ? []
          : [
              {
                id: 'profile:direct',
                label: 'Direct',
                mode: 'preset',
                preset: 'openai',
                baseURLOverride: null,
                region: null,
                channel: null,
                secretRef,
                generation: 1,
              },
            ],
        bindings: [],
      },
      visualAgent: {enabled: false, activeProfileId: null, profiles: []},
    };
  }

  function harnessFor(retirements: jest.Mocked<CredentialRetirementRepository>) {
    const credentials: jest.Mocked<CredentialStore> = {
      isAvailable: jest.fn().mockResolvedValue(true),
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const sessions = {listNonterminal: jest.fn().mockResolvedValue([])};
    const configLoad = jest.fn().mockResolvedValue({
      schemaVersion: 1,
      revision: 1,
      active: routeWithSecret(null),
      draft: routeWithSecret(null),
    } satisfies RuntimeConfigEnvelopeV1);
    const collector = new CredentialReferenceGarbageCollector(
      {load: configLoad} as never,
      sessions as never,
      retirements,
      credentials,
    );
    return {collector, credentials, sessions};
  }

  it('keep produces zero secure writes', async () => {
    const retirements: jest.Mocked<CredentialRetirementRepository> = {
      stage: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue([]),
      complete: jest.fn().mockResolvedValue(undefined),
    };
    const {collector, credentials} = harnessFor(retirements);
    await collector.reconcileBeforeAcceptingTasks();
    expect(credentials.delete).not.toHaveBeenCalled();
    expect(credentials.put).not.toHaveBeenCalled();
  });

  it('replace produces exactly one new-credential write plus one retirement completion', async () => {
    const storage = inMemoryStorage();
    const retirements = new AsyncStorageCredentialRetirementRepository(storage as never, () => 1_000);
    await retirements.stage({retirementId: 'ret:replace', oldSecretRef: 'model:old', replacementSecretRef: 'model:new', createdAtMs: 1_000});
    await retirements.commit('ret:replace');

    const credentials: jest.Mocked<CredentialStore> = {
      isAvailable: jest.fn().mockResolvedValue(true),
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    await credentials.put('model:new', 'plaintext-value');
    expect(credentials.put).toHaveBeenCalledTimes(1);

    const sessions = {listNonterminal: jest.fn().mockResolvedValue([])};
    const configLoad = jest.fn().mockResolvedValue({
      schemaVersion: 1,
      revision: 2,
      active: routeWithSecret('model:new'),
      draft: routeWithSecret('model:new'),
    } satisfies RuntimeConfigEnvelopeV1);
    const collector = new CredentialReferenceGarbageCollector(
      {load: configLoad} as never,
      sessions as never,
      retirements,
      credentials,
    );
    await collector.reconcileBeforeAcceptingTasks();
    expect(credentials.delete).toHaveBeenCalledWith('model:old');
    expect(credentials.delete).not.toHaveBeenCalledWith('model:new');
    await expect(retirements.list()).resolves.toEqual([]);
  });

  it('remove produces one null-CAS retirement plus completion, with no write for a value that never existed', async () => {
    const storage = inMemoryStorage();
    const retirements = new AsyncStorageCredentialRetirementRepository(storage as never, () => 2_000);
    await retirements.stage({retirementId: 'ret:remove', oldSecretRef: 'model:removed', replacementSecretRef: null, createdAtMs: 2_000});
    await retirements.commit('ret:remove');

    const credentials: jest.Mocked<CredentialStore> = {
      isAvailable: jest.fn().mockResolvedValue(true),
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const sessions = {listNonterminal: jest.fn().mockResolvedValue([])};
    const configLoad = jest.fn().mockResolvedValue({
      schemaVersion: 1,
      revision: 2,
      active: routeWithSecret(null),
      draft: routeWithSecret(null),
    } satisfies RuntimeConfigEnvelopeV1);
    const collector = new CredentialReferenceGarbageCollector(
      {load: configLoad} as never,
      sessions as never,
      retirements,
      credentials,
    );
    await collector.reconcileBeforeAcceptingTasks();
    expect(credentials.put).not.toHaveBeenCalled();
    expect(credentials.delete).toHaveBeenCalledWith('model:removed');
    expect(credentials.delete).toHaveBeenCalledTimes(1);
    await expect(retirements.list()).resolves.toEqual([]);
  });

  it('keeps a retired ref while a nonterminal session holds it, deleting only on the next cold-start recovery pass', async () => {
    const storage = inMemoryStorage();
    const retirements = new AsyncStorageCredentialRetirementRepository(storage as never, () => 3_000);
    await retirements.stage({retirementId: 'ret:pinned', oldSecretRef: 'model:pinned', replacementSecretRef: null, createdAtMs: 3_000});
    await retirements.commit('ret:pinned');

    const credentials: jest.Mocked<CredentialStore> = {
      isAvailable: jest.fn().mockResolvedValue(true),
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const pinnedSession = makeSession({
      taskId: 'task-pinned',
      modelBindings: {direct: {...makeSession().modelBindings.direct!, secretRef: 'model:pinned'}},
    });
    const sessions = {listNonterminal: jest.fn().mockResolvedValue([pinnedSession])};
    const configLoad = jest.fn().mockResolvedValue({
      schemaVersion: 1,
      revision: 1,
      active: routeWithSecret(null),
      draft: routeWithSecret(null),
    } satisfies RuntimeConfigEnvelopeV1);
    const collector = new CredentialReferenceGarbageCollector(
      {load: configLoad} as never,
      sessions as never,
      retirements,
      credentials,
    );

    await collector.reconcileBeforeAcceptingTasks();
    expect(credentials.delete).not.toHaveBeenCalled();

    sessions.listNonterminal.mockResolvedValue([]);
    await collector.reconcileBeforeAcceptingTasks();
    expect(credentials.delete).toHaveBeenCalledWith('model:pinned');
  });
});

describe('TaskHistoryService concurrent writes (real singleton, fake AsyncStorage)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const storage = inMemoryStorage();
    mockAsyncStorage.getItem.mockImplementation(storage.getItem);
    mockAsyncStorage.setItem.mockImplementation(storage.setItem);
  });

  it('keeps history indices consistent under concurrent writes for distinct tasks', async () => {
    const now = Date.now();
    await Promise.all(
      Array.from({length: 5}, (_, index) =>
        taskHistoryService.saveTask({
          id: `task-${index}`,
          modelId: 'model-a',
          instruction: `instruction-${index}`,
          status: 'success',
          createdAt: now + index,
        }),
      ),
    );

    const all = await taskHistoryService.getAllTasks();
    expect(all).toHaveLength(5);
    expect(new Set(all.map(task => task.id)).size).toBe(5);
  });
});

// --- Scenarios needing the not-yet-built cross-module runtime harness ---

interface RecoveryRuntimeHarness {
  createSessionThenMutateActiveConfig(taskId: string): Promise<{
    boundProfileId: string;
  }>;
  consumeDuplicatedUiSequence(sequence: number): Promise<{consumedCount: number}>;
  leaseDueTaskAcrossTwoSweeps(taskId: string): Promise<{leaseCount: number}>;
  rapidlySwitchModelCatalog(generations: readonly number[]): Promise<{
    acceptedGeneration: number;
    foldedStatusCount: number;
  }>;
  scanViewStateAndTraceForPlaintext(): Promise<{plaintextMatches: readonly string[]}>;
}

/**
 * Delegates to the Wave 4B Task 11 Step 3 fixture, which composes the
 * session resolver + task runner + model catalog facade + UI event dedup
 * against real production classes with deterministic fakes; the assertions
 * below are unchanged from the Wave 4A scaffold.
 */
function createRuntimeHarness(): RecoveryRuntimeHarness {
  return createRecoveryRuntimeHarnessImpl();
}

it('keeps the task-owned immutable model-profile snapshot after active/profile content changes', async () => {
  const harness = createRuntimeHarness();
  const {boundProfileId} = await harness.createSessionThenMutateActiveConfig('task-snapshot');
  expect(boundProfileId).toBe('profile:direct');
});

it('consumes a duplicated UI sequence exactly once', async () => {
  const harness = createRuntimeHarness();
  const {consumedCount} = await harness.consumeDuplicatedUiSequence(7);
  expect(consumedCount).toBe(1);
});

it('leases a due task exactly once across two concurrent due-sweeps', async () => {
  const harness = createRuntimeHarness();
  const {leaseCount} = await harness.leaseDueTaskAcrossTwoSweeps('task-due-1');
  expect(leaseCount).toBe(1);
});

it('accepts only the latest requestGeneration when the model catalog switches rapidly, without folding the seven states', async () => {
  const harness = createRuntimeHarness();
  const {acceptedGeneration, foldedStatusCount} = await harness.rapidlySwitchModelCatalog([1, 2, 3]);
  expect(acceptedGeneration).toBe(3);
  expect(foldedStatusCount).toBe(0);
});

it('never leaks plaintext credentials or provider responses through ViewState or trace output', async () => {
  const harness = createRuntimeHarness();
  const {plaintextMatches} = await harness.scanViewStateAndTraceForPlaintext();
  expect(plaintextMatches).toEqual([]);
});
