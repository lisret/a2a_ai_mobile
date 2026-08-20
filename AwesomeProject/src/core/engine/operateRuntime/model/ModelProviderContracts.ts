// Frozen V1 model provider contracts (runtime-foundation Task 4A `Produces`).
// Pure types plus the two named validators; no transports, repositories, or native access.

export type ProviderPresetV1 =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'xai'
  | 'alibaba_bailian_qwen'
  | 'zhipu_glm'
  | 'moonshot_kimi'
  | 'minimax'
  | 'volcano_ark_doubao'
  | 'modelscope';

export type ProviderProtocolV1 =
  | 'openai_chat_completions'
  | 'openai_responses'
  | 'anthropic_messages'
  | 'gemini_generate_content'
  | 'custom_http_json';

export type ProviderAuthV1 =
  | {readonly kind: 'none'}
  | {readonly kind: 'bearer'}
  | {
      readonly kind: 'header';
      readonly headerName: string;
      readonly prefix: '' | 'Bearer ' | 'Token ' | 'Basic ';
    }
  | {readonly kind: 'query'; readonly queryName: string};

export interface ProviderCapabilityDeclarationV1 {
  readonly inputModalities: readonly ('text' | 'image' | 'audio' | 'video')[];
  readonly outputModalities: readonly ('text' | 'image' | 'audio')[];
  readonly capabilities: Readonly<{
    readonly chat: true;
    readonly vision: boolean | 'unknown';
    readonly toolCalls: boolean | 'unknown';
    readonly reasoning: boolean | 'unknown';
  }>;
}

export interface CustomProviderSpecV1 {
  readonly protocol: ProviderProtocolV1;
  readonly baseURL: string;
  readonly auth: ProviderAuthV1;
  readonly chatPath: string;
  readonly modelListPath: string | null;
  readonly declaredCapabilities: ProviderCapabilityDeclarationV1;
}

export interface ProviderExecutionTargetV1 {
  readonly provider: ProviderPresetV1 | 'custom';
  readonly transportAdapterId: 'openai' | 'anthropic' | 'gemini' | 'custom';
  readonly protocol: ProviderProtocolV1;
  readonly baseURL: string;
  readonly auth: ProviderAuthV1;
  readonly chatPath: string;
  readonly region: string | null;
  readonly channel: string | null;
  readonly secretRef: string | null;
  readonly inputModalities: Readonly<ProviderModelDescriptor['inputModalities']>;
  readonly outputModalities: Readonly<ProviderModelDescriptor['outputModalities']>;
  readonly capabilities: Readonly<ProviderModelDescriptor['capabilities']>;
  readonly capabilityTrust: 'verified_remote' | 'verified_signed' | 'user_declared_unverified';
}

export type ModelEndpointProfileV1 =
  | Readonly<{
      id: string;
      label: string;
      mode: 'preset';
      preset: ProviderPresetV1;
      baseURLOverride: string | null;
      region: string | null;
      channel: string | null;
      secretRef: string | null;
      generation: number;
    }>
  | Readonly<{
      id: string;
      label: string;
      mode: 'custom';
      custom: CustomProviderSpecV1;
      region: string | null;
      channel: string | null;
      secretRef: string | null;
      generation: number;
    }>;

export type ModelRole =
  | 'direct'
  | 'vision'
  | 'split_planner'
  | 'local_planner'
  | 'companion';

export interface ModelBindingV1 {
  readonly id: string;
  readonly role: ModelRole;
  readonly profileId: string;
  readonly modelId: string;
  readonly maxSteps: number;
}

export interface ProviderModelDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly inputModalities: readonly ('text' | 'image' | 'audio' | 'video')[];
  readonly outputModalities: readonly ('text' | 'image' | 'audio')[];
  readonly capabilities: Readonly<{
    chat: boolean | 'unknown';
    vision: boolean | 'unknown';
    toolCalls: boolean | 'unknown';
    reasoning: boolean | 'unknown';
  }>;
  readonly contextWindow: number | null;
  readonly maxOutputTokens: number | null;
  readonly metadataSource: 'remote' | 'signed_static' | 'manual';
}

