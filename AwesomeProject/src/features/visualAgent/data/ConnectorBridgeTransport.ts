// Mobile Connector Bridge transport seam (capability-domain Task 12). This is
// the only network boundary the mobile app crosses for Visual Agent traffic. It
// carries the runtime-owned `VisualAgentProtocolV1` and nothing else: no product
// protocol, no upstream CLI/endpoint, no bridge adapter. A concrete WebSocket/
// HTTPS implementation is provided by the app shell; capability code depends
// only on these interfaces.
import type {VisualAgentProtocolV1} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

export interface ConnectorBridgeSession {
  send(message: VisualAgentProtocolV1): Promise<void>;
  subscribe(listener: (raw: string) => void): () => void;
  close(): Promise<void>;
}

export interface ConnectorBridgeTransport {
  open(input: {
    bridgeUrl: string;
    secretRef: string | null;
    signal: AbortSignal;
  }): Promise<ConnectorBridgeSession>;
}
