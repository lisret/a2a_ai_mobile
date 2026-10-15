/**
 * Provider preset presentation catalog.
 *
 * The single source of truth for provider identity/connection metadata is the
 * runtime `ModelProviderRegistry`. This module only owns UI concerns keyed by
 * canonical `ProviderPresetV1`: localized display labels, localized credential
 * guides, and the HTTPS host allow-list for opening official consoles. It must
 * never carry base URLs, auth headers, or model-catalog metadata, and `custom`
 * is intentionally not a preset entry.
 */
import type {ProviderPresetV1} from '@core/engine/operateRuntime/model/ModelProviderContracts';

export type ProviderPresetMaturity = 'stable' | 'beta' | 'compatibility';

export interface ProviderPresetDisplay {
  readonly label: string;
  readonly maturity: ProviderPresetMaturity;
}

export interface LocalizedCredentialGuide {
  readonly title: string;
  readonly steps: readonly string[];
  readonly consoleUrl: string;
  readonly consoleName: string;
  readonly notes?: readonly string[];
}

export const PROVIDER_PRESET_ORDER: readonly ProviderPresetV1[] = [
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

export const PROVIDER_PRESET_DISPLAY: Readonly<
  Record<ProviderPresetV1, ProviderPresetDisplay>
> = {
  openai: {label: 'OpenAI', maturity: 'stable'},
  anthropic: {label: 'Anthropic', maturity: 'stable'},
  gemini: {label: 'Gemini', maturity: 'stable'},
  deepseek: {label: 'DeepSeek', maturity: 'stable'},
  xai: {label: 'xAI', maturity: 'stable'},
  alibaba_bailian_qwen: {label: '百炼 Qwen', maturity: 'stable'},
  zhipu_glm: {label: '智谱', maturity: 'stable'},
  moonshot_kimi: {label: 'Kimi', maturity: 'stable'},
  minimax: {label: 'MiniMax', maturity: 'stable'},
  volcano_ark_doubao: {label: '火山 Doubao', maturity: 'stable'},
  modelscope: {label: 'ModelScope（兼容）', maturity: 'compatibility'},
};

const GENERIC_STEPS: readonly string[] = [
  '登录服务商的官方控制台',
  '进入 API Keys / 密钥管理页面',
  '创建新的密钥并复制',
  '密钥只保存在这台手机，不会上传',
];

export const PROVIDER_CREDENTIAL_GUIDES: Readonly<
  Record<ProviderPresetV1, LocalizedCredentialGuide>
> = {
  openai: {
    title: 'OpenAI',
    steps: GENERIC_STEPS,
    consoleUrl: 'https://platform.openai.com',
    consoleName: 'OpenAI Platform',
  },
  anthropic: {
    title: 'Anthropic',
    steps: GENERIC_STEPS,
    consoleUrl: 'https://console.anthropic.com',
    consoleName: 'Anthropic Console',
  },
  gemini: {
    title: 'Gemini',
    steps: GENERIC_STEPS,
    consoleUrl: 'https://aistudio.google.com',
    consoleName: 'Google AI Studio',
  },
  deepseek: {
    title: 'DeepSeek',
    steps: GENERIC_STEPS,
    consoleUrl: 'https://platform.deepseek.com',
    consoleName: 'DeepSeek Platform',
  },
  xai: {
    title: 'xAI',
    steps: GENERIC_STEPS,
    consoleUrl: 'https://console.x.ai',
    consoleName: 'xAI Console',
  },
  alibaba_bailian_qwen: {
    title: '百炼 Qwen',
    steps: GENERIC_STEPS,
    consoleUrl: 'https://bailian.console.aliyun.com',
    consoleName: '阿里云百炼',
  },
  zhipu_glm: {
    title: '智谱',
    steps: GENERIC_STEPS,
    consoleUrl: 'https://open.bigmodel.cn',
    consoleName: '智谱开放平台',
  },
  moonshot_kimi: {
    title: 'Kimi',
    steps: GENERIC_STEPS,
    consoleUrl: 'https://platform.moonshot.cn',
    consoleName: 'Moonshot 开放平台',
  },
  minimax: {
    title: 'MiniMax',
    steps: GENERIC_STEPS,
    consoleUrl: 'https://platform.minimaxi.com',
    consoleName: 'MiniMax 开放平台',
  },
  volcano_ark_doubao: {
    title: '火山 Doubao',
    steps: GENERIC_STEPS,
    consoleUrl: 'https://console.volcengine.com',
    consoleName: '火山引擎控制台',
  },
  modelscope: {
    title: 'ModelScope（兼容）',
    steps: GENERIC_STEPS,
    consoleUrl: 'https://modelscope.cn',
    consoleName: '魔搭社区',
  },
};

const PROVIDER_GUIDE_HOST_ALLOWLIST: Readonly<Record<ProviderPresetV1, string>> = {
  openai: 'platform.openai.com',
  anthropic: 'console.anthropic.com',
  gemini: 'aistudio.google.com',
  deepseek: 'platform.deepseek.com',
  xai: 'console.x.ai',
  alibaba_bailian_qwen: 'bailian.console.aliyun.com',
  zhipu_glm: 'open.bigmodel.cn',
  moonshot_kimi: 'platform.moonshot.cn',
  minimax: 'platform.minimaxi.com',
  volcano_ark_doubao: 'console.volcengine.com',
  modelscope: 'modelscope.cn',
};

export const GENERIC_CUSTOM_CREDENTIAL_GUIDANCE =
  '请从你的服务提供方获取凭据';

export const UNSUPPORTED_CREDENTIAL_GUIDANCE =
  '暂无该服务商的获取指引，请查看其官方文档获取凭据。';

/**
 * Only permit opening an external console when the URL is HTTPS and its hostname
 * exactly matches the preset's allow-listed host. No guessing.
 */
export function isAllowedGuideUrl(
  preset: ProviderPresetV1,
  url: string,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') {
    return false;
  }
  return parsed.hostname === PROVIDER_GUIDE_HOST_ALLOWLIST[preset];
}
