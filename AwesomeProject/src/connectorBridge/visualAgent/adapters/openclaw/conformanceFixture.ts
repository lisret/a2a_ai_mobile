// Fixture driving `defineVisualAgentAdapterConformance` against the OpenClaw
// adapter's own in-memory mock of the Gateway WS upstream. No real socket,
// process, or shared adapter code is touched.
import type {
  VisualAgentCapabilitySet,
  VisualAgentErrorCode,
  VisualAgentPreferenceCommand,
  VisualAgentPreferenceResult,
  VisualAgentProfileV1,
  VisualAgentResultV1,
  VisualAgentStructuredAction,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import type {VisualAgentAdapterConformanceFixture} from '../../conformance/VisualAgentAdapterConformance';
import type {
  VisualAgentBindingPort,
  VisualAgentUpstreamPort,
  VisualAgentUpstreamSession,
} from '../../ports/VisualAgentUpstreamPort';
import {OpenClawAdapter} from './OpenClawAdapter';

const CONFORMANCE_TASK_ID = 'conformance-task';
const CONFORMANCE_SESSION_REVISION = 1;

const allCapabilities: VisualAgentCapabilitySet = {
  imageInput: true,
  structuredAction: true,
  stream: true,
  cancel: true,
  approval: true,
  resume: true,
  steer: true,
  preferences: true,
};

const conformanceBinding = Object.freeze({
  schemaVersion: 1,
  toolId: 'openclaw',
  protocol: 'gateway_ws',
  gatewayUrl: 'wss://gateway.conformance.internal/ws',
  deviceId: 'conformance-device',
  cluster: 'conformance-cluster',
  secretRef: 'conformance-secret-ref',
});

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Synthesizes the Gateway's `preference.result` reply for a request. */
function buildPreferenceResult(command: unknown): VisualAgentPreferenceResult {
  const typed = command as VisualAgentPreferenceCommand;
  if (typed.type === 'upsert') {
    return {
      type: 'upsert',
      preference: {
        id: typed.preference.id,
        kind: typed.preference.kind,
        title: typed.preference.title,
        summary: typed.preference.summary,
        createdAtEpochMs: 0,
        updatedAtEpochMs: 0,
      },
    };
  }
  if (typed.type === 'delete') {
    return {type: 'delete', preferenceId: typed.preferenceId};
  }
  if (typed.type === 'clear') {
    return {type: 'clear'};
  }
  return {type: 'list', preferences: []};
}

export function createOpenClawConformanceFixture(): VisualAgentAdapterConformanceFixture {
  let subscribedListener: ((message: unknown) => void) | null = null;
  let sequence = 0;

  const session: jest.Mocked<VisualAgentUpstreamSession> = {
    negotiate: jest.fn().mockResolvedValue(allCapabilities),
    send: jest.fn().mockImplementation(async (message: unknown) => {
      if (isObject(message) && message.type === 'preference.request' && typeof message.requestId === 'string') {
        const requestId = message.requestId;
        const result = buildPreferenceResult(message.command);
        queueMicrotask(() => {
          subscribedListener?.({type: 'preference.result', requestId, result});
        });
      }
    }),
    subscribe: jest.fn().mockImplementation((listener: (message: unknown) => void) => {
      subscribedListener = listener;
      return () => {
        subscribedListener = null;
      };
    }),
    close: jest.fn().mockResolvedValue(undefined),
  };

  const upstream: VisualAgentUpstreamPort = {
    open: jest.fn().mockResolvedValue(session),
  };

  const bindings: VisualAgentBindingPort = {
    read: jest.fn().mockResolvedValue(conformanceBinding),
  };

  const timer = {schedule: jest.fn().mockReturnValue(() => {})};

  const profile: VisualAgentProfileV1 = {
    schemaVersion: 1,
    profileId: 'conformance-profile',
    toolId: 'openclaw',
    enabled: true,
    connector: {
      kind: 'connector_bridge',
      bridgeUrl: 'https://bridge.conformance.internal',
      bindingId: 'conformance-binding',
      secretRef: null,
    },
    requestedCapabilities: allCapabilities,
  };

  const nextSequence = (): number => {
    sequence += 1;
    return sequence;
  };

  const emitRaw = (message: Record<string, unknown>): void => {
    subscribedListener?.(message);
  };

  return {
    toolId: 'openclaw',
    adapter: new OpenClawAdapter(bindings, upstream, timer),
    profile,
    binding: conformanceBinding,
    upstream,
    supportedCapabilities: allCapabilities,
    fallbackSpy: {callCount: () => 0},

    emitStatus(status: 'queued' | 'running'): void {
      if (status === 'queued') {
        emitRaw({
          type: 'task.accepted',
          taskId: CONFORMANCE_TASK_ID,
          sessionRevision: CONFORMANCE_SESSION_REVISION,
          sequence: nextSequence(),
        });
        return;
      }
      emitRaw({
        type: 'task.event',
        kind: 'running',
        taskId: CONFORMANCE_TASK_ID,
        sessionRevision: CONFORMANCE_SESSION_REVISION,
        sequence: nextSequence(),
      });
    },

    emitApproval(approvalId: string): void {
      emitRaw({
        type: 'task.event',
        kind: 'waiting_approval',
        approvalId,
        taskId: CONFORMANCE_TASK_ID,
        sessionRevision: CONFORMANCE_SESSION_REVISION,
        sequence: nextSequence(),
      });
    },

    emitDelta(input: {
      textDelta?: string;
      visualUnderstandingDelta?: string;
      structuredAction?: VisualAgentStructuredAction;
    }): void {
      emitRaw({
        type: 'task.event',
        kind: 'delta',
        taskId: CONFORMANCE_TASK_ID,
        sessionRevision: CONFORMANCE_SESSION_REVISION,
        sequence: nextSequence(),
        ...input,
      });
    },

    emitCompleted(result: VisualAgentResultV1): void {
      emitRaw({
        type: 'task.completed',
        taskId: CONFORMANCE_TASK_ID,
        sessionRevision: CONFORMANCE_SESSION_REVISION,
        sequence: nextSequence(),
        result,
      });
    },

    emitFailed(errorCode: VisualAgentErrorCode, resumeToken?: string): void {
      emitRaw({
        type: 'task.failed',
        taskId: CONFORMANCE_TASK_ID,
        sessionRevision: CONFORMANCE_SESSION_REVISION,
        sequence: nextSequence(),
        errorCode,
        ...(resumeToken ? {resumeToken} : {}),
      });
    },

    emitCancelled(resumeToken?: string): void {
      emitRaw({
        type: 'task.cancelled',
        taskId: CONFORMANCE_TASK_ID,
        sessionRevision: CONFORMANCE_SESSION_REVISION,
        sequence: nextSequence(),
        ...(resumeToken ? {resumeToken} : {}),
      });
    },

    emitDisconnect(): void {
      emitRaw({type: 'gateway.disconnected'});
    },
  };
}
