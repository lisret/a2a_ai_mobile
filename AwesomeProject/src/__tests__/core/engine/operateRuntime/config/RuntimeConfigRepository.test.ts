import {AsyncStorageRuntimeConfigRepository} from '../../../../../core/engine/operateRuntime/config/RuntimeConfigRepository';
import {RUNTIME_STORAGE_KEYS} from '../../../../../core/engine/operateRuntime/config/RuntimeConfigStorageKeys';
import {DEFAULT_AGENT_CONFIG_V2} from '../../../../../core/engine/operateRuntime/config/RuntimeConfigValidation';
import type {
  CredentialRetirementRepository,
  RuntimeConfigEnvelopeV1,
  RuntimeRouteConfigV1,
} from '../../../../../core/engine/operateRuntime/contracts/RuntimeConfigContracts';
import type {CredentialStore} from '../../../../../core/engine/operateRuntime/contracts/CredentialStore';
import type {ModelEndpointProfileV1} from '../../../../../core/engine/operateRuntime/model/ModelProviderContracts';
import type {
  VisualAgentCapabilitySet,
  VisualAgentProfileV1,
} from '../../../../../core/engine/operateRuntime/visualAgent/VisualAgentContracts';

const fullCaps = (over: Partial<VisualAgentCapabilitySet> = {}): VisualAgentCapabilitySet => ({
  imageInput: true,
  structuredAction: true,
  stream: true,
  cancel: true,
  approval: true,
  resume: true,
  steer: true,
  preferences: true,
  ...over,
});

const visualProfile = (over: Partial<VisualAgentProfileV1> = {}): VisualAgentProfileV1 => ({
  schemaVersion: 1,
  profileId: 'v1',
  toolId: 'openclaw',
  enabled: true,
  connector: {
    kind: 'connector_bridge',
    bridgeUrl: 'wss://bridge.example/socket',
    bindingId: 'binding-1',
    secretRef: null,
  },
  requestedCapabilities: fullCaps(),
  ...over,
});

const presetProfile: ModelEndpointProfileV1 = {
  id: 'p1',
  label: 'OpenAI',
  mode: 'preset',
  preset: 'openai',
  baseURLOverride: null,
  region: null,
  channel: null,
  secretRef: 'model:old',
  generation: 1,
};

const routeWith = (over: Partial<RuntimeRouteConfigV1> = {}): RuntimeRouteConfigV1 => ({
  capabilities: {phoneOperate: false, errands: false},
  privacy: {memoryEnabled: false, memoryLocation: 'device', memoryProfileId: null},
  modelAPI: {agentConfig: DEFAULT_AGENT_CONFIG_V2, profiles: [presetProfile], bindings: []},
  visualAgent: {enabled: false, activeProfileId: null, profiles: [visualProfile()]},
  ...over,
});

const seededEnvelope = (revision: number): RuntimeConfigEnvelopeV1 => {
  const route = routeWith();
  return {schemaVersion: 1, revision, active: route, draft: route};
};

const makeStorage = (initial?: RuntimeConfigEnvelopeV1) => {
  const store: Record<string, string> = {};
  if (initial) {
    store[RUNTIME_STORAGE_KEYS.RUNTIME_CONFIG_V1] = JSON.stringify(initial);
  }
  return {
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
  };
};

const makeRetirements = (): jest.Mocked<CredentialRetirementRepository> => ({
  stage: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  list: jest.fn().mockResolvedValue([]),
  complete: jest.fn().mockResolvedValue(undefined),
});

let idCounter = 0;
const makeRepo = (
  storage: ReturnType<typeof makeStorage>,
  overrides: Partial<{
    credentials: CredentialStore;
    retirements: CredentialRetirementRepository;
    catalogCache: {deleteProfile: jest.Mock};
  }> = {},
) =>
  new AsyncStorageRuntimeConfigRepository({
    storage,
    credentials:
      overrides.credentials ?? {
        isAvailable: jest.fn().mockResolvedValue(true),
        put: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue(undefined),
      },
    retirements: overrides.retirements ?? makeRetirements(),
    now: () => 1_000,
    newId: () => `id-${(idCounter += 1)}`,
    catalogCache: overrides.catalogCache ?? {deleteProfile: jest.fn().mockResolvedValue(undefined)},
  });