export interface ProviderChatMessageV1 {
  readonly role: 'system' | 'user' | 'assistant';
  readonly text: string;
  readonly imageDataURI?: string;
}

export interface ProviderChatResultV1 {
  readonly text: string;
  readonly finishReason: string | null;
  readonly usage: Readonly<{
    inputTokens: number | null;
    outputTokens: number | null;
  }>;
}

export interface ProviderRegistrationV1 {
  readonly preset: ProviderPresetV1;
  readonly label: string;
  readonly defaultBaseURL: string;
  readonly protocol: ProviderProtocolV1;
  readonly chatPath: string;
  readonly auth: ProviderAuthV1;
  readonly credentialRequirement: 'required' | 'optional' | 'none';
  readonly transportAdapterId: ProviderTransportAdapter['id'];
  readonly catalog: Readonly<{
    kind: 'remote' | 'signed_static';
    modelListPath: string | null;
    pagination: 'none' | 'cursor' | 'page_token';
  }>;
}

export type ProviderModelCatalogResult =
  | Readonly<{
      status: 'ready';
      models: readonly ProviderModelDescriptor[];
      source: 'remote' | 'cache';
      stale: boolean;
      manualModelIdAllowed: true;
    }>
  | Readonly<{
      status: 'unsupported';
      models: readonly ProviderModelDescriptor[];
      source: 'signed_static' | 'none';
      manualModelIdAllowed: true;
    }>
  | Readonly<{
      status: 'auth_failed' | 'network_failed' | 'empty';
      models: readonly [];
      manualModelIdAllowed: true;
    }>;

export interface ProviderTransportAdapter {
  readonly id: 'openai' | 'anthropic' | 'gemini' | 'custom';
  sendChat(request: Readonly<{
    target: ProviderExecutionTargetV1;
    binding: ModelBindingV1;
    messages: readonly ProviderChatMessageV1[];
    signal: AbortSignal;
    timeoutMs: number;
  }>): Promise<ProviderChatResultV1>;
}

export interface ProviderModelCatalogPort {
  listModels(request: Readonly<{
    profile: ModelEndpointProfileV1;
    signal: AbortSignal;
    timeoutMs: number;
    requestGeneration: number;
  }>): Promise<ProviderModelCatalogResult>;
  describeManualModel(
    profile: ModelEndpointProfileV1,
    modelId: string,
  ): ProviderModelDescriptor;
}

export interface ModelCatalogCache {
  read(cacheKey: string): Promise<ProviderModelCatalogResult | null>;
  write(cacheKey: string, value: ProviderModelCatalogResult): Promise<void>;
  deleteProfile(profileId: string): Promise<void>;
}

export interface ModelProviderRegistry {
  listPresets(): readonly ProviderRegistrationV1[];
  resolveExecutionTarget(
    profile: ModelEndpointProfileV1,
    descriptor: ProviderModelDescriptor,
    capabilityTrust: ProviderExecutionTargetV1['capabilityTrust'],
  ): ProviderExecutionTargetV1;
  resolveTransport(target: ProviderExecutionTargetV1): ProviderTransportAdapter;
  resolveCatalog(profile: ModelEndpointProfileV1): ProviderModelCatalogPort;
}

export interface ModelEndpointProfileRepository {
  listProfiles(): Promise<readonly ModelEndpointProfileV1[]>;
  listBindings(): Promise<readonly ModelBindingV1[]>;
  putProfile(
    profile: ModelEndpointProfileV1,
    plaintextCredential?: string,
  ): Promise<void>;
  putBinding(binding: ModelBindingV1): Promise<void>;
  removeProfile(profileId: string): Promise<void>;
}

