// Versioned built-in provider registry: presets, execution-target normalization,
// transport selection and catalog resolution. No screen/selector/service dependency.
import type {CredentialStore} from '../contracts/CredentialStore';
import type {
  ModelCatalogCache,
  ModelEndpointProfileV1,
  ModelProviderRegistry,
  ProviderExecutionTargetV1,
  ProviderModelCatalogPort,
  ProviderModelDescriptor,
  ProviderProtocolV1,
  ProviderRegistrationV1,
  ProviderTransportAdapter,
} from './ModelProviderContracts';
import {ProviderModelCatalogService} from './ProviderModelCatalogService';
import {AnthropicProviderTransportAdapter} from './transports/AnthropicProviderTransportAdapter';
import {CustomProviderTransportAdapter} from './transports/CustomProviderTransportAdapter';
import {GeminiProviderTransportAdapter} from './transports/GeminiProviderTransportAdapter';
import {OpenAIProviderTransportAdapter} from './transports/OpenAIProviderTransportAdapter';
import {
  ProviderTransportError,
  type ProviderFetch,
  resolveEndpointUrl,
} from './transports/providerHttp';

export interface ModelProviderRegistryDependencies {
  readonly credentials: CredentialStore;
  readonly fetchImpl: ProviderFetch;
  readonly cache: ModelCatalogCache;
  readonly now: () => number;
}

const openAICompatible = (
  preset: ProviderRegistrationV1['preset'],
  label: string,
  defaultBaseURL: string,
  catalogKind: 'remote' | 'signed_static',
): ProviderRegistrationV1 => ({
  preset,
  label,
  defaultBaseURL,
  protocol: 'openai_chat_completions',
  chatPath: '/chat/completions',
  auth: {kind: 'bearer'},
  credentialRequirement: 'required',
  transportAdapterId: 'openai',
  catalog: {
    kind: catalogKind,
    modelListPath: catalogKind === 'remote' ? '/models' : null,
    pagination: 'none',
  },
});

const BUILT_IN_REGISTRATIONS: readonly ProviderRegistrationV1[] = [
  {
    preset: 'openai',
    label: 'OpenAI',
    defaultBaseURL: 'https://api.openai.com/v1',
    protocol: 'openai_responses',
    chatPath: '/responses',
    auth: {kind: 'bearer'},
    credentialRequirement: 'required',
    transportAdapterId: 'openai',
    catalog: {kind: 'remote', modelListPath: '/models', pagination: 'none'},
  },
  {
    preset: 'anthropic',
    label: 'Anthropic',
    defaultBaseURL: 'https://api.anthropic.com/v1',
    protocol: 'anthropic_messages',
    chatPath: '/messages',
    auth: {kind: 'header', headerName: 'x-api-key', prefix: ''},
    credentialRequirement: 'required',
    transportAdapterId: 'anthropic',
    catalog: {kind: 'remote', modelListPath: '/models', pagination: 'cursor'},
  },
  {
    preset: 'gemini',
    label: 'Gemini',
    defaultBaseURL: 'https://generativelanguage.googleapis.com/v1beta',
    protocol: 'gemini_generate_content',
    chatPath: '/models/{modelId}:generateContent',
    auth: {kind: 'header', headerName: 'x-goog-api-key', prefix: ''},
    credentialRequirement: 'required',
    transportAdapterId: 'gemini',
    catalog: {kind: 'remote', modelListPath: '/models', pagination: 'page_token'},
  },
  openAICompatible('deepseek', 'DeepSeek', 'https://api.deepseek.com', 'remote'),
  openAICompatible('xai', 'xAI', 'https://api.x.ai/v1', 'remote'),
  openAICompatible(
    'alibaba_bailian_qwen',
    'Alibaba Bailian/Qwen',
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
    'signed_static',
  ),
  openAICompatible(
    'zhipu_glm',
    'Zhipu GLM',
    'https://open.bigmodel.cn/api/paas/v4',
    'signed_static',
  ),
  openAICompatible(
    'moonshot_kimi',
    'Moonshot/Kimi',
    'https://api.moonshot.cn/v1',
    'remote',
  ),
  openAICompatible('minimax', 'MiniMax', 'https://api.minimax.io/v1', 'remote'),
  openAICompatible(
    'volcano_ark_doubao',
    'Volcano Ark/Doubao',
    'https://ark.cn-beijing.volces.com/api/v3',
    'signed_static',
  ),
  openAICompatible(
    'modelscope',
    'ModelScope',
    'https://api-inference.modelscope.cn/v1',
    'signed_static',
  ),
];

const PROTOCOL_BY_ADAPTER: Readonly<
  Record<ProviderTransportAdapter['id'], readonly ProviderProtocolV1[]>
