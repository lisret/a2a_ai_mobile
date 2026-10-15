import {CapabilityError} from './CapabilityError';

// Keys that must never cross the Companion privacy boundary: screenshots,
// credentials, raw model output, upstream tokens, action history, or device
// action ports. Matched case-insensitively against object keys at any depth.
const FORBIDDEN_KEY_PATTERN =
  /(image|secret|apikey|api_key|token|actionhistory|action_history|frame|stack|rawresponse|raw_response)/i;

export function assertNoForbiddenKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoForbiddenKeys(item);
    }
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_KEY_PATTERN.test(key)) {
        throw new CapabilityError('privacy_blocked');
      }
      assertNoForbiddenKeys(nested);
    }
  }
}

export function assertVisualAgentImageConsent(input: {
  profileEnabled: boolean;
  imageInputNegotiated: boolean;
  sharingConfirmed: boolean;
}): void {
  if (!input.profileEnabled || !input.imageInputNegotiated) {
    throw new CapabilityError('visual_agent_capability_unsupported');
  }
  if (!input.sharingConfirmed) {
    throw new CapabilityError('privacy_blocked');
  }
}

export interface CompanionRequestProjection {
  readonly conversationId: string;
  readonly text: string;
  readonly recentReplies: readonly string[];
  readonly confirmedPreferenceSummaries: readonly string[];
}

export function projectCompanionRequest(input: {
  conversationId: string;
  text: string;
  recentReplies: readonly string[];
  confirmedPreferenceSummaries: readonly string[];
  untrusted?: unknown;
}): CompanionRequestProjection {
  const projection: CompanionRequestProjection = {
    conversationId: input.conversationId,
    text: input.text,
    recentReplies: [...input.recentReplies],
    confirmedPreferenceSummaries: [...input.confirmedPreferenceSummaries],
  };
  assertNoForbiddenKeys(projection);
  return projection;
}
