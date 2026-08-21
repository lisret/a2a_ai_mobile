// Strict validation for the independent model and visual-agent config groups.
import type {AgentConfigV2} from '../../agentRuntime/domain';
import type {
  CustomProviderSpecV1,
  ModelBindingV1,
  ModelEndpointProfileV1,
} from '../model/ModelProviderContracts';
import type {
  RuntimeRouteConfigV1,
} from '../contracts/RuntimeConfigContracts';
import type {
  VisualAgentCapabilitySet,
  VisualAgentProfileV1,
} from '../visualAgent/VisualAgentContracts';
import {RuntimeConfigError} from './CredentialRetirementRepository';

const MODALITY_INPUTS = ['text', 'image', 'audio', 'video'] as const;
const MODALITY_OUTPUTS = ['text', 'image', 'audio'] as const;
const AUTH_PREFIXES = ['', 'Bearer ', 'Token ', 'Basic '];
const RFC_TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

const reject = (code: string): never => {
  throw new RuntimeConfigError(code);
};

const isSecureHttpUrl = (value: string): boolean => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password || url.hash) {
    return false;
  }
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  return url.protocol === 'https:' || (url.protocol === 'http:' && loopback);
};

const isSecureBridgeUrl = (value: string): boolean => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password || url.hash) {
    return false;
  }
  return url.protocol === 'https:' || url.protocol === 'wss:';
};

const hasPathTraversal = (path: string): boolean =>
  typeof path !== 'string' ||
  !path.startsWith('/') ||
  path.startsWith('//') ||
  path.includes('..') ||
  path.includes('://') ||
  path.includes('\\');

const validateCustomSpec = (spec: CustomProviderSpecV1): void => {
  if (!isSecureHttpUrl(spec.baseURL)) {
    reject('runtime_config_invalid_custom_url');
  }
  if (hasPathTraversal(spec.chatPath)) {
    reject('runtime_config_invalid_custom_path');
  }
  if (spec.modelListPath !== null && hasPathTraversal(spec.modelListPath)) {
    reject('runtime_config_invalid_custom_path');
  }
  const auth = spec.auth;
  if (auth.kind === 'header') {
    if (!RFC_TOKEN.test(auth.headerName) || !AUTH_PREFIXES.includes(auth.prefix)) {
      reject('runtime_config_invalid_custom_auth');
    }
  } else if (auth.kind === 'query') {
    if (!RFC_TOKEN.test(auth.queryName)) {
      reject('runtime_config_invalid_custom_auth');
    }
  }
  const declared = spec.declaredCapabilities;
  const inputs = declared.inputModalities;
  const outputs = declared.outputModalities;
  if (!Array.isArray(inputs) || inputs.length === 0) {
    reject('runtime_config_invalid_custom_capabilities');
  }
  if (!Array.isArray(outputs) || outputs.length === 0) {
    reject('runtime_config_invalid_custom_capabilities');
  }
  if (
    !(inputs as readonly string[]).every(item =>
      (MODALITY_INPUTS as readonly string[]).includes(item),
    )
  ) {
    reject('runtime_config_invalid_custom_capabilities');
  }
  if (
    !(outputs as readonly string[]).every(item =>
      (MODALITY_OUTPUTS as readonly string[]).includes(item),
    )
  ) {
    reject('runtime_config_invalid_custom_capabilities');
  }
  if (!inputs.includes('text') || !outputs.includes('text')) {
    reject('runtime_config_invalid_custom_capabilities');
  }
  if (declared.capabilities.chat !== true) {
    reject('runtime_config_invalid_custom_capabilities');
  }
};

const validateProfile = (profile: ModelEndpointProfileV1): void => {
  if (profile.mode !== 'preset' && profile.mode !== 'custom') {
    reject('runtime_config_invalid_profile_mode');
  }
  if (profile.mode === 'custom') {
    validateCustomSpec(profile.custom);
    if (profile.custom.auth.kind === 'none' && profile.secretRef !== null) {
      reject('runtime_config_invalid_profile');
    }
  } else if (profile.baseURLOverride !== null && !isSecureHttpUrl(profile.baseURLOverride)) {
    reject('runtime_config_invalid_custom_url');
  }
};

const requestsOperationCapabilities = (
  requested: VisualAgentCapabilitySet,
): boolean => requested.imageInput === true && requested.structuredAction === true;

