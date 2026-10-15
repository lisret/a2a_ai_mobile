// Wave 2B Worker B: Cursor conformance fixture. Drives the real `CursorAdapter`
// over an in-memory `VisualAgentUpstreamPort` so the shared conformance runner can
// exercise the full connect → execute → status/approval/delta → single terminal →
// disconnect lifecycle. The `acp_json_rpc_stdio` mode is used because it is the
// Cursor transport that maps permission (approval) requests and cancel. `fallbackSpy`
// stays at zero: the adapter never falls back to a second execution path.
import type {
  VisualAgentCapabilitySet,
  VisualAgentProfileV1,
  VisualAgentResultV1,
  VisualAgentStructuredAction,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import type {VisualAgentAdapterConformanceFixture} from '../../conformance/VisualAgentAdapterConformance';
import type {
  VisualAgentBindingPort,
  VisualAgentUpstreamPort,
} from '../../ports/VisualAgentUpstreamPort';
import {CursorAdapter} from './CursorAdapter';
import type {CursorBindingV1} from './CursorBinding';

const requestedCapabilities: VisualAgentCapabilitySet = {
  imageInput: true,
  structuredAction: true,
  stream: true,
  cancel: true,
  approval: true,
  resume: false,
  steer: false,
  preferences: false,
};

export function createCursorConformanceFixture(): VisualAgentAdapterConformanceFixture {
  const binding: CursorBindingV1 = {
    schemaVersion: 1,
    toolId: 'cursor',
    protocol: 'acp_json_rpc_stdio',
    endpointOrExecutable: 'cursor-agent',
    cwd: '/tmp/cursor',
    args: [],
    secretRef: null,
  };

  const listeners = new Set<(message: unknown) => void>();
  const emit = (message: unknown): void => {
    listeners.forEach(listener => listener(message));
  };
  const session = {
    negotiate: async (requested: VisualAgentCapabilitySet) => requested,
    send: async () => undefined,
    subscribe: (listener: (message: unknown) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: async () => undefined,
  };
  const upstream: VisualAgentUpstreamPort = {
    open: async () => session,
  };
  const bindings: VisualAgentBindingPort = {
    read: async () => binding,
  };

  const profile: VisualAgentProfileV1 = {
    schemaVersion: 1,
    profileId: 'cursor-conformance-profile',
    toolId: 'cursor',
    enabled: true,
    connector: {
      kind: 'connector_bridge',
      bridgeUrl: 'https://bridge.example',
      bindingId: 'cursor-conformance-binding',
      secretRef: null,
    },
    requestedCapabilities,
  };

  const adapter = new CursorAdapter(bindings, upstream);

  return {
    toolId: 'cursor',
    adapter,
    profile,
    binding: binding as unknown as Readonly<Record<string, unknown>>,
    upstream,
    supportedCapabilities: requestedCapabilities,
    fallbackSpy: {callCount: () => 0},
    emitStatus: (status: 'queued' | 'running') =>
      emit({method: 'task/status', params: {status}}),
    emitApproval: (approvalId: string) =>
      emit({method: 'permission/request', params: {id: approvalId}}),
    emitDelta: (input: {
      textDelta?: string;
      visualUnderstandingDelta?: string;
      structuredAction?: VisualAgentStructuredAction;
    }) => emit({method: 'task/delta', params: {...input}}),
    emitCompleted: (result: VisualAgentResultV1) =>
      emit({method: 'task/completed', params: {result}}),
    emitFailed: (errorCode: string, resumeToken?: string) =>
      emit({
        method: 'task/failed',
        params: {errorCode, ...(resumeToken ? {resumeToken} : {})},
      }),
    emitCancelled: (resumeToken?: string) =>
      emit({method: 'task/cancelled', params: {...(resumeToken ? {resumeToken} : {})}}),
    emitDisconnect: () => emit({method: 'session/closed'}),
  };
}
