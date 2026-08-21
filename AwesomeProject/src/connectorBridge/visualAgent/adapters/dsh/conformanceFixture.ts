// Self-contained conformance fixture for the DSH adapter. It wires a fake
// `VisualAgentUpstreamPort` whose emit helpers push correlated, strictly
// increasing protocol frames (encoded through the shared codec) so the frozen
// `defineVisualAgentAdapterConformance` runner can drive connect → execute →
// status/delta → exactly one terminal → disconnect. `fallbackSpy` is always 0:
// the DSH adapter has no second execution path.
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
import {DshAdapter} from './DshAdapter';
import type {DshBindingV1} from './DshBinding';

const TASK_ID = 'conformance-task';
const SESSION_REVISION = 1;

const negotiatedCapabilities: VisualAgentCapabilitySet = {
  imageInput: false,
  structuredAction: true,
  stream: true,
  cancel: true,
  approval: false,
  resume: false,
  steer: false,
  preferences: false,
};

const binding: DshBindingV1 = {
  schemaVersion: 1,
  toolId: 'dsh',
  product: 'deepseek-harness',
  protocol: 'custom_bridge',
  version: '1.0.0',
  endpointOrExecutable: 'bridge://deepseek-harness',
  cwd: null,
  args: [],
  secretRef: null,
  enabled: true,
  declaredCapabilities: negotiatedCapabilities,
};

const profile: VisualAgentProfileV1 = {
  schemaVersion: 1,
  profileId: 'dsh-conformance',
  toolId: 'dsh',
  enabled: true,
  connector: {
    kind: 'connector_bridge',
    bridgeUrl: 'https://bridge.example',
    bindingId: 'b-dsh-conformance',
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

  const adapter = new DshAdapter(bindings, upstream);

  return {
    toolId: 'dsh',
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
        requestId: `dsh-evt-${seq}`,
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
        requestId: `dsh-evt-${seq}`,
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
        requestId: `dsh-evt-${seq}`,
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
        requestId: `dsh-evt-${seq}`,
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
        requestId: `dsh-evt-${seq}`,
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
        requestId: `dsh-evt-${seq}`,
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

export const dshConformanceFixture: VisualAgentAdapterConformanceFixture =
  buildFixture();

export const dshRequiredConformance: VisualAgentConformanceOptions = {
  requiredStatuses: ['queued', 'running', 'cancelled'],
  negotiatedCapabilities: ['structuredAction', 'stream', 'cancel'],
};
