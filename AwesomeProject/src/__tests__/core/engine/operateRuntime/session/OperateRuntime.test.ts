import AsyncStorage from '@react-native-async-storage/async-storage';
import {OperateRuntime} from '../../../../../core/engine/operateRuntime/OperateRuntime';
import {OperateSessionResolver} from '../../../../../core/engine/operateRuntime/session/OperateSessionResolver';
import {OperateSessionStore} from '../../../../../core/engine/operateRuntime/session/OperateSessionStore';
import type {RuntimeConfigEnvelopeV1, RuntimeRouteConfigV1} from '../../../../../core/engine/operateRuntime/contracts/RuntimeConfigContracts';
import type {
  ModelEndpointProfileV1,
  ModelBindingV1,
  ModelProviderRegistry,
  ProviderModelCatalogPort,
  ProviderModelDescriptor,
  ProviderRegistrationV1,
} from '../../../../../core/engine/operateRuntime/model/ModelProviderContracts';
import type {
  VisualAgentCapabilitySet,
  VisualAgentExecutionPort,
  VisualAgentProfileV1,
  VisualAgentToolAdapter,
  VisualAgentToolRegistry,
} from '../../../../../core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import {VisualAgentContractError} from '../../../../../core/engine/operateRuntime/visualAgent/VisualAgentContracts';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

const fullCapabilities: VisualAgentCapabilitySet = {
  imageInput: true,
  structuredAction: true,
  stream: true,
  cancel: true,
  approval: true,
  resume: true,
  steer: true,
  preferences: true,
};

const openaiRegistration: ProviderRegistrationV1 = {
  preset: 'openai',
  label: 'OpenAI',
  defaultBaseURL: 'https://api.openai.com',
  protocol: 'openai_chat_completions',
  chatPath: '/v1/chat/completions',
  auth: {kind: 'bearer'},
  credentialRequirement: 'required',
  transportAdapterId: 'openai',
  catalog: {kind: 'remote', modelListPath: '/v1/models', pagination: 'none'},
};

const directProfile: ModelEndpointProfileV1 = {
  id: 'profile:direct',
  label: 'Direct',
  mode: 'preset',
  preset: 'openai',
  baseURLOverride: null,
  region: null,
  channel: null,
  secretRef: 'model:direct-secret',
  generation: 1,
};

const directBinding: ModelBindingV1 = {
  id: 'binding:direct',
  role: 'direct',
  profileId: 'profile:direct',
  modelId: 'gpt-4o',
  maxSteps: 20,
};

const descriptor: ProviderModelDescriptor = {
  id: 'gpt-4o',
  displayName: 'GPT-4o',
  inputModalities: ['text', 'image'],
  outputModalities: ['text'],
  capabilities: {chat: true, vision: true, toolCalls: true, reasoning: 'unknown'},
  contextWindow: 128000,
  maxOutputTokens: 4096,
  metadataSource: 'remote',
};

function makeRegistry(): jest.Mocked<ModelProviderRegistry> {
  const catalog: jest.Mocked<ProviderModelCatalogPort> = {
    listModels: jest.fn(),
    describeManualModel: jest.fn().mockReturnValue(descriptor),
  };
  return {
    listPresets: jest.fn().mockReturnValue([openaiRegistration]),
    resolveExecutionTarget: jest.fn().mockImplementation((profile: ModelEndpointProfileV1) => ({
      provider: 'openai',
      transportAdapterId: 'openai',
      protocol: 'openai_chat_completions',
      baseURL: 'https://api.openai.com',
      auth: {kind: 'bearer'},
      chatPath: '/v1/chat/completions',
      region: profile.region ?? null,
      channel: profile.channel ?? null,
      secretRef: profile.secretRef,
      inputModalities: descriptor.inputModalities,
      outputModalities: descriptor.outputModalities,
      capabilities: descriptor.capabilities,
      capabilityTrust: 'verified_remote',
    })),
    resolveTransport: jest.fn(),
    resolveCatalog: jest.fn().mockReturnValue(catalog),
  };
}

const visualProfile: VisualAgentProfileV1 = {
  schemaVersion: 1,
  profileId: 'profile-1',
  toolId: 'openclaw',
  enabled: true,
  connector: {
    kind: 'connector_bridge',
    bridgeUrl: 'https://bridge.example',
    bindingId: 'binding-1',
    secretRef: 'visual-agent-bridge:binding-1',
  },
  requestedCapabilities: fullCapabilities,
};

function makeVisualRegistry(execution: jest.Mocked<VisualAgentExecutionPort>): jest.Mocked<VisualAgentToolRegistry> {
  const adapter: jest.Mocked<VisualAgentToolAdapter> = {
    toolId: 'openclaw',
    manifest: {
      toolId: 'openclaw',
      displayName: 'OpenClaw',
      maturity: 'stable',
      adapterVersion: '1.0.0',
      protocolVersions: [1],
      declaredCapabilities: fullCapabilities,
    },
    create: jest.fn().mockReturnValue(execution),
  };
  return {
    require: jest.fn().mockReturnValue(adapter),
    list: jest.fn().mockReturnValue(['openclaw']),
  };
}

function makeVisualExecution(): jest.Mocked<VisualAgentExecutionPort> {
  return {
    getConnectionState: jest.fn(),
    connect: jest.fn().mockResolvedValue(fullCapabilities),
    disconnect: jest.fn(),
    execute: jest.fn(),
    cancel: jest.fn(),
    resolveApproval: jest.fn(),
    resume: jest.fn(),
    steer: jest.fn(),
    requestPreferences: jest.fn(),
    subscribe: jest.fn(),
  };
}

