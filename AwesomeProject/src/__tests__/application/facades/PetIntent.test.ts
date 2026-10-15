import AsyncStorage from '@react-native-async-storage/async-storage';
import {DefaultCompanionFacade} from '../../../application/facades/CompanionFacade';
import {
  MAX_PET_IDLE_SECONDS,
  MAX_PET_LAST_ACTION_LENGTH,
  PET_INTENT_REQUEST_TIMEOUT_MS,
  PET_TEMPERAMENTS,
  buildPetIntentMessages,
  normalizePetIntentContext,
  parsePetIntentResponse,
  requestPetIntent,
  type PetIntentContext,
} from '../../../application/facades/PetIntent';
import {RuntimeCompanionPort} from '../../../application/facades/RuntimeApplicationPorts';
import type {
  CompanionApplicationPort,
  CompanionFacade,
} from '../../../application/facades/UiRuntimeContracts';
import type {
  ModelEndpointProfileV1,
  ModelProviderRegistry,
  ProviderChatMessageV1,
  ProviderChatResultV1,
  ProviderExecutionTargetV1,
  ProviderModelDescriptor,
  ProviderRegistrationV1,
} from '../../../core/engine/operateRuntime/model/ModelProviderContracts';
import type {
  RuntimeConfigEnvelopeV1,
  RuntimeConfigRepository,
  RuntimeRouteConfigV1,
} from '../../../core/engine/operateRuntime/contracts/RuntimeConfigContracts';

const COMPANION_PROFILE_ID = 'profile-companion';
const COMPANION_BINDING_ID = 'binding-companion';
const COMPANION_MODEL_ID = 'deepseek-chat';
const COMPANION_SECRET_REF = 'secret:companion';

const VALID_CONTEXT: PetIntentContext = {
  temperament: 'calm',
  idleSeconds: 42,
  lastAction: 'idle_wing_soft',
};

function presetProfile(
  id: string,
  preset: 'deepseek' | 'openai',
  secretRef: string | null,
): ModelEndpointProfileV1 {
  return {
    id,
    label: preset,
    mode: 'preset',
    preset,
    baseURLOverride: null,
    region: null,
    channel: null,
    secretRef,
    generation: 1,
  };
}

function routeWithCompanion(
  secretRef: string | null = COMPANION_SECRET_REF,
): RuntimeRouteConfigV1 {
  return {
    capabilities: {phoneOperate: true, errands: false},
    privacy: {
      memoryEnabled: true,
      memoryLocation: 'device',
      memoryProfileId: null,
    },
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
      profiles: [
        presetProfile('profile-direct', 'openai', 'secret:direct'),
        presetProfile(COMPANION_PROFILE_ID, 'deepseek', secretRef),
      ],
      // `direct` is listed first on purpose: role selection must not pick it.
      bindings: [
        {
          id: 'binding-direct',
          role: 'direct',
          profileId: 'profile-direct',
          modelId: 'gpt-4o',
          maxSteps: 20,
        },
        {
          id: COMPANION_BINDING_ID,
          role: 'companion',
          profileId: COMPANION_PROFILE_ID,
          modelId: COMPANION_MODEL_ID,
          maxSteps: 5,
        },
      ],
    },
    visualAgent: {enabled: false, activeProfileId: null, profiles: []},
  };
}

function repoWith(active: RuntimeRouteConfigV1): RuntimeConfigRepository {
  const envelope: RuntimeConfigEnvelopeV1 = {
    schemaVersion: 1,
    revision: 1,
    active,
    draft: active,
  };
  return {
    load: jest.fn(async () => envelope),
    mutateDraft: jest.fn(),
    activateDraft: jest.fn(),
    compareAndActivate: jest.fn(),
    listProfiles: jest.fn(),
    listBindings: jest.fn(),
    putProfile: jest.fn(),
    putBinding: jest.fn(),
    removeProfile: jest.fn(),
  } as unknown as RuntimeConfigRepository;
}

const DESCRIPTOR: ProviderModelDescriptor = {
  id: COMPANION_MODEL_ID,
  displayName: COMPANION_MODEL_ID,
  inputModalities: ['text'],
  outputModalities: ['text'],
  capabilities: {chat: true, vision: false, toolCalls: false, reasoning: false},
  contextWindow: null,
  maxOutputTokens: null,
  metadataSource: 'manual',
};

