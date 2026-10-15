// Bridge-only seam (Wave 2A Task 7). Not a second runtime Visual Agent contract:
// these three names live outside `@core/engine/operateRuntime/visualAgent/*` and
// exist only to let Connector Bridge adapters open a transport-neutral upstream
// session and read their own binding config. Frozen exactly per the plan.
import type {
  VisualAgentCapabilitySet,
  VisualAgentToolId,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

export type VisualAgentUpstreamProtocol =
  | 'gateway_ws'
  | 'cli_exec_jsonl'
  | 'agent_cli_ndjson'
  | 'acp_json_rpc_stdio'
  | 'app_server_json_rpc_stdio'
  | 'gateway_json_rpc_stdio'
  | 'gateway_json_rpc_ws'
  | 'cloud_agents_http'
  | 'runs_http_sse'
  | 'dsh_cli'
  | 'custom_bridge';

export interface VisualAgentUpstreamSession {
  negotiate(
    requested: VisualAgentCapabilitySet,
  ): Promise<VisualAgentCapabilitySet>;
  send(message: unknown): Promise<void>;
  subscribe(listener: (message: unknown) => void): () => void;
  close(): Promise<void>;
}

export interface VisualAgentUpstreamPort {
  open(input: {
    protocol: VisualAgentUpstreamProtocol;
    binding: Readonly<Record<string, unknown>>;
    signal: AbortSignal;
  }): Promise<VisualAgentUpstreamSession>;
}

export interface VisualAgentBindingPort {
  read(bindingId: string, toolId: VisualAgentToolId): Promise<unknown>;
}
