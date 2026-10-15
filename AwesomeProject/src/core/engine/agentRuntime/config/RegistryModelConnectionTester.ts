// Connection tester that normalizes a legacy ModelConnection into a
// ProviderExecutionTargetV1 via ModelProviderRegistry and sends that exact target.
import type {ModelConnection} from '../domain/AgentTypes';
import type {
  ModelEndpointProfileV1,
  ModelProviderRegistry,
  ProviderModelDescriptor,
  ProviderPresetV1,
} from '../../operateRuntime/model/ModelProviderContracts';

const PRESET_IDS: readonly ProviderPresetV1[] = [
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

const LEGACY_ALIASES: Readonly<Record<string, ProviderPresetV1>> = {
  zhipu: 'zhipu_glm',
  moonshot: 'moonshot_kimi',
};

const resolvePreset = (providerId: string): ProviderPresetV1 | null => {
  if ((PRESET_IDS as readonly string[]).includes(providerId)) {
    return providerId as ProviderPresetV1;
  }
  return LEGACY_ALIASES[providerId] ?? null;
};

const toProfile = (connection: ModelConnection): ModelEndpointProfileV1 => {
  const preset = resolvePreset(connection.providerId);
  if (preset) {
    return {
      id: connection.id,
      label: connection.providerId,
      mode: 'preset',
      preset,
      baseURLOverride: connection.baseUrl || null,
      region: null,
      channel: null,
      secretRef: connection.secretRef,
      generation: 1,
    };
  }
  return {
    id: connection.id,
    label: connection.providerId,
    mode: 'custom',
    custom: {
      protocol: 'openai_chat_completions',
      baseURL: connection.baseUrl,
      auth: {kind: 'bearer'},
      chatPath: '/chat/completions',
      modelListPath: null,
      declaredCapabilities: {
        inputModalities: connection.capabilities.vision ? ['text', 'image'] : ['text'],
        outputModalities: ['text'],
        capabilities: {
          chat: true,
          vision: connection.capabilities.vision,
          toolCalls: connection.capabilities.toolCalls,
          reasoning: connection.capabilities.thinking,
        },
      },
    },
    region: null,
    channel: null,
    secretRef: connection.secretRef,
    generation: 1,
  };
};

const toDescriptor = (connection: ModelConnection): ProviderModelDescriptor => ({
  id: connection.modelName,
  displayName: connection.modelName,
  inputModalities: connection.capabilities.vision ? ['text', 'image'] : ['text'],
  outputModalities: ['text'],
  capabilities: {
    chat: true,
    vision: connection.capabilities.vision,
    toolCalls: connection.capabilities.toolCalls,
    reasoning: connection.capabilities.thinking,
  },
  contextWindow: null,
  maxOutputTokens: null,
  metadataSource: 'manual',
});

export class RegistryModelConnectionTester {
  constructor(
    private readonly registry: ModelProviderRegistry,
    private readonly timeoutMs: number = 15_000,
  ) {}

  async test(
    connection: ModelConnection,
    _resolveSecret: () => Promise<string | null | undefined>,
  ): Promise<void> {
    const profile = toProfile(connection);
    const descriptor = toDescriptor(connection);
    const target = this.registry.resolveExecutionTarget(
      profile,
      descriptor,
      'user_declared_unverified',
    );
    const transport = this.registry.resolveTransport(target);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      await transport.sendChat({
        target,
        binding: {
          id: `probe-${connection.id}`,
          role: 'direct',
          profileId: profile.id,
          modelId: connection.modelName,
          maxSteps: 1,
        },
        messages: [{role: 'user', text: 'Reply with {"ok":true}.'}],
        signal: controller.signal,
        timeoutMs: this.timeoutMs,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