const TARGET: ProviderExecutionTargetV1 = {
  provider: 'deepseek',
  transportAdapterId: 'openai',
  protocol: 'openai_chat_completions',
  baseURL: 'https://api.deepseek.com',
  auth: {kind: 'bearer'},
  chatPath: '/chat/completions',
  region: null,
  channel: null,
  secretRef: COMPANION_SECRET_REF,
  inputModalities: ['text'],
  outputModalities: ['text'],
  capabilities: {chat: true, vision: false, toolCalls: false, reasoning: false},
  capabilityTrust: 'user_declared_unverified',
};

function chatResult(text: string): ProviderChatResultV1 {
  return {
    text,
    finishReason: 'stop',
    usage: {inputTokens: null, outputTokens: null},
  };
}

interface FakeRegistry {
  readonly registry: ModelProviderRegistry;
  readonly sendChat: jest.Mock;
  readonly resolveExecutionTarget: jest.Mock;
  readonly resolveCatalog: jest.Mock;
  readonly resolveTransport: jest.Mock;
}

function makeRegistry(
  options: {
    text?: string;
    sendChat?: jest.Mock;
    targetThrows?: boolean;
    credentialRequirement?: 'required' | 'optional' | 'none';
  } = {},
): FakeRegistry {
  const sendChat =
    options.sendChat ??
    jest.fn(async () =>
      chatResult(options.text ?? '{"temperament":"curious"}'),
    );
  const target: ProviderExecutionTargetV1 = {
    ...TARGET,
    secretRef:
      options.credentialRequirement === 'none' ? null : TARGET.secretRef,
  };
  const resolveCatalog = jest.fn(() => ({
    listModels: jest.fn(),
    describeManualModel: jest.fn(() => DESCRIPTOR),
  }));
  const resolveExecutionTarget = jest.fn(() => {
    if (options.targetThrows) {
      throw new Error('model_profile_missing_credential');
    }
    return target;
  });
  const resolveTransport = jest.fn(() => ({id: 'openai', sendChat}));
  const listPresets = jest.fn(
    () =>
      [
        {
          preset: 'deepseek',
          credentialRequirement: options.credentialRequirement ?? 'required',
        },
      ] as unknown as readonly ProviderRegistrationV1[],
  );
  return {
    registry: {
      listPresets,
      resolveCatalog,
      resolveExecutionTarget,
      resolveTransport,
    } as unknown as ModelProviderRegistry,
    sendChat,
    resolveExecutionTarget,
    resolveCatalog,
    resolveTransport,
  };
}

