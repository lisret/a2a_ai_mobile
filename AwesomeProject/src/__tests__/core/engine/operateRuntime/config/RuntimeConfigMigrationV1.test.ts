import {
  LEGACY_KEYS,
  RuntimeConfigMigrationV1,
} from '../../../../../core/engine/operateRuntime/config/RuntimeConfigMigrationV1';
import {RUNTIME_STORAGE_KEYS} from '../../../../../core/engine/operateRuntime/config/RuntimeConfigStorageKeys';
import type {CredentialStore} from '../../../../../core/engine/operateRuntime/contracts/CredentialStore';
import type {LegacyOpenClawBindingPort} from '../../../../../core/engine/operateRuntime/config/LegacyOpenClawBindingPort';

const makeStorage = (seed: Record<string, string>) => {
  const store: Record<string, string> = {...seed};
  return {
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
    peek: () => store,
  };
};

const makeCredentials = (): CredentialStore => {
  const store = new Map<string, string>();
  return {
    isAvailable: jest.fn().mockResolvedValue(true),
    put: jest.fn(async (ref: string, value: string) => {
      store.set(ref, value);
    }),
    get: jest.fn(async (ref: string) => store.get(ref) ?? null),
    delete: jest.fn(async (ref: string) => {
      store.delete(ref);
    }),
  };
};

const makeOpenClawPort = (): jest.Mocked<LegacyOpenClawBindingPort> => ({
  read: jest.fn(),
  stage: jest
    .fn()
    .mockResolvedValue({stageId: 's-1', bridgeSecretRef: 'visual-agent-bridge:legacy-openclaw-gateway'}),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
});

let ids = 0;
const makeMigration = (
  storage: ReturnType<typeof makeStorage>,
  overrides: Partial<{credentials: CredentialStore; legacyOpenClaw: jest.Mocked<LegacyOpenClawBindingPort>}> = {},
) =>
  new RuntimeConfigMigrationV1({
    storage,
    credentials: overrides.credentials ?? makeCredentials(),
    legacyOpenClaw: overrides.legacyOpenClaw ?? makeOpenClawPort(),
    bridgeUrl: 'wss://bridge.example/socket',
    now: () => 5,
    newId: () => `n${(ids += 1)}`,
  });

