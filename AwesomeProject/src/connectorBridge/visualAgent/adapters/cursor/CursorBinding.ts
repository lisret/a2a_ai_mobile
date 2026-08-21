// Wave 2B Worker B: Cursor Bridge binding. Cursor transport settings live only in
// the Bridge binding addressed by `profile.connector.bindingId`. Exactly one of the
// three lifecycle-complete Cursor modes is accepted: `agent_cli_ndjson`,
// `acp_json_rpc_stdio`, or `cloud_agents_http`. Cursor MCP configuration is not a
// transport and is never exposed here. Cloud auth and local CLI auth are separate
// secret refs carried by `secretRef`.
import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import type {VisualAgentCapabilitySet} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

export type CursorBindingV1 = {
  readonly schemaVersion: 1;
  readonly toolId: 'cursor';
  readonly protocol: 'agent_cli_ndjson' | 'acp_json_rpc_stdio' | 'cloud_agents_http';
  readonly endpointOrExecutable: string;
  readonly cwd: string | null;
  readonly args: readonly string[];
  readonly secretRef: string | null;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function invalid(): never {
  throw new CapabilityError('visual_agent_invalid_profile');
}

/** Validates raw binding config into a `CursorBindingV1`, rejecting unknown transports. */
export function parseCursorBinding(raw: unknown): CursorBindingV1 {
  if (!isObject(raw)) {
    invalid();
  }
  if (raw.schemaVersion !== 1 || raw.toolId !== 'cursor') {
    invalid();
  }
  if (
    raw.protocol !== 'agent_cli_ndjson' &&
    raw.protocol !== 'acp_json_rpc_stdio' &&
    raw.protocol !== 'cloud_agents_http'
  ) {
    invalid();
  }
  if (typeof raw.endpointOrExecutable !== 'string' || raw.endpointOrExecutable.length === 0) {
    invalid();
  }
  if (!(raw.cwd === null || typeof raw.cwd === 'string')) {
    invalid();
  }
  if (!Array.isArray(raw.args) || !raw.args.every(arg => typeof arg === 'string')) {
    invalid();
  }
  if (!(raw.secretRef === null || typeof raw.secretRef === 'string')) {
    invalid();
  }
  return {
    schemaVersion: 1,
    toolId: 'cursor',
    protocol: raw.protocol,
    endpointOrExecutable: raw.endpointOrExecutable,
    cwd: raw.cwd as string | null,
    args: [...(raw.args as string[])],
    secretRef: raw.secretRef as string | null,
  };
}

const baseMask = (): VisualAgentCapabilitySet => ({
  imageInput: true,
  structuredAction: true,
  stream: true,
  cancel: false,
  approval: false,
  resume: false,
  steer: false,
  preferences: false,
});

/**
 * The capabilities each Cursor mode can honestly honor. `agent_cli_ndjson` parses
 * stream-json/NDJSON but the CLI cannot acknowledge a cancel, so it must not claim
 * `cancel`. `acp_json_rpc_stdio` maps ACP session/prompt/update/cancel plus a
 * correlated in-flight prompt (steer) and permission requests (approval), and can
 * reload a session (resume). `cloud_agents_http` maps REST create/status/stop, so
 * it supports cancel (stop) and resume (status re-fetch) but no in-flight approval
 * or steer primitive.
 */
export function cursorCapabilityMask(
  protocol: CursorBindingV1['protocol'],
): VisualAgentCapabilitySet {
  if (protocol === 'agent_cli_ndjson') {
    return baseMask();
  }
  if (protocol === 'acp_json_rpc_stdio') {
    return {...baseMask(), cancel: true, approval: true, resume: true, steer: true};
  }
  return {...baseMask(), cancel: true, resume: true};
}