describe('PetIntent contracts', () => {
  it('freezes exactly the four local temperaments', () => {
    expect(PET_TEMPERAMENTS).toEqual(['calm', 'curious', 'playful', 'sleepy']);
    expect(new Set(PET_TEMPERAMENTS).size).toBe(4);
  });

  it('bounds the local context it accepts', () => {
    expect(normalizePetIntentContext(VALID_CONTEXT)).toEqual(VALID_CONTEXT);
    expect(
      normalizePetIntentContext({...VALID_CONTEXT, lastAction: null}),
    ).toEqual({
      ...VALID_CONTEXT,
      lastAction: null,
    });
    expect(
      normalizePetIntentContext({...VALID_CONTEXT, lastAction: '   '}),
    ).toMatchObject({
      lastAction: null,
    });
    // Rejects rather than clamps: an out-of-range local state never reaches the model.
    expect(
      normalizePetIntentContext({...VALID_CONTEXT, idleSeconds: -1}),
    ).toBeNull();
    expect(
      normalizePetIntentContext({
        ...VALID_CONTEXT,
        idleSeconds: MAX_PET_IDLE_SECONDS + 1,
      }),
    ).toBeNull();
    expect(
      normalizePetIntentContext({...VALID_CONTEXT, idleSeconds: Number.NaN}),
    ).toBeNull();
    expect(
      normalizePetIntentContext({
        ...VALID_CONTEXT,
        idleSeconds: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull();
    expect(
      normalizePetIntentContext({
        ...VALID_CONTEXT,
        lastAction: 'x'.repeat(MAX_PET_LAST_ACTION_LENGTH + 1),
      }),
    ).toBeNull();
    expect(
      normalizePetIntentContext({...VALID_CONTEXT, temperament: 'angry'}),
    ).toBeNull();
    expect(
      normalizePetIntentContext({idleSeconds: 1, lastAction: null}),
    ).toBeNull();
    expect(normalizePetIntentContext(null)).toBeNull();
    expect(normalizePetIntentContext('calm')).toBeNull();
  });

  it('launders the last action label before it leaves the device', () => {
    const normalized = normalizePetIntentContext({
      ...VALID_CONTEXT,
      lastAction: '  manual_wave  ',
    });
    expect(normalized?.lastAction).toBe('manual_wave');
  });

  it('accepts only a single temperament field in a model response', () => {
    expect(parsePetIntentResponse('{"temperament":"sleepy"}')).toEqual({
      temperament: 'sleepy',
    });
    expect(
      parsePetIntentResponse('```json\n{"temperament":"playful"}\n```'),
    ).toEqual({
      temperament: 'playful',
    });
    // Nothing beyond the single allowed field survives validation.
    expect(
      parsePetIntentResponse('{"temperament":"calm","angle":95}'),
    ).toBeNull();
    expect(
      parsePetIntentResponse('{"temperament":"calm","action":"dance"}'),
    ).toBeNull();
    expect(parsePetIntentResponse('{"temperament":"angry"}')).toBeNull();
    expect(parsePetIntentResponse('{"temperament":1}')).toBeNull();
    expect(parsePetIntentResponse('["calm"]')).toBeNull();
    expect(parsePetIntentResponse('calm')).toBeNull();
    expect(parsePetIntentResponse('{"temperament":')).toBeNull();
    expect(parsePetIntentResponse('')).toBeNull();
    expect(
      parsePetIntentResponse('the mood is {"temperament":"calm"}'),
    ).toBeNull();
  });

  it('sends only local character state and demands one JSON field back', () => {
    const messages = buildPetIntentMessages(VALID_CONTEXT);
    expect(messages).toHaveLength(2);
    expect(messages.map(message => message.role)).toEqual(['system', 'user']);
    for (const message of messages) {
      expect(message.imageDataURI).toBeUndefined();
    }
    const system = messages[0].text;
    expect(system).toContain('JSON');
    for (const temperament of PET_TEMPERAMENTS) {
      expect(system).toContain(temperament);
    }
    const user = messages[1].text;
    expect(user).toContain('calm');
    expect(user).toContain('42');
    expect(user).toContain('idle_wing_soft');
    // No transcript, screenshot, credential or other private payload is present.
    for (const message of messages) {
      expect(message.text).not.toContain(COMPANION_SECRET_REF);
      expect(message.text.toLowerCase()).not.toContain('base64');
      expect(message.text).not.toContain('对话');
    }
  });
});

describe('requestPetIntent model call', () => {
  it('uses the bound role=companion model through the existing registry', async () => {
    const repo = repoWith(routeWithCompanion());
    const fake = makeRegistry();
    const result = await requestPetIntent(
      {repo, registry: fake.registry},
      VALID_CONTEXT,
      new AbortController().signal,
    );

    expect(result).toEqual({temperament: 'curious'});
    expect(fake.resolveCatalog).toHaveBeenCalledTimes(1);
    expect(fake.resolveExecutionTarget).toHaveBeenCalledTimes(1);
    const [profile, descriptor] = fake.resolveExecutionTarget.mock.calls[0] as [
      ModelEndpointProfileV1,
      ProviderModelDescriptor,
    ];
    expect(profile.id).toBe(COMPANION_PROFILE_ID);
    expect(descriptor.id).toBe(COMPANION_MODEL_ID);
    expect(fake.sendChat).toHaveBeenCalledTimes(1);
    const request = fake.sendChat.mock.calls[0][0] as {
      target: ProviderExecutionTargetV1;
      messages: readonly ProviderChatMessageV1[];
      timeoutMs: number;
    };
    expect(request.target.secretRef).toBe(COMPANION_SECRET_REF);
    expect(request.messages).toHaveLength(2);
    expect(request.timeoutMs).toBe(PET_INTENT_REQUEST_TIMEOUT_MS);
  });

  it('honours a host-supplied timeout without adding its own timers', async () => {
    const fake = makeRegistry();
    await requestPetIntent(
      {
        repo: repoWith(routeWithCompanion()),
        registry: fake.registry,
        timeoutMs: 3_000,
      },
      VALID_CONTEXT,
      new AbortController().signal,
    );
    expect(
      (fake.sendChat.mock.calls[0][0] as {timeoutMs: number}).timeoutMs,
    ).toBe(3_000);
  });

  it('returns null without a request when no companion binding is configured', async () => {
    const route = routeWithCompanion();
    const noCompanion: RuntimeRouteConfigV1 = {
      ...route,
      modelAPI: {
        ...route.modelAPI,
        bindings: route.modelAPI.bindings.filter(
          binding => binding.role !== 'companion',
        ),
      },
    };
    const fake = makeRegistry();
    await expect(
      requestPetIntent(
        {repo: repoWith(noCompanion), registry: fake.registry},
        VALID_CONTEXT,
        new AbortController().signal,
      ),
    ).resolves.toBeNull();
    expect(fake.resolveExecutionTarget).not.toHaveBeenCalled();
    expect(fake.sendChat).not.toHaveBeenCalled();
  });

  it('returns null when the companion profile is missing', async () => {
    const route = routeWithCompanion();
    const noProfile: RuntimeRouteConfigV1 = {
      ...route,
      modelAPI: {
        ...route.modelAPI,
        profiles: route.modelAPI.profiles.filter(
          profile => profile.id !== COMPANION_PROFILE_ID,
        ),
      },
    };
    const fake = makeRegistry();
    await expect(
      requestPetIntent(
        {repo: repoWith(noProfile), registry: fake.registry},
        VALID_CONTEXT,
        new AbortController().signal,
      ),
    ).resolves.toBeNull();
    expect(fake.sendChat).not.toHaveBeenCalled();
  });

  it('returns null when the bound profile has no credential reference', async () => {
    const fake = makeRegistry();
    await expect(
      requestPetIntent(
        {repo: repoWith(routeWithCompanion(null)), registry: fake.registry},
        VALID_CONTEXT,
        new AbortController().signal,
      ),
    ).resolves.toBeNull();
    expect(fake.resolveExecutionTarget).not.toHaveBeenCalled();
    expect(fake.sendChat).not.toHaveBeenCalled();
  });

  it('never reads or logs credential material and never opens a chat turn', async () => {
    const setItem = AsyncStorage.setItem as jest.Mock;
    setItem.mockClear();
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const error = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      const fake = makeRegistry({targetThrows: true});
      await expect(
        requestPetIntent(
          {repo: repoWith(routeWithCompanion()), registry: fake.registry},
          VALID_CONTEXT,
          new AbortController().signal,
        ),
      ).resolves.toBeNull();
      expect(fake.sendChat).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it('rejects an invalid context before touching config or the network', async () => {
    const repo = repoWith(routeWithCompanion());
    const fake = makeRegistry();
    await expect(
      requestPetIntent(
        {repo, registry: fake.registry},
        {temperament: 'calm', idleSeconds: -5, lastAction: null},
        new AbortController().signal,
      ),
    ).resolves.toBeNull();
    expect(repo.load).not.toHaveBeenCalled();
    expect(fake.sendChat).not.toHaveBeenCalled();
  });
});

describe('requestPetIntent abort and failure fallback', () => {
  it('does not start a request on an already aborted signal', async () => {
    const repo = repoWith(routeWithCompanion());
    const fake = makeRegistry();
    const controller = new AbortController();
    controller.abort();
    await expect(
      requestPetIntent(
        {repo, registry: fake.registry},
        VALID_CONTEXT,
        controller.signal,
      ),
    ).resolves.toBeNull();
    expect(repo.load).not.toHaveBeenCalled();
    expect(fake.sendChat).not.toHaveBeenCalled();
  });

  it('stops after config load when the signal aborts mid-flight', async () => {
    const controller = new AbortController();
    const route = routeWithCompanion();
    const envelope: RuntimeConfigEnvelopeV1 = {
      schemaVersion: 1,
      revision: 1,
      active: route,
      draft: route,
    };
    const repo = {
      load: jest.fn(async () => {
        controller.abort();
        return envelope;
      }),
    } as unknown as RuntimeConfigRepository;
    const fake = makeRegistry();
    await expect(
      requestPetIntent(
        {repo, registry: fake.registry},
        VALID_CONTEXT,
        controller.signal,
      ),
    ).resolves.toBeNull();
    expect(fake.sendChat).not.toHaveBeenCalled();
  });

  it('drops a stale response that resolves after the abort', async () => {
    const controller = new AbortController();
    const fake = makeRegistry({
      sendChat: jest.fn(async () => {
        controller.abort();
        return chatResult('{"temperament":"playful"}');
      }),
    });
    await expect(
      requestPetIntent(
        {repo: repoWith(routeWithCompanion()), registry: fake.registry},
        VALID_CONTEXT,
        controller.signal,
      ),
    ).resolves.toBeNull();
  });

  it('falls back locally when the transport rejects', async () => {
    const fake = makeRegistry({
      sendChat: jest.fn(async () => {
        throw new Error('network_unreachable');
      }),
    });
    await expect(
      requestPetIntent(
        {repo: repoWith(routeWithCompanion()), registry: fake.registry},
        VALID_CONTEXT,
        new AbortController().signal,
      ),
    ).resolves.toBeNull();
  });

  it('falls back locally when the reply is not a strict temperament', async () => {
    for (const text of [
      '{"temperament":"calm","script":"spin"}',
      '{"temperament":"furious"}',
      '抱歉，我不能这样做。',
      '{"temperament":"calm"',
    ]) {
      const fake = makeRegistry({text});
      await expect(
        requestPetIntent(
          {repo: repoWith(routeWithCompanion()), registry: fake.registry},
          VALID_CONTEXT,
          new AbortController().signal,
        ),
      ).resolves.toBeNull();
    }
  });

  it('falls back locally when config storage fails', async () => {
    const repo = {
      load: jest.fn(async () => {
        throw new Error('storage_unavailable');
      }),
    } as unknown as RuntimeConfigRepository;
    const fake = makeRegistry();
    await expect(
      requestPetIntent(
        {repo, registry: fake.registry},
        VALID_CONTEXT,
        new AbortController().signal,
      ),
    ).resolves.toBeNull();
  });
});

describe('companion facade pet intent wiring', () => {
  it('returns null when the composition has no pet intent service', async () => {
    const port: CompanionApplicationPort = {
      getState: jest.fn(),
      submitTranscript: jest.fn(),
      confirmProposal: jest.fn(),
      dismissTurn: jest.fn(),
    };
    const facade = new DefaultCompanionFacade(port);
    await expect(
      facade.suggestPetIntent(VALID_CONTEXT, new AbortController().signal),
    ).resolves.toBeNull();
  });

  it('forwards context and signal to the optional application port method', async () => {
    const suggestPetIntent = jest.fn(
      async () => ({temperament: 'sleepy'} as const),
    );
    const port = {
      getState: jest.fn(),
      submitTranscript: jest.fn(),
      confirmProposal: jest.fn(),
      dismissTurn: jest.fn(),
      suggestPetIntent,
    } as unknown as CompanionApplicationPort;
    const facade = new DefaultCompanionFacade(port);
    const optionalFacade: CompanionFacade = facade;
    const controller = new AbortController();
    expect(typeof optionalFacade.suggestPetIntent).toBe('function');
    await expect(
      facade.suggestPetIntent(VALID_CONTEXT, controller.signal),
    ).resolves.toEqual({
      temperament: 'sleepy',
    });
    expect(suggestPetIntent).toHaveBeenCalledWith(
      VALID_CONTEXT,
      controller.signal,
    );
  });

  it('keeps the production port inert without a provider registry', async () => {
    const port = new RuntimeCompanionPort(repoWith(routeWithCompanion()));
    await expect(
      port.suggestPetIntent?.(VALID_CONTEXT, new AbortController().signal),
    ).resolves.toBeNull();
  });

  it('returns only a temperament through the production port, without side effects', async () => {
    const setItem = AsyncStorage.setItem as jest.Mock;
    setItem.mockClear();
    const fake = makeRegistry();
    const port = new RuntimeCompanionPort(
      repoWith(routeWithCompanion()),
      fake.registry,
    );
    await expect(
      port.suggestPetIntent?.(VALID_CONTEXT, new AbortController().signal),
    ).resolves.toEqual({temperament: 'curious'});
    expect(fake.sendChat).toHaveBeenCalledTimes(1);
    expect(setItem).not.toHaveBeenCalled();
    // Existing conversation API is untouched by an idle intent request.
    await expect(port.getState()).resolves.toMatchObject({
      phase: 'idle',
      modelLabel: 'DeepSeek',
    });
  });
});