> = {
  openai: ['openai_chat_completions', 'openai_responses'],
  anthropic: ['anthropic_messages'],
  gemini: ['gemini_generate_content'],
  custom: [
    'openai_chat_completions',
    'openai_responses',
    'anthropic_messages',
    'gemini_generate_content',
    'custom_http_json',
  ],
};

const deepFreeze = <T>(value: T): T => {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value) as T;
  }
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(value) as T;
  }
  return value;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

class ModelProviderRegistryImpl implements ModelProviderRegistry {
  private readonly registrations = BUILT_IN_REGISTRATIONS;
  private readonly transports: Record<
    ProviderTransportAdapter['id'],
    ProviderTransportAdapter
  >;
  private readonly catalogService: ProviderModelCatalogService;

  constructor(deps: ModelProviderRegistryDependencies) {
    this.transports = {
      openai: new OpenAIProviderTransportAdapter(deps.credentials, deps.fetchImpl),
      anthropic: new AnthropicProviderTransportAdapter(
        deps.credentials,
        deps.fetchImpl,
      ),
      gemini: new GeminiProviderTransportAdapter(deps.credentials, deps.fetchImpl),
      custom: new CustomProviderTransportAdapter(deps.credentials, deps.fetchImpl),
    };
    this.catalogService = new ProviderModelCatalogService({
      registrations: this.registrations,
      credentials: deps.credentials,
      fetchImpl: deps.fetchImpl,
      cache: deps.cache,
      now: deps.now,
    });
  }

  listPresets(): readonly ProviderRegistrationV1[] {
    return deepFreeze(clone(this.registrations));
  }

  resolveExecutionTarget(
    profile: ModelEndpointProfileV1,
    descriptor: ProviderModelDescriptor,
    capabilityTrust: ProviderExecutionTargetV1['capabilityTrust'],
  ): ProviderExecutionTargetV1 {
    const snapshot = clone(profile);
    const descriptorSnapshot = clone(descriptor);
    let target: ProviderExecutionTargetV1;
    if (snapshot.mode === 'preset') {
      const registration = this.registrations.find(
        item => item.preset === snapshot.preset,
      );
      if (!registration) {
        throw new ProviderTransportError('model_registry_unknown_preset');
      }
      const baseURL = snapshot.baseURLOverride ?? registration.defaultBaseURL;
      this.assertCredential(registration.auth, snapshot.secretRef);
      resolveEndpointUrl(baseURL, registration.chatPath);
      target = {
        provider: snapshot.preset,
        transportAdapterId: registration.transportAdapterId,
        protocol: registration.protocol,
        baseURL,
        auth: registration.auth,
        chatPath: registration.chatPath,
        region: snapshot.region,
        channel: snapshot.channel,
        secretRef: snapshot.secretRef,
        inputModalities: descriptorSnapshot.inputModalities,
        outputModalities: descriptorSnapshot.outputModalities,
        capabilities: descriptorSnapshot.capabilities,
        capabilityTrust,
      };
    } else {
      const spec = snapshot.custom;
      this.assertCredential(spec.auth, snapshot.secretRef);
      resolveEndpointUrl(spec.baseURL, spec.chatPath);
      target = {
        provider: 'custom',
        transportAdapterId: 'custom',
        protocol: spec.protocol,
        baseURL: spec.baseURL,
        auth: spec.auth,
        chatPath: spec.chatPath,
        region: snapshot.region,
        channel: snapshot.channel,
        secretRef: snapshot.secretRef,
        inputModalities: descriptorSnapshot.inputModalities,
        outputModalities: descriptorSnapshot.outputModalities,
        capabilities: descriptorSnapshot.capabilities,
        capabilityTrust,
      };
    }
    return deepFreeze(target);
  }

  resolveTransport(target: ProviderExecutionTargetV1): ProviderTransportAdapter {
    const transport = this.transports[target.transportAdapterId];
    if (!transport) {
      throw new ProviderTransportError('provider_transport_adapter_not_found');
    }
    if (!PROTOCOL_BY_ADAPTER[transport.id].includes(target.protocol)) {
      throw new ProviderTransportError('provider_transport_protocol_mismatch');
    }
    return transport;
  }

  resolveCatalog(_profile: ModelEndpointProfileV1): ProviderModelCatalogPort {
    return this.catalogService;
  }

  private assertCredential(
    auth: ProviderExecutionTargetV1['auth'],
    secretRef: string | null,
  ): void {
    if (auth.kind === 'none') {
      if (secretRef !== null) {
        throw new ProviderTransportError('model_profile_unexpected_credential');
      }
      return;
    }
    if (!secretRef) {
      throw new ProviderTransportError('model_profile_missing_credential');
    }
  }
}

export function createModelProviderRegistry(
  deps: ModelProviderRegistryDependencies,
): ModelProviderRegistry {
  return new ModelProviderRegistryImpl(deps);
}

export {BUILT_IN_REGISTRATIONS};
