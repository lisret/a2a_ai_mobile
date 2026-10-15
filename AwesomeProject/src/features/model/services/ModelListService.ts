/**
 * UI-only model configuration helpers.
 *
 * - `mapProviderCatalog` is the narrow mapper from the runtime
 *   `ProviderModelCatalogResult` to the `ModelCatalogViewState` a Screen renders.
 *   It does not fetch, does not know any provider identities, and never assumes
 *   an OpenAI-compatible shape. The single place it is wired to a live catalog
 *   port is the ModelConfig ApplicationPort in `createAppFacades`;
 *   `ModelNameSelector` must not import it.
 * - `buildRefreshInput` / `buildSaveInput` project the local editable draft into
 *   the frozen, discriminated `ModelCatalogRefreshInput` / `ModelConfigSaveInput`
 *   so preset and custom required fields stay type-exclusive. Navigation params
 *   and these inputs never carry credential plaintext except the explicit
 *   `credential` intent chosen by the user.
 */
import type {
  ProviderModelCatalogResult,
  ProviderModelDescriptor,
} from '@core/engine/operateRuntime/model/ModelProviderContracts';
import type {ModelListKey} from '@shared/types/Model';
import type {
  CredentialEditIntent,
  CustomProviderConfigViewState,
  ModelCatalogRefreshInput,
  ModelCatalogViewState,
  ModelConfigSaveInput,
  ProviderPresetId,
} from '../../../application/facades/UiRuntimeContracts';

const toEntry = (descriptor: ProviderModelDescriptor): {id: string; label: string} => ({
  id: descriptor.id,
  label: descriptor.displayName || descriptor.id,
});

/**
 * Map a runtime catalog result to a UI catalog view state. `ready` with
 * `stale === true` maps to the UI `stale` status; unsupported/auth/network/empty
 * map to their distinct UI statuses. Manual model-id entry is always allowed by
 * the runtime contract, so the Screen keeps its manual input in every state.
 */
export function mapProviderCatalog(
  result: ProviderModelCatalogResult,
  requestGeneration: number,
): ModelCatalogViewState {
  switch (result.status) {
    case 'ready': {
      return {
        requestGeneration,
        status: result.stale ? 'stale' : 'ready',
        models: result.models.map(toEntry),
      };
    }
    case 'unsupported': {
      return {
        requestGeneration,
        status: 'unsupported',
        models: result.models.map(toEntry),
      };
    }
    case 'auth_failed':
    case 'network_failed':
    case 'empty': {
      return {
        requestGeneration,
        status: result.status,
        models: [],
      };
    }
  }
}

export interface ModelDraftState {
  mode: 'preset' | 'custom';
  presetId: ProviderPresetId;
  baseUrlOverride: string;
  custom: CustomProviderConfigViewState;
  modelId: string;
}

// A neutral custom draft. It deliberately does NOT pre-fill OpenAI protocol,
// auth, or paths — the user must declare their own service shape.
export const DEFAULT_CUSTOM_PROVIDER: CustomProviderConfigViewState = {
  providerLabel: '',
  baseUrl: '',
  protocol: 'custom_http_json',
  auth: {kind: 'bearer'},
  chatPath: '',
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
  capabilityTrust: 'user_declared_unverified',
};

export function buildRefreshInput(
  draft: ModelDraftState,
  opts: {
    list: ModelListKey;
    requestGeneration: number;
    credential: Extract<CredentialEditIntent, {action: 'keep' | 'replace'}>;
    bindingId?: string;
  },
): ModelCatalogRefreshInput {
  const base = {
    list: opts.list,
    bindingId: opts.bindingId,
    requestGeneration: opts.requestGeneration,
    credential: opts.credential,
  };
  if (draft.mode === 'preset') {
    return {
      ...base,
      mode: 'preset',
      presetId: draft.presetId,
      baseUrlOverride: draft.baseUrlOverride.trim() ? draft.baseUrlOverride.trim() : null,
    };
  }
  return {
    ...base,
    mode: 'custom',
    customProviderLabel: draft.custom.providerLabel,
    baseUrl: draft.custom.baseUrl,
    protocol: draft.custom.protocol,
    auth: draft.custom.auth,
    chatPath: draft.custom.chatPath,
    modelListPath: draft.custom.modelListPath,
    declaredCapabilities: draft.custom.declaredCapabilities,
  };
}

export function buildSaveInput(
  draft: ModelDraftState,
  opts: {
    list: ModelListKey;
    expectedRevision: number;
    credential: CredentialEditIntent;
    bindingId?: string;
  },
): ModelConfigSaveInput {
  const base = {
    list: opts.list,
    bindingId: opts.bindingId,
    selectedModelId: draft.modelId.trim(),
    credential: opts.credential,
    expectedRevision: opts.expectedRevision,
  };
  if (draft.mode === 'preset') {
    return {
      ...base,
      mode: 'preset',
      presetId: draft.presetId,
      baseUrlOverride: draft.baseUrlOverride.trim() ? draft.baseUrlOverride.trim() : null,
    };
  }
  return {
    ...base,
    mode: 'custom',
    customProviderLabel: draft.custom.providerLabel,
    baseUrl: draft.custom.baseUrl,
    protocol: draft.custom.protocol,
    auth: draft.custom.auth,
    chatPath: draft.custom.chatPath,
    modelListPath: draft.custom.modelListPath,
    declaredCapabilities: draft.custom.declaredCapabilities,
  };
}