const validateVisualProfile = (profile: VisualAgentProfileV1): void => {
  if (profile.connector.kind !== 'connector_bridge') {
    reject('runtime_config_invalid_visual_connector');
  }
  if (!isSecureBridgeUrl(profile.connector.bridgeUrl)) {
    reject('runtime_config_invalid_bridge_url');
  }
  if (!profile.connector.bindingId || profile.connector.bindingId.trim().length === 0) {
    reject('runtime_config_invalid_visual_binding');
  }
  const toolId = profile.toolId;
  if (toolId.startsWith('custom:') && toolId.length <= 'custom:'.length) {
    reject('runtime_config_invalid_visual_tool');
  }
};

/** Validate one route group. Throws `RuntimeConfigError` on the first failure. */
export function validateRuntimeRoute(route: RuntimeRouteConfigV1): void {
  const {modelAPI, visualAgent, privacy} = route;

  const profileIds = new Set<string>();
  for (const profile of modelAPI.profiles) {
    if (profileIds.has(profile.id)) {
      reject('runtime_config_duplicate_profile');
    }
    profileIds.add(profile.id);
    validateProfile(profile);
  }

  const bindingIds = new Set<string>();
  for (const binding of modelAPI.bindings) {
    if (!binding.id || binding.id.trim().length === 0) {
      reject('runtime_config_invalid_binding');
    }
    if (bindingIds.has(binding.id)) {
      reject('runtime_config_duplicate_binding');
    }
    bindingIds.add(binding.id);
    if (!profileIds.has(binding.profileId)) {
      reject('runtime_config_dangling_binding');
    }
  }

  const visualIds = new Set<string>();
  for (const profile of visualAgent.profiles) {
    if (visualIds.has(profile.profileId)) {
      reject('runtime_config_duplicate_visual_profile');
    }
    visualIds.add(profile.profileId);
    validateVisualProfile(profile);
  }

  if (visualAgent.activeProfileId !== null) {
    const active = visualAgent.profiles.find(
      profile => profile.profileId === visualAgent.activeProfileId,
    );
    if (!active) {
      reject('runtime_config_visual_active_missing');
    }
  }

  if (visualAgent.enabled) {
    const active = visualAgent.profiles.find(
      profile => profile.profileId === visualAgent.activeProfileId,
    );
    if (!active || !active.enabled) {
      throw new RuntimeConfigError('visual_agent_capability_unsupported');
    }
    if (!requestsOperationCapabilities(active.requestedCapabilities)) {
      throw new RuntimeConfigError('visual_agent_capability_unsupported');
    }
  }

  if (privacy.memoryLocation === 'visual_agent') {
    if (privacy.memoryProfileId === null) {
      reject('runtime_config_invalid_memory');
    }
    const memoryProfile = visualAgent.profiles.find(
      profile => profile.profileId === privacy.memoryProfileId,
    );
    if (!memoryProfile || !memoryProfile.enabled) {
      reject('runtime_config_invalid_memory');
    }
  } else if (privacy.memoryLocation === 'device') {
    if (privacy.memoryProfileId !== null) {
      reject('runtime_config_invalid_memory');
    }
  }
}

const FORBIDDEN_ENVELOPE_KEYS = ['apiKey', 'password', 'token', 'plaintext'];

/** Reject any smuggled credential-bearing keys anywhere in the parsed envelope. */
export function assertNoForbiddenKeys(value: unknown): void {
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        if (FORBIDDEN_ENVELOPE_KEYS.includes(key)) {
          throw new RuntimeConfigError('runtime_config_corrupt');
        }
        visit(child);
      }
    }
  };
  visit(value);
}

export const DEFAULT_AGENT_CONFIG_V2: AgentConfigV2 = {
  version: 2,
  activeMode: 'cloud_direct',
  modeDrafts: {
    cloudDirect: {},
    cloudSplit: {},
    localVisionCloudPlanner: {localModelId: 'minicpm-v-4.6-q4'},
  },
  maxSteps: 20,
};

export const EMPTY_ROUTE_CONFIG: RuntimeRouteConfigV1 = {
  capabilities: {phoneOperate: false, errands: false},
  privacy: {memoryEnabled: false, memoryLocation: 'device', memoryProfileId: null},
  modelAPI: {agentConfig: DEFAULT_AGENT_CONFIG_V2, profiles: [], bindings: []},
  visualAgent: {enabled: false, activeProfileId: null, profiles: []},
};
