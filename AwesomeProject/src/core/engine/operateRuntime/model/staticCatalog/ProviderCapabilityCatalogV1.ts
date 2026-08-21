// Exact-schema, versioned capability asset shipped inside the platform-signed bundle.
// Trusted only via the installed app signature; never a downloaded replacement.
import type {
  ProviderModelDescriptor,
  ProviderPresetV1,
} from '../ModelProviderContracts';

export const REGISTRY_VERSION = 'registry-v1';
export const CATALOG_SCHEMA_VERSION = 'catalog-v1';

type CapabilityFacts = ProviderModelDescriptor['capabilities'];

export interface SignedProviderCatalogEntryV1 {
  /** Verified signed candidate models offered when there is no remote list endpoint. */
  readonly candidates: readonly ProviderModelDescriptor[];
  /** Signed capability enrichment keyed by exact model id for remote merges. */
  readonly capabilityById: Readonly<Record<string, CapabilityFacts>>;
}

export interface ProviderCapabilityCatalogV1 {
  readonly schemaVersion: typeof CATALOG_SCHEMA_VERSION;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly providers: Readonly<
    Record<ProviderPresetV1, SignedProviderCatalogEntryV1>
  >;
}

const textOnly = {
  inputModalities: ['text'] as const,
  outputModalities: ['text'] as const,
};

const visionCaps: CapabilityFacts = {
  chat: true,
  vision: true,
  toolCalls: true,
  reasoning: 'unknown',
};

const textCaps: CapabilityFacts = {
  chat: true,
  vision: false,
  toolCalls: true,
  reasoning: 'unknown',
};

const signedModel = (
  id: string,
  displayName: string,
  capabilities: CapabilityFacts,
  vision: boolean,
): ProviderModelDescriptor => ({
  id,
  displayName,
  inputModalities: vision ? ['text', 'image'] : ['text'],
  outputModalities: [...textOnly.outputModalities],
  capabilities,
  contextWindow: null,
  maxOutputTokens: null,
  metadataSource: 'signed_static',
});

const emptyEntry: SignedProviderCatalogEntryV1 = {
  candidates: [],
  capabilityById: {},
};

const remoteEnrichment = (
  entries: Record<string, CapabilityFacts>,
): SignedProviderCatalogEntryV1 => ({candidates: [], capabilityById: entries});

const signedStatic = (
  candidates: readonly ProviderModelDescriptor[],
): SignedProviderCatalogEntryV1 => ({
  candidates,
  capabilityById: Object.fromEntries(
    candidates.map(model => [model.id, model.capabilities]),
  ),
});

export const PROVIDER_CAPABILITY_CATALOG_V1: ProviderCapabilityCatalogV1 = {
  schemaVersion: CATALOG_SCHEMA_VERSION,
  registryVersion: REGISTRY_VERSION,
  providers: {
    openai: remoteEnrichment({
      'gpt-4o': visionCaps,
      'gpt-4o-mini': visionCaps,
    }),
    anthropic: remoteEnrichment({
      'claude-3-5-sonnet-latest': visionCaps,
    }),
    gemini: remoteEnrichment({
      'gemini-1.5-pro': visionCaps,
      'gemini-1.5-flash': visionCaps,
    }),
    deepseek: remoteEnrichment({
      'deepseek-chat': textCaps,
    }),
    xai: remoteEnrichment({
      'grok-2-vision': visionCaps,
    }),
    moonshot_kimi: remoteEnrichment({
      'moonshot-v1-8k': textCaps,
    }),
    minimax: remoteEnrichment({
      'abab6.5s-chat': textCaps,
    }),
    alibaba_bailian_qwen: signedStatic([
      signedModel('qwen-vl-max', 'Qwen VL Max', visionCaps, true),
      signedModel('qwen-max', 'Qwen Max', textCaps, false),
    ]),
    zhipu_glm: signedStatic([
      signedModel('glm-4v', 'GLM-4V', visionCaps, true),
      signedModel('glm-4', 'GLM-4', textCaps, false),
    ]),
    volcano_ark_doubao: signedStatic([
      signedModel('doubao-vision-pro', 'Doubao Vision Pro', visionCaps, true),
    ]),
    modelscope: signedStatic([
      signedModel('qwen2.5-vl', 'Qwen2.5-VL', visionCaps, true),
    ]),
  },
};

const CAPABILITY_KEYS = ['chat', 'vision', 'toolCalls', 'reasoning'] as const;

const isCapabilityFacts = (value: unknown): value is CapabilityFacts => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return CAPABILITY_KEYS.every(key => {
    const flag = record[key];
    return typeof flag === 'boolean' || flag === 'unknown';
  });
};

/** Validate schema/version/provider ids of the signed asset before trusting it. */
export function validateProviderCapabilityCatalogV1(
  value: unknown,
  presets: readonly ProviderPresetV1[],
): ProviderCapabilityCatalogV1 {
  if (value === null || typeof value !== 'object') {
    throw new Error('provider_catalog_asset_invalid');
  }
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== CATALOG_SCHEMA_VERSION ||
    record.registryVersion !== REGISTRY_VERSION
  ) {
    throw new Error('provider_catalog_asset_version');
  }
  const providers = record.providers;
  if (providers === null || typeof providers !== 'object') {
    throw new Error('provider_catalog_asset_invalid');
  }
  const providerRecord = providers as Record<string, unknown>;
  for (const preset of presets) {
    const entry = providerRecord[preset];
    if (entry === null || typeof entry !== 'object') {
      throw new Error('provider_catalog_asset_provider_missing');
    }
    const {candidates, capabilityById} = entry as Record<string, unknown>;
    if (!Array.isArray(candidates)) {
      throw new Error('provider_catalog_asset_invalid');
    }
    if (capabilityById === null || typeof capabilityById !== 'object') {
      throw new Error('provider_catalog_asset_invalid');
    }
    for (const facts of Object.values(capabilityById as Record<string, unknown>)) {
      if (!isCapabilityFacts(facts)) {
        throw new Error('provider_catalog_asset_invalid');
      }
    }
  }
  return value as ProviderCapabilityCatalogV1;
}

export {emptyEntry as EMPTY_SIGNED_CATALOG_ENTRY};
