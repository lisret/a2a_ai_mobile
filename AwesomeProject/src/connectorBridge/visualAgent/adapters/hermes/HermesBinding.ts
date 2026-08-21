// Hermes binding schema and validator. Hermes exposes four distinct Visual Agent
// transports; each is a separate binding mode with no fallback between them:
//   - acp_json_rpc_stdio     (ACP over stdio)
//   - gateway_json_rpc_stdio (TUI Gateway JSON-RPC over stdio)
//   - gateway_json_rpc_ws    (TUI Gateway JSON-RPC over WebSocket)
//   - runs_http_sse          (Runs HTTP endpoints + SSE stream)
// `hermes mcp serve` is intentionally excluded: its MCP messaging bridge is not a
// complete Visual Agent lifecycle, so `mcp` is rejected as an invalid profile.
import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';

export type HermesProtocol =
  | 'acp_json_rpc_stdio'
  | 'gateway_json_rpc_stdio'
  | 'gateway_json_rpc_ws'
  | 'runs_http_sse';

export type HermesBindingV1 = {
  readonly schemaVersion: 1;
  readonly toolId: 'hermes';
  readonly protocol: HermesProtocol;
  readonly endpointOrExecutable: string;
  readonly cwd: string | null;
  readonly args: readonly string[];
  readonly secretRef: string | null;
};

const HERMES_PROTOCOLS: readonly HermesProtocol[] = [
  'acp_json_rpc_stdio',
  'gateway_json_rpc_stdio',
  'gateway_json_rpc_ws',
  'runs_http_sse',
];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isHermesProtocol = (value: unknown): value is HermesProtocol =>
  typeof value === 'string' && (HERMES_PROTOCOLS as readonly string[]).includes(value);

/**
 * Normalizes an untrusted binding record into a `HermesBindingV1`. Any mode
 * outside the four supported transports — including `hermes mcp serve` — is
 * rejected as an invalid profile. There is no mode fallback.
 */
export function validateHermesBinding(input: unknown): HermesBindingV1 {
  if (!isObject(input)) {
    throw new CapabilityError('visual_agent_invalid_profile');
  }
  if (!isHermesProtocol(input.protocol)) {
    throw new CapabilityError('visual_agent_invalid_profile');
  }
  if (
    typeof input.endpointOrExecutable !== 'string' ||
    input.endpointOrExecutable.length === 0
  ) {
    throw new CapabilityError('visual_agent_invalid_profile');
  }
  return {
    schemaVersion: 1,
    toolId: 'hermes',
    protocol: input.protocol,
    endpointOrExecutable: input.endpointOrExecutable,
    cwd: typeof input.cwd === 'string' ? input.cwd : null,
    args: Array.isArray(input.args)
      ? input.args.filter((arg): arg is string => typeof arg === 'string')
      : [],
    secretRef: typeof input.secretRef === 'string' ? input.secretRef : null,
  };
}