describe('AsyncStorageRuntimeConfigRepository', () => {
  it('does not change visualAgent when a model binding is activated', async () => {
    const repo = makeRepo(makeStorage(seededEnvelope(0)));
    const before = await repo.load();
    await repo.compareAndActivate(before.revision, active => ({
      ...active,
      modelAPI: {
        ...active.modelAPI,
        bindings: [
          {id: 'b1', role: 'split_planner', profileId: 'p1', modelId: 'gpt-4o', maxSteps: 8},
        ],
      },
    }));
    const after = await repo.load();
    expect(after.active.visualAgent).toEqual(before.active.visualAgent);
    expect(after.revision).toBe(1);
  });

  it('rejects an envelope carrying a smuggled credential key', async () => {
    const storage = makeStorage();
    storage.getItem.mockResolvedValue(
      JSON.stringify({schemaVersion: 1, revision: 0, active: {apiKey: 'x'}, draft: {}}),
    );
    const repo = makeRepo(storage);
    await expect(repo.load()).rejects.toMatchObject({code: 'runtime_config_corrupt'});
  });

  it('rejects activating an operation-ineligible visual profile', async () => {
    const repo = makeRepo(makeStorage(seededEnvelope(0)));
    await expect(
      repo.compareAndActivate(0, active => ({
        ...active,
        visualAgent: {
          enabled: true,
          activeProfileId: 'v1',
          profiles: [visualProfile({requestedCapabilities: fullCaps({imageInput: false})})],
        },
      })),
    ).rejects.toMatchObject({code: 'visual_agent_capability_unsupported'});
  });

  it('permits exactly one winner for a concurrent compare-and-activate', async () => {
    const repo = makeRepo(makeStorage(seededEnvelope(0)));
    const mutate = (steps: number) => (active: RuntimeRouteConfigV1) => ({
      ...active,
      modelAPI: {...active.modelAPI, agentConfig: {...active.modelAPI.agentConfig, maxSteps: steps}},
    });
    const results = await Promise.allSettled([
      repo.compareAndActivate(0, mutate(11)),
      repo.compareAndActivate(0, mutate(22)),
    ]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'runtime_config_conflict',
    });
  });

  it('stages before the secure put and commits after the config write, never deleting the live ref', async () => {
    const storage = makeStorage(seededEnvelope(3));
    const retirements = makeRetirements();
    const credentials: CredentialStore = {
      isAvailable: jest.fn().mockResolvedValue(true),
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue('new-secret'),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const repo = makeRepo(storage, {retirements, credentials});
    await repo.putProfile({...presetProfile}, 'new-secret');

    expect(retirements.stage).toHaveBeenCalledWith(
      expect.objectContaining({
        oldSecretRef: 'model:old',
        replacementSecretRef: expect.stringMatching(/^model:/),
      }),
    );
    const stageOrder = (retirements.stage as jest.Mock).mock.invocationCallOrder[0];
    const putOrder = (credentials.put as jest.Mock).mock.invocationCallOrder[0];
    const commitOrder = (retirements.commit as jest.Mock).mock.invocationCallOrder[0];
    const writeOrder = (storage.setItem as jest.Mock).mock.invocationCallOrder.at(-1)!;
    expect(stageOrder).toBeLessThan(putOrder);
    expect(commitOrder).toBeGreaterThan(writeOrder);
    expect(credentials.delete).not.toHaveBeenCalledWith('model:old');
  });

  it('rolls back the newly staged secret when the secure readback fails', async () => {
    const storage = makeStorage(seededEnvelope(3));
    const retirements = makeRetirements();
    const credentials: CredentialStore = {
      isAvailable: jest.fn().mockResolvedValue(true),
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValueOnce('WRONG').mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const repo = makeRepo(storage, {retirements, credentials});
    await expect(repo.putProfile({...presetProfile}, 'new-secret')).rejects.toThrow();
    expect(credentials.delete).toHaveBeenCalledTimes(1);
    expect(retirements.rollback).toHaveBeenCalledTimes(1);
    expect(credentials.delete).not.toHaveBeenCalledWith('model:old');
  });

  it('rejects removing a profile that is still referenced by a binding', async () => {
    const route = routeWith({
      modelAPI: {
        agentConfig: DEFAULT_AGENT_CONFIG_V2,
        profiles: [presetProfile],
        bindings: [{id: 'b1', role: 'direct', profileId: 'p1', modelId: 'gpt-4o', maxSteps: 5}],
      },
    });
    const repo = makeRepo(
      makeStorage({schemaVersion: 1, revision: 2, active: route, draft: route}),
    );
    await expect(repo.removeProfile('p1')).rejects.toMatchObject({
      code: 'model_profile_in_use',
    });
  });
});
