import type {VisualAgentErrorCode} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

// Generic, ref-free capability error codes. The Visual Agent literals are owned
// by Runtime Wave 1 Task 4B and imported here rather than duplicated. No
// `openclaw_*` code is introduced: legacy OpenClaw exists only as a `toolId`.
export type CapabilityErrorCode =
  | VisualAgentErrorCode
  | 'privacy_blocked'
  | 'preference_remote_unavailable'
  | 'proposal_not_found'
  | 'errand_time_ambiguous'
  | 'errand_lease_lost'
  | 'config_revision_conflict';

export class CapabilityError extends Error {
  readonly code: CapabilityErrorCode;

  constructor(code: CapabilityErrorCode) {
    super(code);
    this.name = 'CapabilityError';
    this.code = code;
  }
}
