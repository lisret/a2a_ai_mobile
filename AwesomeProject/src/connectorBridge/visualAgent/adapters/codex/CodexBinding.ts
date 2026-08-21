// Wave 2B Worker B: Codex Bridge binding. All Codex transport settings live in
// the Bridge binding addressed by `profile.connector.bindingId`; they are never
// added onto `VisualAgentProfileV1`. Only the two lifecycle-complete Codex modes
// are accepted: `cli_exec_jsonl` and `app_server_json_rpc_stdio`. The experimental
// App Server WebSocket and `codex mcp-server` are intentionally excluded.
import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import type {VisualAgentCapabilitySet} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

export type CodexBindingV1 = {
  readonly schemaVersion: 1;
  readonly toolId: 'codex';
  readonly protocol: 'cli_exec_jsonl' | 'app_server_json_rpc_stdio';
  readonly executable: 'codex';
  readonly cwd: string;
  readonly args: readonly string[];
  readonly secretRef: string | null;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function invalid(): never {
  throw new CapabilityError('visual_agent_invalid_profile');
}

/**
 * Validates raw binding config into a `CodexBindingV1`. Rejects unknown protocols
 * (including the excluded WebSocket / mcp-server transports) with a generic code.
 */
export function parseCodexBinding(raw: unknown): CodexBindingV1 {
  if (!isObject(raw)) {
    invalid();
  }
  if (raw.schemaVersion !== 1 || raw.toolId !== 'codex') {
    invalid();
  }
  if (raw.protocol !== 'cli_exec_jsonl' && raw.protocol !== 'app_server_json_rpc_stdio') {
    invalid();
  }
  if (raw.executable !== 'codex' || typeof raw.cwd !== 'string') {
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
    toolId: 'codex',
    protocol: raw.protocol,
    executable: 'codex',
    cwd: raw.cwd,
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
 * The capabilities each Codex mode can honestly honor. `cli_exec_jsonl` streams
 * JSONL and can cancel by closing the child process, but has no approval, resume,
 * steer, or preference primitive. `app_server_json_rpc_stdio` additionally maps
 * approval requests, cancellation, and correlated in-flight steer.
 */
export function codexCapabilityMask(
  protocol: CodexBindingV1['protocol'],
): VisualAgentCapabilitySet {
  if (protocol === 'cli_exec_jsonl') {
    return {...baseMask(), cancel: true};
  }
  return {...baseMask(), cancel: true, approval: true, steer: true};
}