describe('RuntimeConfigMigrationV1', () => {
  it('maps five model lists to roles, dedupes tuples, and creates selected bindings', async () => {
    const openai = {id: 'm-openai', provider: 'openai', apiUrl: 'https://api.openai.com/v1', apiKey: 'sk-a', modelName: 'gpt-4o'};
    const zhipu = {id: 'm-zhipu', provider: 'zhipu', apiUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: 'z-1', modelName: 'glm-4v'};
    const storage = makeStorage({
      [LEGACY_KEYS.autoglmModels]: JSON.stringify([openai]),
      [LEGACY_KEYS.autoglmSelected]: JSON.stringify('m-openai'),
      [LEGACY_KEYS.splitVision]: JSON.stringify([zhipu]),
      [LEGACY_KEYS.selectedSplitVision]: JSON.stringify('m-zhipu'),
      [LEGACY_KEYS.splitPlanner]: JSON.stringify([openai]),
    });
    const envelope = await makeMigration(storage).run();
    expect(envelope).not.toBeNull();
    const {profiles, bindings} = envelope!.active.modelAPI;
    // openai reused across direct + split_planner lists -> one profile.
    expect(profiles.filter(p => p.label === 'openai')).toHaveLength(1);
    const zhipuProfile = profiles.find(p => p.label === 'zhipu');
    expect(zhipuProfile).toMatchObject({mode: 'preset', preset: 'zhipu_glm'});
    expect(bindings.map(b => `${b.role}:${b.modelId}`).sort()).toEqual([
      'direct:gpt-4o',
      'vision:glm-4v',
    ]);
  });

  it('maps unknown providers to a conservative custom profile and moves credentials securely', async () => {
    const custom = {id: 'm-x', provider: 'mystery', apiUrl: 'https://mystery.example/v1', apiKey: 'k-1', modelName: 'x-1'};
    const credentials = makeCredentials();
    const storage = makeStorage({
      [LEGACY_KEYS.autoglmModels]: JSON.stringify([custom]),
      [LEGACY_KEYS.autoglmSelected]: JSON.stringify('m-x'),
    });
    const envelope = await makeMigration(storage, {credentials}).run();
    const profile = envelope!.active.modelAPI.profiles[0];
    expect(profile.mode).toBe('custom');
    if (profile.mode === 'custom') {
      expect(profile.custom).toMatchObject({
        protocol: 'openai_chat_completions',
        baseURL: 'https://mystery.example/v1',
        chatPath: '/chat/completions',
        modelListPath: null,
        auth: {kind: 'bearer'},
      });
    }
    expect(credentials.put).toHaveBeenCalledWith(profile.secretRef, 'k-1');
    expect(credentials.get).toHaveBeenCalledWith(profile.secretRef);
  });

  it('fails migration for a recognized preset with a blank credential', async () => {
    const storage = makeStorage({
      [LEGACY_KEYS.autoglmModels]: JSON.stringify([
        {id: 'm', provider: 'openai', apiUrl: 'https://api.openai.com/v1', apiKey: '', modelName: 'gpt-4o'},
      ]),
    });
    await expect(makeMigration(storage).run()).rejects.toMatchObject({
      code: 'runtime_config_migration_credential_required',
    });
  });

  it('stages OpenClaw through the bridge and maps openclaw memory to visual_agent', async () => {
    const port = makeOpenClawPort();
    const storage = makeStorage({
      [LEGACY_KEYS.openclaw]: JSON.stringify({
        enabled: true,
        gatewayUrl: 'wss://gw.example',
        deviceId: 'd-1',
        cluster: 'c-1',
        upstreamSecretRef: 'upstream:legacy',
      }),
      [LEGACY_KEYS.privacy]: JSON.stringify({memoryEnabled: true, memoryLocation: 'openclaw'}),
    });
    const envelope = await makeMigration(storage, {legacyOpenClaw: port}).run();
    expect(port.stage).toHaveBeenCalledWith(
      expect.objectContaining({bindingId: 'legacy-openclaw-gateway', toolId: 'openclaw'}),
    );
    expect(port.commit).toHaveBeenCalledWith('s-1');
    const visual = envelope!.active.visualAgent;
    expect(visual).toMatchObject({enabled: true, activeProfileId: 'legacy-openclaw'});
    expect(visual.profiles[0]).toMatchObject({
      profileId: 'legacy-openclaw',
      toolId: 'openclaw',
      connector: {bridgeUrl: 'wss://bridge.example/socket', bindingId: 'legacy-openclaw-gateway'},
    });
    expect(envelope!.active.privacy).toEqual({
      memoryEnabled: true,
      memoryLocation: 'visual_agent',
      memoryProfileId: 'legacy-openclaw',
    });
    // Runtime JSON never contains gateway/device/cluster/upstream token.
    const runtimeJson = storage.peek()[RUNTIME_STORAGE_KEYS.RUNTIME_CONFIG_V1];
    expect(runtimeJson).not.toContain('gw.example');
    expect(runtimeJson).not.toContain('d-1');
    expect(runtimeJson).not.toContain('upstream:legacy');
  });

  it('fails closed and preserves legacy bytes when OpenClaw holds a plaintext token', async () => {
    const storage = makeStorage({
      [LEGACY_KEYS.openclaw]: JSON.stringify({
        enabled: true,
        gatewayUrl: 'wss://gw.example',
        deviceId: 'd-1',
        cluster: 'c-1',
        token: 'PLAINTEXT-TOKEN',
      }),
    });
    await expect(makeMigration(storage).run()).rejects.toMatchObject({
      code: 'runtime_config_migration_openclaw_plaintext',
    });
    expect(storage.peek()[LEGACY_KEYS.openclaw]).toContain('PLAINTEXT-TOKEN');
    expect(storage.peek()[RUNTIME_STORAGE_KEYS.RUNTIME_CONFIG_V1]).toBeUndefined();
  });

  it('rolls back the staged bridge binding when the envelope write fails', async () => {
    const port = makeOpenClawPort();
    const storage = makeStorage({
      [LEGACY_KEYS.openclaw]: JSON.stringify({
        enabled: true,
        gatewayUrl: 'wss://gw.example',
        deviceId: 'd-1',
        cluster: 'c-1',
        upstreamSecretRef: 'upstream:legacy',
      }),
    });
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    await expect(makeMigration(storage, {legacyOpenClaw: port}).run()).rejects.toThrow();
    expect(port.rollback).toHaveBeenCalledWith('s-1');
    expect(port.commit).not.toHaveBeenCalled();
  });
});
