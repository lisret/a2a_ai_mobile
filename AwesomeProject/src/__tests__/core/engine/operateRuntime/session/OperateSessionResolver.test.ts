import {
  OperateSessionResolver,
  executionTargetFromModelSnapshot,
  bindingFromModelSnapshot,
} from '../../../../../core/engine/operateRuntime/session/OperateSessionResolver';
import type {OperateSessionResolverDeps} from '../../../../../core/engine/operateRuntime/session/OperateSessionResolver';
import type {
  ModelBindingV1,
  ModelEndpointProfileV1,
  ModelProviderRegistry,
  ProviderExecutionTargetV1,
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
import type {RuntimeRouteConfigV1} from '../../../../../core/engine/operateRuntime/contracts/RuntimeConfigContracts';
import type {AgentConfigV2} from '../../../../../core/engine/agentRuntime/domain';

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

const openaiProfile: ModelEndpointProfileV1 = {
  id: 'profile:openai-direct',
  label: 'OpenAI',
  mode: 'preset',
  preset: 'openai',
  baseURLOverride: null,
  region: null,
  channel: null,
  secretRef: 'model:openai-direct',
  generation: 1,
};

const openaiProfileNoSecret: ModelEndpointProfileV1 = {
  ...openaiProfile,
  id: 'profile:openai-no-secret',
  secretRef: null,
};

const visionProfile: ModelEndpointProfileV1 = {
  ...openaiProfile,
  id: 'profile:openai-vision',
};

const plannerProfile: ModelEndpointProfileV1 = {
  ...openaiProfile,
  id: 'profile:openai-planner',
};

const customProfile: ModelEndpointProfileV1 = {
  id: 'profile:custom',
  label: 'Custom',
  mode: 'custom',
  custom: {
    protocol: 'custom_http_json',
    baseURL: 'https://custom.example',
    auth: {kind: 'header', headerName: 'X-API-Key', prefix: ''},
    chatPath: '/v2/agent/run',
    modelListPath: null,
    declaredCapabilities: {
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      capabilities: {chat: true, vision: true, toolCalls: false, reasoning: 'unknown'},
    },
  },
  region: 'cn',
  channel: 'mobile',
  secretRef: 'model:custom-secret',
  generation: 1,
};

const customProfileNoAuth: ModelEndpointProfileV1 = {
  ...customProfile,
  id: 'profile:custom-no-auth',
  secretRef: null,
  custom: {...customProfile.custom, auth: {kind: 'none'}},
};

const directBinding: ModelBindingV1 = {
  id: 'binding:direct',
  role: 'direct',
  profileId: 'profile:openai-direct',
  modelId: 'gpt-4o',
  maxSteps: 20,
};

const visionBinding: ModelBindingV1 = {
  id: 'binding:vision',
  role: 'vision',
  profileId: 'profile:openai-vision',
  modelId: 'gpt-4o',
  maxSteps: 20,
};

const plannerBinding: ModelBindingV1 = {
  id: 'binding:split-planner',
  role: 'split_planner',
  profileId: 'profile:openai-planner',
  modelId: 'gpt-4o',
  maxSteps: 20,
};

const localPlannerBinding: ModelBindingV1 = {
  id: 'binding:local-planner',
  role: 'local_planner',
  profileId: 'profile:openai-planner',
  modelId: 'gpt-4o',
  maxSteps: 20,
};

const customBinding: ModelBindingV1 = {
  id: 'binding:custom-direct',
  role: 'direct',
  profileId: 'profile:custom',
  modelId: 'custom-model',
  maxSteps: 20,
};

const openaiDescriptor: ProviderModelDescriptor = {
  id: 'gpt-4o',
  displayName: 'GPT-4o',
  inputModalities: ['text', 'image'],
  outputModalities: ['text'],
  capabilities: {chat: true, vision: true, toolCalls: true, reasoning: 'unknown'},
  contextWindow: 128000,
  maxOutputTokens: 4096,
  metadataSource: 'remote',
};

const textOnlyDescriptor: ProviderModelDescriptor = {
  ...openaiDescriptor,
  inputModalities: ['text'],
  capabilities: {...openaiDescriptor.capabilities, vision: false},
};

const customDescriptor: ProviderModelDescriptor = {
  id: 'custom-model',
  displayName: 'custom-model',
  inputModalities: ['text', 'image'],
  outputModalities: ['text'],
  capabilities: {chat: true, vision: true, toolCalls: false, reasoning: 'unknown'},
  contextWindow: null,
  maxOutputTokens: null,
  metadataSource: 'manual',
};

const targetFor = (
  profile: ModelEndpointProfileV1,
  descriptor: ProviderModelDescriptor,
  capabilityTrust: ProviderExecutionTargetV1['capabilityTrust'],
): ProviderExecutionTargetV1 =>
  profile.mode === 'preset'
    ? {
        provider: profile.preset,
        transportAdapterId: 'openai',
        protocol: 'openai_chat_completions',
        baseURL: 'https://api.openai.com',
        auth: {kind: 'bearer'},
        chatPath: '/v1/chat/completions',
        region: profile.region,
        channel: profile.channel,
        secretRef: profile.secretRef,
        inputModalities: descriptor.inputModalities,
        outputModalities: descriptor.outputModalities,
        capabilities: descriptor.capabilities,
        capabilityTrust,
      }
    : {
        provider: 'custom',
        transportAdapterId: 'custom',
        protocol: profile.custom.protocol,
        baseURL: profile.custom.baseURL,
        auth: profile.custom.auth,
        chatPath: profile.custom.chatPath,
        region: profile.region,
        channel: profile.channel,
        secretRef: profile.secretRef,
        inputModalities: descriptor.inputModalities,
        outputModalities: descriptor.outputModalities,
        capabilities: descriptor.capabilities,
        capabilityTrust,
      };

function agentConfig(activeMode: AgentConfigV2['activeMode']): AgentConfigV2 {
  return {
    version: 2,
    activeMode,
    modeDrafts: {
      cloudDirect: {},
      cloudSplit: {},
      localVisionCloudPlanner: {localModelId: 'minicpm-v-4.6-q4'},
    },
    maxSteps: 20,
  };
}

function route(overrides: Partial<RuntimeRouteConfigV1> = {}): RuntimeRouteConfigV1 {
  return {
    capabilities: {phoneOperate: true, errands: false},
    privacy: {memoryEnabled: false, memoryLocation: 'device', memoryProfileId: null},
    modelAPI: {
      agentConfig: agentConfig('cloud_direct'),
      profiles: [openaiProfile],
      bindings: [directBinding],
    },
    visualAgent: {enabled: false, activeProfileId: null, profiles: []},
    ...overrides,
  };
}

function makeRegistry(
  describeManualModel: jest.Mock = jest.fn().mockReturnValue(openaiDescriptor),
  resolveExecutionTarget: jest.Mock = jest
    .fn()
    .mockImplementation((profile: ModelEndpointProfileV1, descriptor: ProviderModelDescriptor, trust: ProviderExecutionTargetV1['capabilityTrust']) =>
      targetFor(profile, descriptor, trust),
    ),
): jest.Mocked<ModelProviderRegistry> {
  const catalog: jest.Mocked<ProviderModelCatalogPort> = {
    listModels: jest.fn(),
    describeManualModel,
  };
  return {
    listPresets: jest.fn().mockReturnValue([openaiRegistration]),
    resolveExecutionTarget,
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

function makeVisualRegistry(
  execution: jest.Mocked<VisualAgentExecutionPort>,
): {registry: jest.Mocked<VisualAgentToolRegistry>; adapter: jest.Mocked<VisualAgentToolAdapter>} {
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
  const registry: jest.Mocked<VisualAgentToolRegistry> = {
    require: jest.fn().mockReturnValue(adapter),
    list: jest.fn().mockReturnValue(['openclaw']),
  };
  return {registry, adapter};
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

function makeDeps(overrides: Partial<OperateSessionResolverDeps> = {}): OperateSessionResolverDeps {
  const visualExecution = makeVisualExecution();
  const {registry: visualAgentToolRegistry} = makeVisualRegistry(visualExecution);
  return {
    modelProviderRegistry: makeRegistry(),
    visualAgentToolRegistry,
    localEligibility: {check: jest.fn().mockResolvedValue({state: 'ready'})},
    ...overrides,
  };
}

const signal = () => new AbortController().signal;

const baseInput = (overrides: Partial<Parameters<OperateSessionResolver['resolve']>[0]> = {}) => ({
  taskId: 'task-1',
  sessionRevision: 1,
  configRevision: 1,
  active: route(),
  createdAtMs: 1_700_000_000_000,
  signal: signal(),
  ...overrides,
});

describe('OperateSessionResolver', () => {
  it('resolves cloud_direct into a single direct binding snapshot', async () => {
    const registry = makeRegistry();
    const resolver = new OperateSessionResolver(makeDeps({modelProviderRegistry: registry}));
    const result = await resolver.resolve(baseInput());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.session.channel).toBe('cloud_direct');
    expect(result.session.modelBindings.direct).toEqual(
      expect.objectContaining({
        role: 'direct',
        bindingId: 'binding:direct',
        profileId: 'profile:openai-direct',
        modelId: 'gpt-4o',
        maxSteps: 20,
        secretRef: 'model:openai-direct',
        capabilityTrust: 'verified_remote',
      }),
    );
    expect(registry.resolveExecutionTarget).toHaveBeenCalledWith(
      openaiProfile,
      openaiDescriptor,
      'verified_remote',
    );
    expect(Object.isFrozen(result.session)).toBe(true);
    expect(Object.isFrozen(result.session.modelBindings)).toBe(true);
  });

  it('resolves cloud_split into vision and planner bindings', async () => {
    const resolver = new OperateSessionResolver(makeDeps());
    const result = await resolver.resolve(
      baseInput({
        active: route({
          modelAPI: {
            agentConfig: agentConfig('cloud_split'),
            profiles: [visionProfile, plannerProfile],
            bindings: [visionBinding, plannerBinding],
          },
        }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.session.channel).toBe('cloud_split');
    expect(result.session.modelBindings.vision?.role).toBe('vision');
    expect(result.session.modelBindings.planner?.role).toBe('split_planner');
    expect(result.session.modelBindings.direct).toBeUndefined();
  });

  it('resolves local_vision_cloud_planner only after eligibility is ready', async () => {
    const localEligibility = {check: jest.fn().mockResolvedValue({state: 'ready'})};
    const resolver = new OperateSessionResolver(makeDeps({localEligibility}));
    const result = await resolver.resolve(
      baseInput({
        active: route({
          modelAPI: {
            agentConfig: agentConfig('local_vision_cloud_planner'),
            profiles: [plannerProfile],
            bindings: [localPlannerBinding],
          },
        }),
      }),
    );

    expect(localEligibility.check).toHaveBeenCalledWith('minicpm-v-4.6-q4');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.session.localModelId).toBe('minicpm-v-4.6-q4');
    expect(result.session.modelBindings.planner?.role).toBe('local_planner');
  });

  it('blocks local_vision_cloud_planner when local eligibility is not ready', async () => {
    const registry = makeRegistry();
    const localEligibility = {check: jest.fn().mockResolvedValue({state: 'needs_download'})};
    const resolver = new OperateSessionResolver(
      makeDeps({modelProviderRegistry: registry, localEligibility}),
    );
    const result = await resolver.resolve(
      baseInput({
        active: route({
          modelAPI: {
            agentConfig: agentConfig('local_vision_cloud_planner'),
            profiles: [plannerProfile],
            bindings: [localPlannerBinding],
          },
        }),
      }),
    );

    expect(result).toEqual({ok: false, code: 'local_model_not_ready'});
    expect(registry.resolveExecutionTarget).not.toHaveBeenCalled();
  });

  it('rejects a channel missing its required role binding', async () => {
    const resolver = new OperateSessionResolver(makeDeps());
    const result = await resolver.resolve(
      baseInput({
        active: route({
          modelAPI: {agentConfig: agentConfig('cloud_direct'), profiles: [openaiProfile], bindings: []},
        }),
      }),
    );

    expect(result).toEqual({ok: false, code: 'model_binding_missing'});
  });

  it('rejects a binding referencing a missing profile', async () => {
    const resolver = new OperateSessionResolver(makeDeps());
    const result = await resolver.resolve(
      baseInput({
        active: route({
          modelAPI: {agentConfig: agentConfig('cloud_direct'), profiles: [], bindings: [directBinding]},
        }),
      }),
    );

    expect(result).toEqual({ok: false, code: 'model_profile_missing'});
  });

  it('rejects a required-auth preset profile with a null secretRef before any network work', async () => {
    const registry = makeRegistry();
    const resolver = new OperateSessionResolver(makeDeps({modelProviderRegistry: registry}));
    const result = await resolver.resolve(
      baseInput({
        active: route({
          modelAPI: {
            agentConfig: agentConfig('cloud_direct'),
            profiles: [openaiProfileNoSecret],
            bindings: [{...directBinding, profileId: 'profile:openai-no-secret'}],
          },
        }),
      }),
    );

    expect(result).toEqual({ok: false, code: 'model_profile_secret_missing'});
    expect(registry.resolveExecutionTarget).not.toHaveBeenCalled();
  });

  it('snapshots every custom execution field before later profile edits', async () => {
    const registry = makeRegistry(jest.fn().mockReturnValue(customDescriptor));
    const resolver = new OperateSessionResolver(makeDeps({modelProviderRegistry: registry}));
    const result = await resolver.resolve(
      baseInput({
        taskId: 'custom-task',
        active: route({
          modelAPI: {
            agentConfig: agentConfig('cloud_direct'),
            profiles: [customProfile],
            bindings: [customBinding],
          },
        }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    const target = result.session.modelBindings.direct!;
    expect(target).toEqual(
      expect.objectContaining({
        provider: 'custom',
        bindingId: 'binding:custom-direct',
        baseURL: 'https://custom.example',
        protocol: 'custom_http_json',
        auth: {kind: 'header', headerName: 'X-API-Key', prefix: ''},
        chatPath: '/v2/agent/run',
        region: 'cn',
        channel: 'mobile',
      }),
    );
    expect(registry.resolveExecutionTarget).toHaveBeenCalledWith(
      customProfile,
      customDescriptor,
      'user_declared_unverified',
    );
    expect(executionTargetFromModelSnapshot(target)).toEqual(
      expect.objectContaining({provider: 'custom', secretRef: 'model:custom-secret'}),
    );
    expect(bindingFromModelSnapshot(target)).toEqual(customBinding);
  });

  it('accepts a no-auth custom profile with a null secretRef', async () => {
    const registry = makeRegistry(jest.fn().mockReturnValue(customDescriptor));
    const resolver = new OperateSessionResolver(makeDeps({modelProviderRegistry: registry}));
    const result = await resolver.resolve(
      baseInput({
        active: route({
          modelAPI: {
            agentConfig: agentConfig('cloud_direct'),
            profiles: [customProfileNoAuth],
            bindings: [{...customBinding, profileId: 'profile:custom-no-auth'}],
          },
        }),
      }),
    );

    expect(result.ok).toBe(true);
  });

  it('rejects a vision-required role whose target cannot express image input', async () => {
    const registry = makeRegistry(jest.fn().mockReturnValue(textOnlyDescriptor));
    const resolver = new OperateSessionResolver(makeDeps({modelProviderRegistry: registry}));
    const result = await resolver.resolve(baseInput());

    expect(result).toEqual({ok: false, code: 'model_binding_vision_unsupported'});
  });

  it('prioritizes an enabled visual agent over any model configuration', async () => {
    const registry = makeRegistry();
    const visualExecution = makeVisualExecution();
    const {registry: visualAgentToolRegistry} = makeVisualRegistry(visualExecution);
    const resolver = new OperateSessionResolver(
      makeDeps({modelProviderRegistry: registry, visualAgentToolRegistry}),
    );
    const result = await resolver.resolve(
      baseInput({
        active: route({visualAgent: {enabled: true, activeProfileId: 'profile-1', profiles: [visualProfile]}}),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.session.channel).toBe('visual_agent');
    expect(result.session.visualAgent).toEqual({
      profileId: 'profile-1',
      toolId: 'openclaw',
      connector: visualProfile.connector,
      negotiatedCapabilities: fullCapabilities,
    });
    expect(result.session.modelBindings).toEqual({});
    expect(registry.resolveExecutionTarget).not.toHaveBeenCalled();
  });

  it('rejects a missing or disabled active visual profile', async () => {
    const resolver = new OperateSessionResolver(makeDeps());
    const result = await resolver.resolve(
      baseInput({
        active: route({visualAgent: {enabled: true, activeProfileId: 'missing', profiles: [visualProfile]}}),
      }),
    );

    expect(result).toEqual({ok: false, code: 'visual_agent_invalid_profile'});
  });

  it('propagates a registry miss as a generic visual_agent_* code', async () => {
    const visualExecution = makeVisualExecution();
    const {registry: visualAgentToolRegistry} = makeVisualRegistry(visualExecution);
    (visualAgentToolRegistry.require as jest.Mock).mockImplementation(() => {
      throw new VisualAgentContractError('visual_agent_adapter_not_found');
    });
    const resolver = new OperateSessionResolver(makeDeps({visualAgentToolRegistry}));
    const result = await resolver.resolve(
      baseInput({
        active: route({visualAgent: {enabled: true, activeProfileId: 'profile-1', profiles: [visualProfile]}}),
      }),
    );

    expect(result).toEqual({ok: false, code: 'visual_agent_adapter_not_found'});
  });

  it('blocks a disconnected visual agent without any model fallback', async () => {
    const registry = makeRegistry();
    const visualExecution = makeVisualExecution();
    visualExecution.connect.mockRejectedValue(
      new VisualAgentContractError('visual_agent_disconnected'),
    );
    const {registry: visualAgentToolRegistry} = makeVisualRegistry(visualExecution);
    const resolver = new OperateSessionResolver(
      makeDeps({modelProviderRegistry: registry, visualAgentToolRegistry}),
    );
    const result = await resolver.resolve(
      baseInput({
        active: route({visualAgent: {enabled: true, activeProfileId: 'profile-1', profiles: [visualProfile]}}),
      }),
    );

    expect(result).toEqual({ok: false, code: 'visual_agent_disconnected'});
    expect(registry.resolveExecutionTarget).not.toHaveBeenCalled();
  });

  it('rejects negotiated capabilities that drop the required image/structured authority', async () => {
    const visualExecution = makeVisualExecution();
    visualExecution.connect.mockResolvedValue({...fullCapabilities, structuredAction: false});
    const {registry: visualAgentToolRegistry} = makeVisualRegistry(visualExecution);
    const resolver = new OperateSessionResolver(makeDeps({visualAgentToolRegistry}));
    const result = await resolver.resolve(
      baseInput({
        active: route({visualAgent: {enabled: true, activeProfileId: 'profile-1', profiles: [visualProfile]}}),
      }),
    );

    expect(result).toEqual({ok: false, code: 'visual_agent_capability_unsupported'});
  });

  it('rejects negotiated capabilities that exceed what was requested', async () => {
    const requestedSubset: VisualAgentCapabilitySet = {...fullCapabilities, resume: false};
    const profile: VisualAgentProfileV1 = {...visualProfile, requestedCapabilities: requestedSubset};
    const visualExecution = makeVisualExecution();
    visualExecution.connect.mockResolvedValue(fullCapabilities);
    const {registry: visualAgentToolRegistry} = makeVisualRegistry(visualExecution);
    const resolver = new OperateSessionResolver(makeDeps({visualAgentToolRegistry}));
    const result = await resolver.resolve(
      baseInput({
        active: route({visualAgent: {enabled: true, activeProfileId: 'profile-1', profiles: [profile]}}),
      }),
    );

    expect(result).toEqual({ok: false, code: 'visual_agent_capability_unsupported'});
  });
});
