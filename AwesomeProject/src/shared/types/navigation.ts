import type {NavigatorScreenParams} from '@react-navigation/native';
import type {ModelListKey} from './Model';
import type {ProviderPresetV1} from '@core/engine/operateRuntime/model/ModelProviderContracts';
import type {BuiltInVisualAgentToolId} from '../../application/facades/UiRuntimeContracts';

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  // Navigation params must never carry secrets; only the non-sensitive list key.
  AddModel: {list?: ModelListKey} | undefined;
  // Binding id is the canonical runtime identity; never reuse `modelId` here.
  EditModel: {bindingId: string; list?: ModelListKey};
  TaskHistory: {modelId: string};
  TaskDetail: {taskId: string};
  APIKeyGuide: {presetId?: ProviderPresetV1; mode?: 'preset' | 'custom'} | undefined;
  DebugLog: undefined;
  PhoneOperate: undefined;
  // Canonical visual-agent tools route; `OpenClaw` is a compatibility alias that
  // immediately replaces to this route with `{initialPreset: 'openclaw'}`.
  VisualAgentTools: {initialPreset?: BuiltInVisualAgentToolId} | undefined;
  OpenClaw: undefined;
  Errands: undefined;
  Privacy: undefined;
  CompanionConfig: undefined;
  AvatarLooks: undefined;
  ErrandDetail: {errandId: string};
  About: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Capabilities: undefined;
  History: undefined;
  Settings: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

const PROVIDER_PRESET_IDS: readonly ProviderPresetV1[] = [
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

// Legacy deep links used pre-canonical provider ids; they are mapped exactly once
// at the navigation boundary and never re-enter Screen/telemetry state.
const LEGACY_PROVIDER_ID_ALIASES: Readonly<Record<string, ProviderPresetV1>> = {
  zhipu: 'zhipu_glm',
  moonshot: 'moonshot_kimi',
};

/**
 * Resolve a (possibly legacy) providerId string to a canonical `ProviderPresetV1`,
 * or `null` when it is unknown so it never enters Screen state.
 */
export function mapLegacyProviderIdToPreset(
  providerId: string,
): ProviderPresetV1 | null {
  if (PROVIDER_PRESET_IDS.includes(providerId as ProviderPresetV1)) {
    return providerId as ProviderPresetV1;
  }
  return LEGACY_PROVIDER_ID_ALIASES[providerId] ?? null;
}

export type ApiKeyGuideParams = {
  presetId?: ProviderPresetV1;
  mode?: 'preset' | 'custom';
};

/**
 * Normalize an incoming APIKeyGuide deep link into canonical params. Legacy
 * `{providerId}` links are converted; unknown providers are dropped (returns
 * `undefined`) rather than guessing a URL.
 */
export function normalizeApiKeyGuideDeepLink(
  raw:
    | {providerId?: string; presetId?: ProviderPresetV1; mode?: 'preset' | 'custom'}
    | undefined,
): ApiKeyGuideParams | undefined {
  if (!raw) {
    return undefined;
  }
  if (raw.presetId || raw.mode) {
    const params: ApiKeyGuideParams = {};
    if (raw.presetId) {
      params.presetId = raw.presetId;
    }
    if (raw.mode) {
      params.mode = raw.mode;
    }
    return params;
  }
  if (typeof raw.providerId === 'string') {
    const preset = mapLegacyProviderIdToPreset(raw.providerId);
    return preset ? {presetId: preset} : undefined;
  }
  return undefined;
}
