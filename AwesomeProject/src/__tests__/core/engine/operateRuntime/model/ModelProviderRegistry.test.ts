import {createModelProviderRegistry} from '../../../../../core/engine/operateRuntime/model/ModelProviderRegistry';
import type {CredentialStore} from '../../../../../core/engine/operateRuntime/contracts/CredentialStore';
import type {
  ModelCatalogCache,
  ModelEndpointProfileV1,
  ModelProviderRegistry,
  ProviderModelDescriptor,
} from '../../../../../core/engine/operateRuntime/model/ModelProviderContracts';

const credentials: CredentialStore = {
  isAvailable: jest.fn().mockResolvedValue(true),
  put: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
};

const cache: ModelCatalogCache = {
  read: jest.fn().mockResolvedValue(null),
  write: jest.fn().mockResolvedValue(undefined),
  deleteProfile: jest.fn().mockResolvedValue(undefined),
};

const makeRegistry = (): ModelProviderRegistry =>
  createModelProviderRegistry({
    credentials,
    fetchImpl: jest.fn(),
    cache,
    now: () => 1_000,
  });

const descriptor: ProviderModelDescriptor = {
  id: 'gpt-4o',
  displayName: 'GPT-4o',
  inputModalities: ['text', 'image'],
  outputModalities: ['text'],
  capabilities: {chat: true, vision: true, toolCalls: true, reasoning: 'unknown'},
  contextWindow: null,
  maxOutputTokens: null,
  metadataSource: 'remote',
};

const openaiProfile: ModelEndpointProfileV1 = {
  id: 'profile-openai',
  label: 'OpenAI',
  mode: 'preset',
  preset: 'openai',
  baseURLOverride: null,
  region: null,
  channel: null,
  secretRef: 'model:openai',
  generation: 1,
};

describe('ModelProviderRegistry', () => {
  it('lists all eleven built-in presets with exact bootstrap registration', () => {
    const presets = makeRegistry().listPresets();
    expect(presets).toHaveLength(11);
    const openai = presets.find(item => item.preset === 'openai');
    expect(openai).toMatchObject({
      defaultBaseURL: 'https://api.openai.com/v1',
      protocol: 'openai_responses',
      chatPath: '/responses',
      auth: {kind: 'bearer'},
      credentialRequirement: 'required',
      transportAdapterId: 'openai',
    });
    const anthropic = presets.find(item => item.preset === 'anthropic');
    expect(anthropic).toMatchObject({
      protocol: 'anthropic_messages',
      chatPath: '/messages',
      auth: {kind: 'header', headerName: 'x-api-key', prefix: ''},
      transportAdapterId: 'anthropic',
    });
    const gemini = presets.find(item => item.preset === 'gemini');
    expect(gemini).toMatchObject({
      protocol: 'gemini_generate_content',
      chatPath: '/models/{modelId}:generateContent',
      auth: {kind: 'header', headerName: 'x-goog-api-key', prefix: ''},
      transportAdapterId: 'gemini',
    });
  });

  it('normalizes a recursively frozen execution target that ignores later mutation', () => {
    const registry = makeRegistry();
    const profile = {...openaiProfile};
    const target = registry.resolveExecutionTarget(
      profile,
      descriptor,
      'verified_remote',
    );
    expect(target).toMatchObject({
      provider: 'openai',
      transportAdapterId: 'openai',
      protocol: 'openai_responses',
      baseURL: 'https://api.openai.com/v1',
      chatPath: '/responses',
      auth: {kind: 'bearer'},
      secretRef: 'model:openai',
      capabilityTrust: 'verified_remote',
    });
    expect(Object.isFrozen(target)).toBe(true);
    expect(Object.isFrozen(target.capabilities)).toBe(true);
    (profile as {secretRef: string | null}).secretRef = 'model:changed';
    (descriptor.inputModalities as string[]).push('audio');
    expect(target.secretRef).toBe('model:openai');
    expect(target.inputModalities).toEqual(['text', 'image']);
  });

  it('rejects a preset execution target with a missing credential', () => {
    const registry = makeRegistry();
    expect(() =>
      registry.resolveExecutionTarget(
        {...openaiProfile, secretRef: null},
        descriptor,
        'verified_remote',
      ),
    ).toThrow('model_profile_missing_credential');
  });

  it('resolves the transport by adapter id and rejects protocol mismatch', () => {
    const registry = makeRegistry();
    const target = registry.resolveExecutionTarget(
      openaiProfile,
      descriptor,
      'verified_remote',
    );
    expect(registry.resolveTransport(target).id).toBe('openai');
    const mismatched = {...target, protocol: 'anthropic_messages' as const};
    expect(() => registry.resolveTransport(mismatched)).toThrow(
      'provider_transport_protocol_mismatch',
    );
  });

  it('rejects a custom no-auth profile that still carries a credential ref', () => {
    const registry = makeRegistry();
    const profile: ModelEndpointProfileV1 = {
      id: 'profile-custom',
      label: 'Custom',
      mode: 'custom',
      custom: {
        protocol: 'custom_http_json',
        baseURL: 'https://custom.example/v1',
        auth: {kind: 'none'},
        chatPath: '/chat',
        modelListPath: null,
        declaredCapabilities: {
          inputModalities: ['text'],
          outputModalities: ['text'],
          capabilities: {
            chat: true,
            vision: 'unknown',
            toolCalls: 'unknown',
            reasoning: 'unknown',
          },
        },
      },
      region: null,
      channel: null,
      secretRef: 'model:should-not-exist',
      generation: 1,
    };
    expect(() =>
      registry.resolveExecutionTarget(profile, descriptor, 'user_declared_unverified'),
    ).toThrow('model_profile_unexpected_credential');
  });
});
