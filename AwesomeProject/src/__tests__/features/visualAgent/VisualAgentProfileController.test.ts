import {VisualAgentProfileController} from '@features/visualAgent/application/VisualAgentProfileController';
import type {IdGenerator} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {CredentialStore} from '@core/engine/operateRuntime/contracts/CredentialStore';
import {DEFAULT_AGENT_CONFIG_V2} from '@core/engine/operateRuntime/config/RuntimeConfigValidation';
import type {
  CredentialRetirementRepository,
  RuntimeConfigEnvelopeV1,
  RuntimeConfigRepository,
  RuntimeRouteConfigV1,
} from '@core/engine/operateRuntime/contracts/RuntimeConfigContracts';
import type {
  VisualAgentCapabilitySet,
  VisualAgentProfileV1,
  VisualAgentToolAdapter,
  VisualAgentToolRegistry,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

const capabilities = (over: Partial<VisualAgentCapabilitySet> = {}): VisualAgentCapabilitySet => ({
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

const codexMainProfile = (over: Partial<VisualAgentProfileV1> = {}): VisualAgentProfileV1 => ({
  schemaVersion: 1,
  profileId: 'codex-main',
  toolId: 'codex',
  enabled: true,
  connector: {
    kind: 'connector_bridge',
    bridgeUrl: 'https://bridge.example',
    bindingId: 'codex-main',
    secretRef: 'visual-agent:old-ref',
  },
  requestedCapabilities: capabilities(),
  ...over,
});

const activeRoute: RuntimeRouteConfigV1 = {
  capabilities: {phoneOperate: false, errands: false},
  privacy: {memoryEnabled: false, memoryLocation: 'device', memoryProfileId: null},
  modelAPI: {agentConfig: DEFAULT_AGENT_CONFIG_V2, profiles: [], bindings: []},
  visualAgent: {enabled: true, activeProfileId: 'codex-main', profiles: [codexMainProfile()]},
};

const envelope = (overrides: Partial<RuntimeRouteConfigV1['visualAgent']> = {}): RuntimeConfigEnvelopeV1 => {
  const active: RuntimeRouteConfigV1 = {
    ...activeRoute,
    visualAgent: {...activeRoute.visualAgent, ...overrides},
  };
  return {schemaVersion: 1, revision: 4, active, draft: active};
};

const makeRuntimeConfig = (): jest.Mocked<RuntimeConfigRepository> => ({
  load: jest.fn().mockResolvedValue(envelope()),
  mutateDraft: jest.fn(),
  activateDraft: jest.fn(),
  compareAndActivate: jest.fn().mockResolvedValue(envelope()),
  listProfiles: jest.fn(),
  listBindings: jest.fn(),
  putProfile: jest.fn(),
  putBinding: jest.fn(),
  removeProfile: jest.fn(),
});

const makeCredentials = (): jest.Mocked<CredentialStore> => {
  const store = new Map<string, string>();
  return {
    isAvailable: jest.fn().mockResolvedValue(true),
    put: jest.fn(async (secretRef: string, plaintext: string) => {
      store.set(secretRef, plaintext);
    }),
    get: jest.fn(async (secretRef: string) => store.get(secretRef) ?? null),
    delete: jest.fn(async (secretRef: string) => {
      store.delete(secretRef);
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

const fakeAdapter = (): VisualAgentToolAdapter => ({
  toolId: 'codex',
  manifest: {
    toolId: 'codex',
    displayName: 'Codex',
    maturity: 'beta',
    adapterVersion: '1.0.0',
    protocolVersions: [1],
    declaredCapabilities: capabilities(),
  },
  create: () => ({}) as never,
});

const makeRegistry = (): jest.Mocked<VisualAgentToolRegistry> => ({
  require: jest.fn().mockReturnValue(fakeAdapter()),
  list: jest.fn().mockReturnValue(['openclaw', 'codex', 'cursor', 'dsh', 'hermes']),
});

let idCounter = 0;
const makeIds = (): jest.Mocked<IdGenerator> => ({
  next: jest.fn(() => `generated-${(idCounter += 1)}`),
});

const makeController = (deps?: {
  runtimeConfig?: jest.Mocked<RuntimeConfigRepository>;
  credentials?: jest.Mocked<CredentialStore>;
  retirements?: jest.Mocked<CredentialRetirementRepository>;
  registry?: jest.Mocked<VisualAgentToolRegistry>;
  ids?: jest.Mocked<IdGenerator>;
}) => {
  const runtimeConfig = deps?.runtimeConfig ?? makeRuntimeConfig();
  const credentials = deps?.credentials ?? makeCredentials();
  const retirements = deps?.retirements ?? makeRetirements();
  const registry = deps?.registry ?? makeRegistry();
  const ids = deps?.ids ?? makeIds();
  return {
    controller: new VisualAgentProfileController(runtimeConfig, credentials, retirements, registry, ids),
    runtimeConfig,
    credentials,
    retirements,
    registry,
    ids,
  };
};

describe('VisualAgentProfileController.save', () => {
  it('stores only a bridge secret ref and atomically preserves unrelated runtime fields', async () => {
    const {controller, runtimeConfig, credentials, retirements, registry} = makeController();

    const saved = await controller.save({
      expectedRevision: 4,
      profileId: 'codex-main',
      toolId: 'codex',
      enabled: true,
      bridgeUrl: 'https://bridge.example',
      bindingId: 'codex-main',
      credential: {action: 'replace', plaintext: 'plaintext-credential-value'},
      requestedCapabilities: capabilities(),
    });

    expect(registry.require).toHaveBeenCalledWith('codex');
    expect(credentials.put).toHaveBeenCalledWith(
      expect.stringMatching(/^visual-agent:/),
      'plaintext-credential-value',
    );
    expect(retirements.stage).toHaveBeenCalledWith(
      expect.objectContaining({
        oldSecretRef: 'visual-agent:old-ref',
        replacementSecretRef: expect.stringMatching(/^visual-agent:/),
      }),
    );
    expect((retirements.stage as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (credentials.put as jest.Mock).mock.invocationCallOrder[0],
    );
    expect(runtimeConfig.compareAndActivate).toHaveBeenCalledWith(4, expect.any(Function));
    const mutate = runtimeConfig.compareAndActivate.mock.calls[0][1];
    expect(mutate(activeRoute)).toEqual(
      expect.objectContaining({
        capabilities: activeRoute.capabilities,
        modelAPI: activeRoute.modelAPI,
        visualAgent: expect.objectContaining({enabled: true, activeProfileId: 'codex-main'}),
      }),
    );
    expect(retirements.commit).toHaveBeenCalled();
    expect(JSON.stringify(saved)).not.toContain('plaintext-credential-value');
  });

  it('keeps or removes an existing bridge credential only by explicit intent', async () => {
    const {controller, credentials, retirements, runtimeConfig} = makeController();

    await controller.save({
      expectedRevision: 5,
      profileId: 'codex-main',
      toolId: 'codex',
      enabled: true,
      bridgeUrl: 'https://bridge.example',
      bindingId: 'codex-main',
      credential: {action: 'keep'},
      requestedCapabilities: capabilities(),
    });
    expect(credentials.put).not.toHaveBeenCalled();
    expect(credentials.get).not.toHaveBeenCalled();
    const keepMutate = runtimeConfig.compareAndActivate.mock.calls[0][1];
    expect(keepMutate(activeRoute).visualAgent.profiles[0].connector.secretRef).toBe('visual-agent:old-ref');

    await controller.save({
      expectedRevision: 6,
      profileId: 'codex-main',
      toolId: 'codex',
      enabled: true,
      bridgeUrl: 'https://bridge.example',
      bindingId: 'codex-main',
      credential: {action: 'remove'},
      requestedCapabilities: capabilities(),
    });
    const removeMutate = runtimeConfig.compareAndActivate.mock.calls[1][1];
    expect(removeMutate(activeRoute).visualAgent.profiles[0].connector.secretRef).toBeNull();
    expect(retirements.stage).toHaveBeenCalledWith(
      expect.objectContaining({oldSecretRef: 'visual-agent:old-ref', replacementSecretRef: null}),
    );
    expect(retirements.commit).toHaveBeenCalled();
    expect(credentials.delete).not.toHaveBeenCalledWith('visual-agent:old-ref');
  });

  it('rejects create+keep and cleans only the staged replacement on CAS failure', async () => {
    const {controller, runtimeConfig, credentials, retirements} = makeController();

    await expect(
      controller.save({
        expectedRevision: 6,
        toolId: 'cursor',
        enabled: true,
        bridgeUrl: 'https://bridge.example',
        bindingId: 'cursor-main',
        credential: {action: 'keep'},
        requestedCapabilities: capabilities(),
      }),
    ).rejects.toThrow('visual_agent_invalid_profile');
    expect(runtimeConfig.load).not.toHaveBeenCalled();

    runtimeConfig.compareAndActivate.mockRejectedValueOnce(new Error('config_revision_conflict'));
    await expect(
      controller.save({
        expectedRevision: 5,
        profileId: 'codex-main',
        toolId: 'codex',
        enabled: true,
        bridgeUrl: 'https://bridge.example',
        bindingId: 'codex-main',
        credential: {action: 'replace', plaintext: 'rotated'},
        requestedCapabilities: capabilities(),
      }),
    ).rejects.toThrow('config_revision_conflict');
    expect(credentials.delete).toHaveBeenCalledWith(expect.stringMatching(/^visual-agent:/));
    expect(retirements.rollback).toHaveBeenCalled();
    expect(credentials.delete).not.toHaveBeenCalledWith('visual-agent:old-ref');
  });

  it.each([
    [{action: 'replace', plaintext: 'first-secret'} as const, expect.stringMatching(/^visual-agent:/)],
    [{action: 'remove'} as const, null],
  ])('creates a generated profile with an explicit credential intent', async (credential, expectedRef) => {
    const {controller, ids} = makeController();
    (ids.next as jest.Mock).mockReturnValueOnce('cursor-generated');
    const saved = await controller.save({
      expectedRevision: 7,
      toolId: 'cursor',
      enabled: false,
      bridgeUrl: 'https://bridge.example',
      bindingId: 'cursor-generated',
      credential,
      requestedCapabilities: capabilities(),
    });
    expect(saved.profileId).toBe('cursor-generated');
    expect(saved.connector.secretRef).toEqual(expectedRef);
  });

  it('rejects a bridge URL that is not HTTPS/WSS or carries userinfo/hash', async () => {
    const {controller} = makeController();
    await expect(
      controller.save({
        expectedRevision: 4,
        profileId: 'codex-main',
        toolId: 'codex',
        enabled: true,
        bridgeUrl: 'http://bridge.example',
        bindingId: 'codex-main',
        credential: {action: 'keep'},
        requestedCapabilities: capabilities(),
      }),
    ).rejects.toThrow('visual_agent_invalid_profile');
    await expect(
      controller.save({
        expectedRevision: 4,
        profileId: 'codex-main',
        toolId: 'codex',
        enabled: true,
        bridgeUrl: 'https://user:pass@bridge.example',
        bindingId: 'codex-main',
        credential: {action: 'keep'},
        requestedCapabilities: capabilities(),
      }),
    ).rejects.toThrow('visual_agent_invalid_profile');
  });

  it('rejects an update with an unknown profile id or an incomplete capability set', async () => {
    const {controller} = makeController();
    await expect(
      controller.save({
        expectedRevision: 4,
        profileId: 'missing',
        toolId: 'codex',
        enabled: true,
        bridgeUrl: 'https://bridge.example',
        bindingId: 'codex-main',
        credential: {action: 'keep'},
        requestedCapabilities: capabilities(),
      }),
    ).rejects.toThrow('visual_agent_invalid_profile');

    await expect(
      controller.save({
        expectedRevision: 4,
        profileId: 'codex-main',
        toolId: 'codex',
        enabled: true,
        bridgeUrl: 'https://bridge.example',
        bindingId: 'codex-main',
        credential: {action: 'keep'},
        requestedCapabilities: {...capabilities(), preferences: 'yes' as unknown as boolean},
      }),
    ).rejects.toThrow('visual_agent_invalid_profile');
  });
});

describe('VisualAgentProfileController.remove/setActive/setEnabled', () => {
  it('stages the connector ref, clears activeProfileId, and commits on remove', async () => {
    const {controller, runtimeConfig, retirements} = makeController();
    await controller.remove('codex-main', 4);
    expect(retirements.stage).toHaveBeenCalledWith(
      expect.objectContaining({oldSecretRef: 'visual-agent:old-ref', replacementSecretRef: null}),
    );
    const mutate = runtimeConfig.compareAndActivate.mock.calls[0][1];
    const result = mutate(activeRoute);
    expect(result.visualAgent.profiles).toHaveLength(0);
    expect(result.visualAgent.activeProfileId).toBeNull();
    expect(retirements.commit).toHaveBeenCalled();
  });

  it('performs only the CAS when removing a null-ref profile', async () => {
    const runtimeConfig = makeRuntimeConfig();
    runtimeConfig.load.mockResolvedValue(
      envelope({profiles: [codexMainProfile({connector: {...codexMainProfile().connector, secretRef: null}})]}),
    );
    const {controller, retirements} = makeController({runtimeConfig});
    await controller.remove('codex-main', 4);
    expect(retirements.stage).not.toHaveBeenCalled();
    expect(retirements.commit).not.toHaveBeenCalled();
  });

  it('rejects removing an unknown profile before any mutation', async () => {
    const {controller, runtimeConfig} = makeController();
    await expect(controller.remove('missing', 4)).rejects.toThrow('visual_agent_invalid_profile');
    expect(runtimeConfig.compareAndActivate).not.toHaveBeenCalled();
  });

  it('setActive and setEnabled each use one expected-revision CAS', async () => {
    const {controller, runtimeConfig} = makeController();
    await controller.setActive('codex-main', 4);
    await controller.setEnabled(false, 5);
    expect(runtimeConfig.compareAndActivate).toHaveBeenNthCalledWith(1, 4, expect.any(Function));
    expect(runtimeConfig.compareAndActivate).toHaveBeenNthCalledWith(2, 5, expect.any(Function));
    const enabledMutate = runtimeConfig.compareAndActivate.mock.calls[1][1];
    expect(enabledMutate(activeRoute)).toEqual(
      expect.objectContaining({visualAgent: expect.objectContaining({enabled: false})}),
    );
  });
});

describe('VisualAgentProfileController.list/readActiveProjection', () => {
  it('lists profiles from the active route', async () => {
    const {controller} = makeController();
    await expect(controller.list()).resolves.toEqual([codexMainProfile()]);
  });

  it('projects only profileId/toolId/connectorRef for the active profile', async () => {
    const {controller} = makeController();
    await expect(controller.readActiveProjection()).resolves.toEqual({
      profileId: 'codex-main',
      toolId: 'codex',
      connectorRef: {kind: 'connector_bridge', bindingId: 'codex-main'},
    });
  });

  it('returns null when no profile is active', async () => {
    const runtimeConfig = makeRuntimeConfig();
    runtimeConfig.load.mockResolvedValue(envelope({activeProfileId: null}));
    const {controller} = makeController({runtimeConfig});
    await expect(controller.readActiveProjection()).resolves.toBeNull();
  });
});
