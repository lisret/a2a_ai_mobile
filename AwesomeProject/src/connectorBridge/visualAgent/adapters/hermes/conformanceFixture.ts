// Self-contained conformance fixture for the Hermes adapter (Runs HTTP+SSE mode).
// It wires a fake `VisualAgentUpstreamPort` whose emit helpers push correlated,
// strictly increasing protocol frames (encoded through the shared codec) so the
// frozen `defineVisualAgentAdapterConformance` runner can drive the full
// connect → execute → status/approval/delta → single terminal → disconnect
// lifecycle including steer and preferences. `fallbackSpy` is always 0.
import type {
  VisualAgentAdapterConformanceFixture,
  VisualAgentConformanceOptions,
} from '../../conformance/VisualAgentAdapterConformance';
import type {
  VisualAgentBindingPort,
  VisualAgentUpstreamPort,
  VisualAgentUpstreamSession,
} from '../../ports/VisualAgentUpstreamPort';
import {encodeVisualAgentMessage} from '../../protocol/VisualAgentProtocolCodec';
import type {
  VisualAgentCapabilitySet,
  VisualAgentErrorCode,
  VisualAgentProfileV1,
  VisualAgentProtocolV1,
  VisualAgentResultV1,
  VisualAgentStructuredAction,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import {HermesAdapter} from './HermesAdapter';
import type {HermesBindingV1} from './HermesBinding';

const TASK_ID = 'conformance-task';
const SESSION_REVISION = 1;

const negotiatedCapabilities: VisualAgentCapabilitySet = {
  imageInput: true,
  structuredAction: true,
  stream: true,
  cancel: true,
  approval: true,
  resume: true,
  steer: true,
  preferences: true,
};

const binding: HermesBindingV1 = {
  schemaVersion: 1,
  toolId: 'hermes',
  protocol: 'runs_http_sse',
  endpointOrExecutable: 'wss://hermes.example/runs',
  cwd: null,
  args: [],
  secretRef: null,
};

const profile: VisualAgentProfileV1 = {
  schemaVersion: 1,
  profileId: 'hermes-conformance',
  toolId: 'hermes',
  enabled: true,
  connector: {
    kind: 'connector_bridge',
    bridgeUrl: 'https://bridge.example',
    bindingId: 'b-hermes-conformance',
    secretRef: null,
  },
  requestedCapabilities: negotiatedCapabilities,
};

function buildFixture(): VisualAgentAdapterConformanceFixture {
  let listeners = new Set<(message: unknown) => void>();
  let sequence = 0;

  const emitFrame = (message: VisualAgentProtocolV1): void => {
    const raw = encodeVisualAgentMessage(message);
    for (const listener of [...listeners]) {
      listener(raw);
    }
  };
  const nextSequence = (): number => {
    const current = sequence;
    sequence += 1;
    return current;
  };

  const upstream: VisualAgentUpstreamPort = {
    open: async () => {
      listeners = new Set();
      sequence = 0;
      const session: VisualAgentUpstreamSession = {
        negotiate: async () => negotiatedCapabilities,
        send: async () => undefined,
        subscribe: listener => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        close: async () => undefined,
      };
      return session;
    },
  };

  const bindings: VisualAgentBindingPort = {
    read: async () => binding,
  };

  const adapter = new HermesAdapter(bindings, upstream);

  return {
    toolId: 'hermes',
    adapter,
    profile,
    binding: binding as unknown as Readonly<Record<string, unknown>>,
    upstream,
    supportedCapabilities: negotiatedCapabilities,
    fallbackSpy: {callCount: () => 0},
    emitStatus(status: 'queued' | 'running') {
      const seq = nextSequence();
      emitFrame({
        version: 1,
        type: 'task.status',
        requestId: `hermes-evt-${seq}`,
        event: {
          type: 'status',
          taskId: TASK_ID,
          sessionRevision: SESSION_REVISION,
          sequence: seq,
          status,
        },
      });
    },
    emitApproval(approvalId: string) {
      const seq = nextSequence();
      emitFrame({
        version: 1,
        type: 'task.status',
        requestId: `hermes-evt-${seq}`,
        event: {
          type: 'status',
          taskId: TASK_ID,
          sessionRevision: SESSION_REVISION,
          sequence: seq,
          status: 'waiting_approval',
          approvalId,
        },
      });
    },
    emitDelta(input: {
      textDelta?: string;
      visualUnderstandingDelta?: string;
      structuredAction?: VisualAgentStructuredAction;
    }) {
      const seq = nextSequence();
      emitFrame({
        version: 1,
        type: 'task.event',
        requestId: `hermes-evt-${seq}`,
        event: {
          type: 'delta',
          taskId: TASK_ID,
          sessionRevision: SESSION_REVISION,
          sequence: seq,
          ...(input.textDelta !== undefined ? {textDelta: input.textDelta} : {}),
          ...(input.visualUnderstandingDelta !== undefined
            ? {visualUnderstandingDelta: input.visualUnderstandingDelta}
            : {}),
          ...(input.structuredAction
            ? {structuredAction: input.structuredAction}
            : {}),
        },
      });
    },
    emitCompleted(result: VisualAgentResultV1) {
      const seq = nextSequence();
      emitFrame({
        version: 1,
        type: 'task.completed',
        requestId: `hermes-evt-${seq}`,
        event: {
          type: 'terminal',
          taskId: TASK_ID,
          sessionRevision: SESSION_REVISION,
          sequence: seq,
          status: 'completed',
          result,
        },
      });
    },
    emitFailed(errorCode: VisualAgentErrorCode, resumeToken?: string) {
      const seq = nextSequence();
      emitFrame({
        version: 1,
        type: 'task.failed',
        requestId: `hermes-evt-${seq}`,
        event: {
          type: 'terminal',
          taskId: TASK_ID,
          sessionRevision: SESSION_REVISION,
          sequence: seq,
          status: 'failed',
          errorCode,
          ...(resumeToken ? {resumeToken} : {}),
        },
      });
    },
    emitCancelled(resumeToken?: string) {
      const seq = nextSequence();
      emitFrame({
        version: 1,
        type: 'task.cancelled',
        requestId: `hermes-evt-${seq}`,
        event: {
          type: 'terminal',
          taskId: TASK_ID,
          sessionRevision: SESSION_REVISION,
          sequence: seq,
          status: 'cancelled',
          ...(resumeToken ? {resumeToken} : {}),
        },
      });
    },
    emitDisconnect() {
      // Upstream teardown is exercised through `port.disconnect()`; no frame is
      // emitted here so the run ends on exactly one terminal event.
    },
  };
}

export const hermesConformanceFixture: VisualAgentAdapterConformanceFixture =
  buildFixture();

export const hermesRequiredConformance: VisualAgentConformanceOptions = {
  requiredStatuses: ['queued', 'running', 'waiting_approval', 'completed'],
  negotiatedCapabilities: [
    'imageInput',
    'structuredAction',
    'stream',
    'cancel',
    'approval',
    'resume',
    'steer',
    'preferences',
  ],
};
