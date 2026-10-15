// Application-facing contract and the only model-backed request for NoNo's
// pet-style idle behavior.
//
// Privacy boundary (see docs/superpowers/specs/2026-10-15-nono-pet-idle-design.md):
// the request carries local character state only — temperament, idle seconds and
// the last local action label. It never carries transcripts, screenshots,
// history, credentials or any other user content, and it never creates a
// companion turn or proposal. Credential plaintext is resolved inside the
// provider transport from `secretRef`; this module never reads a secret.
//
// Timeout and rate limiting are host concerns (Task 3). This module only
// respects the caller's `AbortSignal`, and never schedules its own timer.
import type {
  ModelEndpointProfileV1,
  ModelProviderRegistry,
  ProviderChatMessageV1,
  ProviderExecutionTargetV1,
  ProviderModelDescriptor,
} from '../../core/engine/operateRuntime/model/ModelProviderContracts';
import type {RuntimeConfigRepository} from '../../core/engine/operateRuntime/contracts/RuntimeConfigContracts';

export type PetTemperament = 'calm' | 'curious' | 'playful' | 'sleepy';

export const PET_TEMPERAMENTS: readonly PetTemperament[] = [
  'calm',
  'curious',
  'playful',
  'sleepy',
];

export interface PetIntentContext {
  temperament: PetTemperament;
  idleSeconds: number;
  lastAction: string | null;
}

export interface PetIntent {
  temperament: PetTemperament;
}

/** Upper bound for a plausible idle age (24h). Out-of-range values are rejected. */
export const MAX_PET_IDLE_SECONDS = 86_400;
/** Local action labels are short clip ids; longer values are rejected, not truncated. */
export const MAX_PET_LAST_ACTION_LENGTH = 64;
/**
 * Sent to the transport as the request deadline. The host owns the real
 * throttle/timeout policy and can override this through `timeoutMs`.
 */
export const PET_INTENT_REQUEST_TIMEOUT_MS = 10_000;

export function isPetTemperament(value: unknown): value is PetTemperament {
  return (
    typeof value === 'string' &&
    (PET_TEMPERAMENTS as readonly string[]).includes(value)
  );
}

/**
 * Validates the local context. Returns `null` for anything out of bounds rather
 * than clamping, so invalid local state never reaches the provider.
 */
export function normalizePetIntentContext(
  value: unknown,
): PetIntentContext | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!isPetTemperament(record.temperament)) {
    return null;
  }
  const idleSeconds = record.idleSeconds;
  if (typeof idleSeconds !== 'number' || !Number.isFinite(idleSeconds)) {
    return null;
  }
  if (idleSeconds < 0 || idleSeconds > MAX_PET_IDLE_SECONDS) {
    return null;
  }
  if (!('lastAction' in record)) {
    return null;
  }
  const rawLastAction = record.lastAction;
  let lastAction: string | null;
  if (rawLastAction === null) {
    lastAction = null;
  } else if (typeof rawLastAction === 'string') {
    const trimmed = rawLastAction.trim();
    if (trimmed.length === 0) {
      lastAction = null;
    } else if (trimmed.length > MAX_PET_LAST_ACTION_LENGTH) {
      return null;
    } else {
      lastAction = trimmed;
    }
  } else {
    return null;
  }
  return {temperament: record.temperament, idleSeconds, lastAction};
}

/**
 * Builds the two-message request. The system prompt asks for exactly one JSON
 * field and explicitly refuses scripts, angles, tools and extra fields.
 */
export function buildPetIntentMessages(
  context: PetIntentContext,
): readonly ProviderChatMessageV1[] {
  const {temperament, idleSeconds, lastAction} = context;
  return [
    {
      role: 'system',
      text:
        '你是本地动画情绪分类器。只输出一个 JSON 对象，例如 {"temperament":"calm"}。' +
        'temperament 只能是 calm、curious、playful、sleepy 之一。' +
        '不要输出 JSON 以外的任何内容：不要解释、不要脚本、不要角度数值、不要工具调用、不要额外字段。',
    },
    {
      role: 'user',
      text:
        `本地角色状态：temperament=${temperament}；idleSeconds=${idleSeconds}；` +
        `lastAction=${lastAction ?? 'null'}。只返回 JSON。`,
    },
  ];
}

