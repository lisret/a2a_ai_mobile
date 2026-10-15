// Tool-agnostic conformance runner (Wave 2A Task 7). Frozen seam consumed by
// Task 9-11 unit suites against their own fixtures; this file never imports a
// built-in adapter and declares no second Visual Agent domain type.
import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import type {
  VisualAgentCapabilitySet,
  VisualAgentErrorCode,
  VisualAgentProfileV1,
  VisualAgentResultV1,
  VisualAgentRunStatus,
  VisualAgentStructuredAction,
  VisualAgentTaskEvent,
  VisualAgentToolAdapter,
  VisualAgentToolId,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import type {VisualAgentUpstreamPort} from '../ports/VisualAgentUpstreamPort';

export interface VisualAgentAdapterConformanceFixture {
  readonly toolId: VisualAgentToolId;
  readonly adapter: VisualAgentToolAdapter;
  readonly profile: VisualAgentProfileV1;
  readonly binding: Readonly<Record<string, unknown>>;
  readonly upstream: VisualAgentUpstreamPort;
  readonly supportedCapabilities: VisualAgentCapabilitySet;
  readonly fallbackSpy: {readonly callCount: () => number};
  emitStatus(status: 'queued' | 'running'): void;
  emitApproval(approvalId: string): void;
  emitDelta(input: {
    textDelta?: string;
    visualUnderstandingDelta?: string;
    structuredAction?: VisualAgentStructuredAction;
  }): void;
  emitCompleted(result: VisualAgentResultV1): void;
  emitFailed(errorCode: VisualAgentErrorCode, resumeToken?: string): void;
  emitCancelled(resumeToken?: string): void;
  emitDisconnect(): void;
}

export interface VisualAgentConformanceOptions {
  readonly requiredStatuses: readonly VisualAgentRunStatus[];
  readonly negotiatedCapabilities: readonly (keyof VisualAgentCapabilitySet)[];
}

const CAPABILITY_KEYS = [
  'imageInput',
  'structuredAction',
  'stream',
  'cancel',
  'approval',
  'resume',
  'steer',
  'preferences',
] as const;

function fail(): never {
  throw new CapabilityError('visual_agent_execution_failed');
}

function assertManifest(fixture: VisualAgentAdapterConformanceFixture): void {
  const {adapter, toolId} = fixture;
  if (adapter.toolId !== toolId || adapter.manifest.toolId !== toolId) {
    fail();
  }
  if (!adapter.manifest.adapterVersion.trim()) {
    fail();
  }
  if (adapter.manifest.protocolVersions.length !== 1 || adapter.manifest.protocolVersions[0] !== 1) {
    fail();
  }
}

function assertNegotiatedSubset(
  fixture: VisualAgentAdapterConformanceFixture,
  options: VisualAgentConformanceOptions,
  negotiated: VisualAgentCapabilitySet,
): void {
  const negotiatedSet = new Set<string>(options.negotiatedCapabilities);
  for (const key of CAPABILITY_KEYS) {
    if (negotiatedSet.has(key)) {
      if (negotiated[key] !== true || fixture.supportedCapabilities[key] !== true) {
        fail();
      }
    } else if (negotiated[key] !== false) {
      // A capability that was not requested/negotiated must not be silently granted.
      fail();
    }
  }
}

function assertCorrelated(event: VisualAgentTaskEvent, taskId: string, sessionRevision: number): void {
  if (event.taskId !== taskId || event.sessionRevision !== sessionRevision) {
    fail();
  }
}

/**
 * Drives a fixture's adapter through connect → execute → status/approval/delta
 * → exactly one terminal result → disconnect, asserting the frozen Visual
 * Agent invariants along the way. Never falls back to a second execution path.
 */
export async function defineVisualAgentAdapterConformance(
  fixture: VisualAgentAdapterConformanceFixture,
  options: VisualAgentConformanceOptions,
): Promise<void> {
  assertManifest(fixture);

  const port = fixture.adapter.create(fixture.profile);
  const controller = new AbortController();
  const negotiated = await port.connect(fixture.profile, controller.signal);
  assertNegotiatedSubset(fixture, options, negotiated);

  const events: VisualAgentTaskEvent[] = [];
  let lastSequence = -1;
  const unsubscribe = port.subscribe(event => {
    if (event.sequence <= lastSequence) {
      fail();
    }
    lastSequence = event.sequence;
    events.push(event);
  });

  const sessionRevision = 1;
  const {taskId} = await port.execute(
    {
      protocolVersion: 1,
      taskId: 'conformance-task',
      sessionRevision,
      profileId: fixture.profile.profileId,
      instruction: 'conformance probe',
      idempotencyKey: 'conformance-key',
      requiredCapabilities: negotiated,
    },
    controller.signal,
  );
  if (!taskId) {
    fail();
  }

  if (options.requiredStatuses.includes('queued')) {
    fixture.emitStatus('queued');
    const last = events[events.length - 1];
    if (!last || last.type !== 'status' || last.status !== 'queued') {
      fail();
    }
    assertCorrelated(last, taskId, sessionRevision);
  }

  if (options.requiredStatuses.includes('running')) {
    fixture.emitStatus('running');
    const last = events[events.length - 1];
    if (!last || last.type !== 'status' || last.status !== 'running') {
      fail();
    }
    assertCorrelated(last, taskId, sessionRevision);
  }

  if (options.requiredStatuses.includes('waiting_approval')) {
    if (!negotiated.approval) {
      fail();
    }
    const approvalId = 'conformance-approval';
    fixture.emitApproval(approvalId);
    const last = events[events.length - 1];
    if (!last || last.type !== 'status' || last.status !== 'waiting_approval' || last.approvalId !== approvalId) {
      fail();
    }
    assertCorrelated(last, taskId, sessionRevision);
    await port.resolveApproval(
      {taskId, sessionRevision, approvalId, decision: 'approve'},
      controller.signal,
    );
  }

  fixture.emitDelta({textDelta: 'partial', structuredAction: {name: 'noop', arguments: {}}});
  const deltaEvent = events[events.length - 1];
  if (!deltaEvent || deltaEvent.type !== 'delta' || deltaEvent.textDelta !== 'partial') {
    fail();
  }
  assertCorrelated(deltaEvent, taskId, sessionRevision);

  if (options.requiredStatuses.includes('cancelled')) {
    if (!negotiated.cancel) {
      fail();
    }
    await port.cancel({taskId, sessionRevision}, controller.signal);
    fixture.emitCancelled('conformance-resume-token');
  } else if (options.requiredStatuses.includes('failed')) {
    fixture.emitFailed('visual_agent_execution_failed', negotiated.resume ? 'conformance-resume-token' : undefined);
  } else {
    fixture.emitCompleted({summary: 'conformance done'});
  }

  const isTerminal = (
    event: VisualAgentTaskEvent,
  ): event is Extract<VisualAgentTaskEvent, {type: 'terminal'}> => event.type === 'terminal';
  const terminalEvents = events.filter(isTerminal);
  if (terminalEvents.length !== 1) {
    fail();
  }
  const [terminal] = terminalEvents;
  assertCorrelated(terminal, taskId, sessionRevision);

  if (negotiated.resume && terminal.status === 'failed' && terminal.resumeToken) {
    await port.resume(
      {taskId, sessionRevision, resumeToken: terminal.resumeToken},
      controller.signal,
    );
  }

  if (negotiated.steer && terminal.status !== 'failed' && terminal.status !== 'cancelled') {
    await port.steer({taskId, sessionRevision, instruction: 'steer instruction'}, controller.signal);
  }

  if (negotiated.preferences) {
    await port.requestPreferences({type: 'list'}, controller.signal);
  }

  unsubscribe();
  fixture.emitDisconnect();
  await port.disconnect();
  if (port.getConnectionState().status === 'ready') {
    fail();
  }

  if (fixture.fallbackSpy.callCount() !== 0) {
    fail();
  }
}