const PROVIDER_PRESETS: readonly ProviderPresetV1[] = [
  'openai',
  'anthropic',
  'gemini',
  'deepseek',
  'xai',
  'alibaba_bailian_qwen',
  'zhipu_glm',
  'moonshot_kimi',
  'minimax',
  'volcano_ark_doubao',
  'modelscope',
];

const PROVIDER_PROTOCOLS: readonly ProviderProtocolV1[] = [
  'openai_chat_completions',
  'openai_responses',
  'anthropic_messages',
  'gemini_generate_content',
  'custom_http_json',
];

const MODEL_ROLES: readonly ModelRole[] = [
  'direct',
  'vision',
  'split_planner',
  'local_planner',
  'companion',
];

/** Stable, ref-free validation failure carried on `.code`. */
export class ModelContractError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'ModelContractError';
    this.code = code;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;
const isStringOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';
const isPositiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const validateCustomProviderSpec = (value: unknown): void => {
  if (!isObject(value)) {
    throw new ModelContractError('model_profile_invalid_custom');
  }
  if (!PROVIDER_PROTOCOLS.includes(value.protocol as ProviderProtocolV1)) {
    throw new ModelContractError('model_profile_invalid_custom');
  }
  if (!isNonEmptyString(value.baseURL) || !isNonEmptyString(value.chatPath)) {
    throw new ModelContractError('model_profile_invalid_custom');
  }
  if (!isStringOrNull(value.modelListPath)) {
    throw new ModelContractError('model_profile_invalid_custom');
  }
  if (!isObject(value.auth) || typeof value.auth.kind !== 'string') {
    throw new ModelContractError('model_profile_invalid_custom');
  }
  if (!isObject(value.declaredCapabilities)) {
    throw new ModelContractError('model_profile_invalid_custom');
  }
};

export function validateModelEndpointProfileV1(
  value: unknown,
): ModelEndpointProfileV1 {
  if (!isObject(value)) {
    throw new ModelContractError('model_profile_invalid');
  }
  const mode = value.mode;
  if (mode !== 'preset' && mode !== 'custom') {
    throw new ModelContractError('model_profile_invalid_mode');
  }
  if (!isNonEmptyString(value.id) || typeof value.label !== 'string') {
    throw new ModelContractError('model_profile_invalid');
  }
  if (
    !isStringOrNull(value.region) ||
    !isStringOrNull(value.channel) ||
    !isStringOrNull(value.secretRef)
  ) {
    throw new ModelContractError('model_profile_invalid');
  }
  if (!isPositiveInt(value.generation)) {
    throw new ModelContractError('model_profile_invalid_generation');
  }
  if (mode === 'preset') {
    if ('custom' in value && value.custom !== undefined) {
      throw new ModelContractError('model_profile_invalid_preset');
    }
    if (!PROVIDER_PRESETS.includes(value.preset as ProviderPresetV1)) {
      throw new ModelContractError('model_profile_invalid_preset');
    }
    if (!isStringOrNull(value.baseURLOverride)) {
      throw new ModelContractError('model_profile_invalid_preset');
    }
  } else {
    if ('preset' in value && value.preset !== undefined) {
      throw new ModelContractError('model_profile_invalid_custom');
    }
    validateCustomProviderSpec(value.custom);
  }
  return value as unknown as ModelEndpointProfileV1;
}

export function validateModelBindingV1(value: unknown): ModelBindingV1 {
  if (!isObject(value)) {
    throw new ModelContractError('model_binding_invalid');
  }
  if (!MODEL_ROLES.includes(value.role as ModelRole)) {
    throw new ModelContractError('model_binding_invalid_role');
  }
  if (!isPositiveInt(value.maxSteps)) {
    throw new ModelContractError('model_binding_invalid_max_steps');
  }
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.profileId) ||
    !isNonEmptyString(value.modelId)
  ) {
    throw new ModelContractError('model_binding_invalid');
  }
  return value as unknown as ModelBindingV1;
}
