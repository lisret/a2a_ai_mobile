// Port used by migration to move a legacy OpenClaw gateway binding into the
// Connector Bridge. Staged before the config CAS; committed after it.
export interface LegacyOpenClawBindingPort {
  read(bindingId: string): Promise<
    | {readonly status: 'absent'}
    | {
        readonly status: 'staged' | 'committed';
        readonly stageId: string;
        readonly bridgeSecretRef: string;
      }
  >;
  stage(input: {
    bindingId: 'legacy-openclaw-gateway';
    toolId: 'openclaw';
    protocol: 'gateway_ws';
    gatewayUrl: string;
    deviceId: string;
    cluster: string;
    upstreamSecretRef: string;
  }): Promise<{readonly stageId: string; readonly bridgeSecretRef: string}>;
  commit(stageId: string): Promise<void>;
  rollback(stageId: string): Promise<void>;
}

/** Stable, ref-free failure; never carries a URL, header, token or body. */
export class LegacyOpenClawBindingError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'LegacyOpenClawBindingError';
    this.code = code;
  }
}

export const LEGACY_OPENCLAW_BINDING_ID = 'legacy-openclaw-gateway';
export const LEGACY_OPENCLAW_BRIDGE_LOCAL_REF =
  'visual-agent-bridge:legacy-openclaw-gateway';