function route(overrides: Partial<RuntimeRouteConfigV1> = {}): RuntimeRouteConfigV1 {
  return {
    capabilities: {phoneOperate: true, errands: false},
    privacy: {memoryEnabled: false, memoryLocation: 'device', memoryProfileId: null},
    modelAPI: {
      agentConfig: {
        version: 2,
        activeMode: 'cloud_direct',
        modeDrafts: {
          cloudDirect: {},
          cloudSplit: {},
          localVisionCloudPlanner: {localModelId: 'minicpm-v-4.6-q4'},
        },
        maxSteps: 20,
      },
      profiles: [directProfile],
      bindings: [directBinding],
    },
    visualAgent: {enabled: false, activeProfileId: null, profiles: []},
    ...overrides,
  };
}

class FakeConfigRepository {
  constructor(private envelope: RuntimeConfigEnvelopeV1) {}
  setEnvelope(envelope: RuntimeConfigEnvelopeV1): void {
    this.envelope = envelope;
  }
  async load(): Promise<RuntimeConfigEnvelopeV1> {
    return this.envelope;
  }
}

function makeEnvelope(active: RuntimeRouteConfigV1, revision = 1): RuntimeConfigEnvelopeV1 {
  return {schemaVersion: 1, revision, active, draft: active};
}

describe('OperateRuntime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const backing: Record<string, string> = {};
    mockAsyncStorage.getItem.mockImplementation(async key => backing[key] ?? null);
    mockAsyncStorage.setItem.mockImplementation(async (key, value) => {
      backing[key] = value;
    });
  });

  function makeRuntime(visualAgentToolRegistry: VisualAgentToolRegistry, registry = makeRegistry()) {
    const sessionStore = new OperateSessionStore();
    const resolver = new OperateSessionResolver({
      modelProviderRegistry: registry,
      visualAgentToolRegistry,
      localEligibility: {check: jest.fn().mockResolvedValue({state: 'ready'})},
    });
    const configRepository = new FakeConfigRepository(makeEnvelope(route()));
    const runtime = new OperateRuntime({configRepository, sessionStore, resolver});
    return {runtime, sessionStore, configRepository, registry};
  }

  it('creates and persists an immutable session for a task', async () => {
    const {runtime, sessionStore} = makeRuntime(makeVisualRegistry(makeVisualExecution()));
    const result = await runtime.createSession({taskId: 'task-1'});

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.session.channel).toBe('cloud_direct');
    expect(result.session.taskId).toBe('task-1');

    const loaded = await sessionStore.load('task-1');
    expect(loaded?.session).toEqual(result.session);
  });

  it('does not change a session after config and model edits', async () => {
    const {runtime, sessionStore, configRepository} = makeRuntime(makeVisualRegistry(makeVisualExecution()));
    const created = await runtime.createSession({taskId: 'task-1'});
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.code);

    configRepository.setEnvelope(
      makeEnvelope(
        route({modelAPI: {agentConfig: route().modelAPI.agentConfig, profiles: [], bindings: []}}),
        2,
      ),
    );

    const loaded = await sessionStore.load('task-1');
    expect(loaded?.session).toEqual(created.session);
    expect(Object.isFrozen(loaded?.session)).toBe(true);
  });

  it('rejects a second createSession call for the same taskId', async () => {
    const {runtime} = makeRuntime(makeVisualRegistry(makeVisualExecution()));
    await runtime.createSession({taskId: 'task-1'});
    const second = await runtime.createSession({taskId: 'task-1'});
    expect(second).toEqual({ok: false, code: 'operate_session_task_already_bound'});
  });

  it('blocks a disconnected visual agent without any model fallback', async () => {
    const registry = makeRegistry();
    const execution = makeVisualExecution();
    execution.connect.mockRejectedValue(new VisualAgentContractError('visual_agent_disconnected'));
    const {runtime} = makeRuntime(makeVisualRegistry(execution), registry);
    const configRepository = new FakeConfigRepository(
      makeEnvelope(route({visualAgent: {enabled: true, activeProfileId: 'profile-1', profiles: [visualProfile]}})),
    );
    const sessionStore = new OperateSessionStore();
    const resolver = new OperateSessionResolver({
      modelProviderRegistry: registry,
      visualAgentToolRegistry: makeVisualRegistry(execution),
      localEligibility: {check: jest.fn().mockResolvedValue({state: 'ready'})},
    });
    const scopedRuntime = new OperateRuntime({configRepository, sessionStore, resolver});

    const result = await scopedRuntime.createSession({taskId: 'task-1'});
    expect(result).toEqual({ok: false, code: 'visual_agent_disconnected'});
    expect(registry.resolveExecutionTarget).not.toHaveBeenCalled();
  });

  it('claims a created session as the requested owner', async () => {
    const {runtime} = makeRuntime(makeVisualRegistry(makeVisualExecution()));
    const created = await runtime.createSession({taskId: 'task-1'});
    if (!created.ok) throw new Error(created.code);

    const claimed = await runtime.claim('task-1', created.session.sessionRevision, 'foreground');
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) throw new Error(claimed.code);
    expect(claimed.lease.owner).toBe('foreground');
    expect(claimed.lease.session).toEqual(created.session);
  });
});