/**
 * Strict response validation: the reply must be exactly one JSON object with
 * exactly one `temperament` key holding one of the four allowed values. An
 * optional ```json fence is tolerated; any extra key, prose or alias is not.
 */
export function parsePetIntentResponse(text: string): PetIntent | null {
  if (typeof text !== 'string') {
    return null;
  }
  const payload = parseJsonObject(stripCodeFence(text));
  if (!payload) {
    return null;
  }
  const keys = Object.keys(payload);
  if (keys.length !== 1 || keys[0] !== 'temperament') {
    return null;
  }
  const temperament = payload.temperament;
  return isPetTemperament(temperament) ? {temperament} : null;
}

/** Returns `true` when the provider needs no credential or the profile holds a reference. */
export function hasCredentialReference(
  profile: ModelEndpointProfileV1,
  registry: ModelProviderRegistry,
): boolean {
  if (profile.secretRef !== null) {
    return true;
  }
  if (profile.mode === 'custom') {
    return profile.custom.auth.kind === 'none';
  }
  const registration = registry
    .listPresets()
    .find(item => item.preset === profile.preset);
  return (
    registration !== undefined &&
    registration.credentialRequirement !== 'required'
  );
}

export interface PetIntentRequestDeps {
  readonly repo: RuntimeConfigRepository;
  readonly registry: ModelProviderRegistry;
  /** Host override for the transport deadline; the host owns throttle/timeout policy. */
  readonly timeoutMs?: number;
}

/**
 * Requests one temperament from the already-configured `role=companion` binding.
 * Every await is followed by an abort check, so a cancelled request never issues
 * the next call or resolves with a stale answer. Any missing configuration,
 * provider failure or invalid response yields `null` and the local director
 * keeps running; nothing is logged and no turn/proposal is produced.
 */
export async function requestPetIntent(
  deps: PetIntentRequestDeps,
  context: PetIntentContext,
  signal: AbortSignal,
): Promise<PetIntent | null> {
  const normalized = normalizePetIntentContext(context);
  if (!normalized || signal.aborted) {
    return null;
  }
  try {
    const envelope = await deps.repo.load();
    if (signal.aborted) {
      return null;
    }
    const active = envelope.active.modelAPI;
    const binding = active.bindings.find(item => item.role === 'companion');
    if (!binding) {
      return null;
    }
    const profile = active.profiles.find(item => item.id === binding.profileId);
    if (!profile) {
      return null;
    }
    if (!hasCredentialReference(profile, deps.registry)) {
      return null;
    }
    const descriptor = deps.registry
      .resolveCatalog(profile)
      .describeManualModel(profile, binding.modelId);
    const target = deps.registry.resolveExecutionTarget(
      profile,
      descriptor,
      deriveCapabilityTrust(profile, descriptor),
    );
    if (signal.aborted) {
      return null;
    }
    const transport = deps.registry.resolveTransport(target);
    if (transport.id !== target.transportAdapterId || signal.aborted) {
      return null;
    }
    const result = await transport.sendChat({
      target,
      binding,
      messages: buildPetIntentMessages(normalized),
      signal,
      timeoutMs: deps.timeoutMs ?? PET_INTENT_REQUEST_TIMEOUT_MS,
    });
    if (signal.aborted) {
      return null;
    }
    return parsePetIntentResponse(result.text);
  } catch {
    // No configuration, provider failure or malformed reply: fall back to local
    // behavior. Deliberately silent — never log request material or credentials.
    return null;
  }
}

function deriveCapabilityTrust(
  profile: ModelEndpointProfileV1,
  descriptor: ProviderModelDescriptor,
): ProviderExecutionTargetV1['capabilityTrust'] {
  if (profile.mode === 'custom') {
    return 'user_declared_unverified';
  }
  switch (descriptor.metadataSource) {
    case 'remote':
      return 'verified_remote';
    case 'signed_static':
      return 'verified_signed';
    default:
      return 'user_declared_unverified';
  }
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }
  return trimmed
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/```$/, '')
    .trim();
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(trimmed);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}
