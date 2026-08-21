// Mobile Connector Bridge proxy (capability-domain Task 12). This is the only
// `VisualAgentExecutionPort` bound in the app: it opens exactly the configured
// Connector Bridge through `ConnectorBridgeTransport`, negotiates capabilities
// before any execute, correlates every task message to one immutable profile
// session, enforces a cancel timeout, and rejects pending work on disconnect.
// It carries only the runtime-owned `VisualAgentProtocolV1`; it never spawns a
// CLI, opens a product endpoint, or selects a second profile.
import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import type {IdGenerator, TimerPort} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {
  VisualAgentCapabilitySet,
  VisualAgentConnectionState,
  VisualAgentPreferenceCommand,
  VisualAgentProfileV1,
  VisualAgentExecutionPort,
  VisualAgentProtocolV1,
  VisualAgentTaskEnvelopeV1,
  VisualAgentTaskEvent,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import {
  createVisualAgentProtocolTaskTracker,
  decodeVisualAgentMessage,
  type VisualAgentProtocolTaskTracker,
} from '../../../connectorBridge/visualAgent/protocol/VisualAgentProtocolCodec';
import type {
  ConnectorBridgeSession,
  ConnectorBridgeTransport,
} from './ConnectorBridgeTransport';

const CANCEL_TIMEOUT_MS = 15_000;

type Pending<T> = {resolve: (value: T) => void; reject: (error: unknown) => void};

type PendingCancel = Pending<void> & {cancelTimer: () => void};

export class ConnectorBridgeVisualAgentClient implements VisualAgentExecutionPort {
  private state: VisualAgentConnectionState = {status: 'disconnected'};
  private session: ConnectorBridgeSession | null = null;
  private profile: VisualAgentProfileV1 | null = null;
  private negotiated: VisualAgentCapabilitySet | null = null;
  private unsubscribe: (() => void) | null = null;
  private pendingConnect: Pending<VisualAgentCapabilitySet> | null = null;
  private readonly listeners = new Set<(event: VisualAgentTaskEvent) => void>();
  private readonly pendingPreferences = new Map<string, Pending<unknown>>();
  private readonly pendingCancels = new Map<string, PendingCancel>();
  private readonly trackers = new Map<string, VisualAgentProtocolTaskTracker>();

  constructor(
    private readonly transport: ConnectorBridgeTransport,
    private readonly timer: TimerPort,
    private readonly ids: IdGenerator,
  ) {}

  getConnectionState(): VisualAgentConnectionState {
    return this.state;
  }

  async connect(
    profile: VisualAgentProfileV1,
    signal: AbortSignal,
  ): Promise<VisualAgentCapabilitySet> {
    this.profile = profile;
    this.state = {status: 'connecting'};
    let session: ConnectorBridgeSession;
    try {
      session = await this.transport.open({
        bridgeUrl: profile.connector.bridgeUrl,
        secretRef: profile.connector.secretRef,
        signal,
      });
    } catch {
      this.state = {status: 'failed', errorCode: 'visual_agent_auth_failed'};
      throw new CapabilityError('visual_agent_auth_failed');
    }

    this.session = session;
    this.unsubscribe = session.subscribe(raw => this.handleRaw(raw));
    this.state = {status: 'negotiating'};

    return new Promise<VisualAgentCapabilitySet>((resolve, reject) => {
      this.pendingConnect = {resolve, reject};
      this.send(requestId => ({
        version: 1,
        type: 'session.open',
        requestId,
        profileId: profile.profileId,
        toolId: profile.toolId,
        requestedCapabilities: profile.requestedCapabilities,
      })).catch(error => {
        this.pendingConnect = null;
        this.state = {status: 'failed', errorCode: 'visual_agent_disconnected'};
        reject(error);
      });
    });
  }

  async disconnect(): Promise<void> {
    const session = this.session;
    this.rejectAllPending(new CapabilityError('visual_agent_disconnected'));
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.session = null;
    this.negotiated = null;
    this.trackers.clear();
    this.state = {status: 'disconnected'};
    if (session) {
      try {
        await session.close();
      } catch {
        // Teardown is best-effort; the caller already has the disconnect outcome.
      }
    }
  }

  async execute(
    envelope: VisualAgentTaskEnvelopeV1,
    _signal: AbortSignal,
  ): Promise<{taskId: string}> {
    this.assertReady();
    this.trackers.set(
      envelope.taskId,
      createVisualAgentProtocolTaskTracker({
        taskId: envelope.taskId,
        sessionRevision: envelope.sessionRevision,
      }),
    );
    await this.send(requestId => ({version: 1, type: 'task.start', requestId, envelope}));
    return {taskId: envelope.taskId};
  }

  cancel(
    input: {taskId: string; sessionRevision: number},
    _signal: AbortSignal,
  ): Promise<void> {
    this.assertReady();
    this.assertCapability('cancel');
    return new Promise<void>((resolve, reject) => {
      const cancelTimer = this.timer.schedule(() => {
        this.pendingCancels.delete(input.taskId);
        reject(new CapabilityError('visual_agent_cancel_timeout'));
      }, CANCEL_TIMEOUT_MS);
      this.pendingCancels.set(input.taskId, {resolve, reject, cancelTimer});
      this.send(requestId => ({
        version: 1,
        type: 'task.cancel',
        requestId,
        taskId: input.taskId,
        sessionRevision: input.sessionRevision,
      })).catch(error => {
        cancelTimer();
        this.pendingCancels.delete(input.taskId);
        reject(error);
      });
    });
  }

  async resolveApproval(
    input: {
      taskId: string;
      sessionRevision: number;
      approvalId: string;
      decision: 'approve' | 'reject';
    },
    _signal: AbortSignal,
  ): Promise<void> {
    this.assertReady();
    this.assertCapability('approval');
    await this.send(requestId => ({
      version: 1,
      type: 'task.approval.resolve',
      requestId,
      taskId: input.taskId,
      sessionRevision: input.sessionRevision,
      approvalId: input.approvalId,
      decision: input.decision,
    }));
  }

  async resume(
    input: {taskId: string; sessionRevision: number; resumeToken: string},
    _signal: AbortSignal,
  ): Promise<void> {
    this.assertReady();
    this.assertCapability('resume');
    await this.send(requestId => ({
      version: 1,
      type: 'task.resume',
      requestId,
      taskId: input.taskId,
      sessionRevision: input.sessionRevision,
      resumeToken: input.resumeToken,
    }));
  }

  async steer(
    input: {taskId: string; sessionRevision: number; instruction: string},
    _signal: AbortSignal,
  ): Promise<void> {
    this.assertReady();
    this.assertCapability('steer');
    await this.send(requestId => ({
      version: 1,
      type: 'task.steer',
      requestId,
      taskId: input.taskId,
      sessionRevision: input.sessionRevision,
      instruction: input.instruction,
    }));
  }

  requestPreferences(
    command: VisualAgentPreferenceCommand,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.assertReady();
    this.assertCapability('preferences');
    const session = this.session;
    if (!session) {
      return Promise.reject(new CapabilityError('visual_agent_disconnected'));
    }
    const requestId = this.ids.next();
    return new Promise<unknown>((resolve, reject) => {
      if (signal.aborted) {
        reject(new CapabilityError('visual_agent_disconnected'));
        return;
      }
      this.pendingPreferences.set(requestId, {resolve, reject});
      session
        .send({version: 1, type: 'preference.request', requestId, command})
        .catch(() => {
          this.pendingPreferences.delete(requestId);
          reject(new CapabilityError('visual_agent_disconnected'));
        });
    });
  }

  subscribe(listener: (event: VisualAgentTaskEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private assertReady(): void {
    if (this.state.status !== 'ready' || !this.session) {
      throw new CapabilityError('visual_agent_not_ready');
    }
  }

  private assertCapability(key: keyof VisualAgentCapabilitySet): void {
    if (!this.negotiated || this.negotiated[key] !== true) {
      throw new CapabilityError('visual_agent_capability_unsupported');
    }
  }

  private async send(
    build: (requestId: string) => VisualAgentProtocolV1,
  ): Promise<void> {
    const session = this.session;
    if (!session) {
      throw new CapabilityError('visual_agent_disconnected');
    }
    try {
      await session.send(build(this.ids.next()));
    } catch {
      throw new CapabilityError('visual_agent_disconnected');
    }
  }

  private handleRaw(raw: string): void {
    let message: VisualAgentProtocolV1;
    try {
      message = decodeVisualAgentMessage(raw);
    } catch {
      // A malformed frame never escapes the listener or mutates task state.
      return;
    }
    this.route(message);
  }

  private route(message: VisualAgentProtocolV1): void {
    switch (message.type) {
      case 'session.ready': {
        this.negotiated = message.negotiatedCapabilities;
        this.state = {
          status: 'ready',
          negotiatedCapabilities: message.negotiatedCapabilities,
        };
        this.pendingConnect?.resolve(message.negotiatedCapabilities);
        this.pendingConnect = null;
        return;
      }
      case 'session.failed': {
        this.state = {status: 'failed', errorCode: message.errorCode};
        this.pendingConnect?.reject(new CapabilityError(message.errorCode));
        this.pendingConnect = null;
        return;
      }
      case 'task.status':
      case 'task.event':
      case 'task.completed':
      case 'task.failed':
      case 'task.cancelled':
        this.handleTaskEvent(message.event);
        return;
      case 'preference.result': {
        const pending = this.pendingPreferences.get(message.requestId);
        if (pending) {
          this.pendingPreferences.delete(message.requestId);
          pending.resolve(message.result);
        }
        return;
      }
      default:
        return;
    }
  }

  private handleTaskEvent(event: VisualAgentTaskEvent): void {
    const tracker = this.trackers.get(event.taskId);
    if (tracker) {
      try {
        tracker.accept(event);
      } catch {
        // A correlation/ordering violation is dropped rather than forwarded.
        return;
      }
    }
    for (const listener of this.listeners) {
      listener(event);
    }
    if (event.type === 'terminal') {
      this.trackers.delete(event.taskId);
      const pendingCancel = this.pendingCancels.get(event.taskId);
      if (pendingCancel) {
        this.pendingCancels.delete(event.taskId);
        pendingCancel.cancelTimer();
        pendingCancel.resolve();
      }
    }
  }

  private rejectAllPending(error: CapabilityError): void {
    if (this.pendingConnect) {
      this.pendingConnect.reject(error);
      this.pendingConnect = null;
    }
    for (const pending of this.pendingPreferences.values()) {
      pending.reject(error);
    }
    this.pendingPreferences.clear();
    for (const pending of this.pendingCancels.values()) {
      pending.cancelTimer();
      pending.reject(error);
    }
    this.pendingCancels.clear();
  }
}
