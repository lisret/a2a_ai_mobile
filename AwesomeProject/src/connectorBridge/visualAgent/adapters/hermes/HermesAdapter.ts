// Hermes Visual Agent adapter. Maps each of the four Hermes transports
// (ACP stdio, TUI Gateway JSON-RPC over stdio or WS, and Runs HTTP+SSE) onto the
// transport-neutral `VisualAgentUpstreamPort`, one binding mode at a time with no
// fallback. Run approval, steer/cancel, resume, and inline image input are only
// activated when the upstream negotiation reports the corresponding capability;
// a requested-but-not-negotiated capability fails closed before any send.
import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import type {
  VisualAgentCapabilitySet,
  VisualAgentConnectionState,
  VisualAgentExecutionPort,
  VisualAgentPreferenceCommand,
  VisualAgentProfileV1,
  VisualAgentTaskEnvelopeV1,
  VisualAgentTaskEvent,
  VisualAgentToolAdapter,
  VisualAgentToolManifestV1,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import type {
  VisualAgentBindingPort,
  VisualAgentUpstreamPort,
  VisualAgentUpstreamProtocol,
  VisualAgentUpstreamSession,
} from '../../ports/VisualAgentUpstreamPort';
import {
  createVisualAgentProtocolTaskTracker,
  decodeVisualAgentMessage,
  encodeVisualAgentMessage,
  type VisualAgentProtocolTaskTracker,
} from '../../protocol/VisualAgentProtocolCodec';
import {validateHermesBinding, type HermesBindingV1} from './HermesBinding';

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

export const hermesManifest: VisualAgentToolManifestV1 = {
  toolId: 'hermes',
  displayName: 'Hermes',
  maturity: 'beta',
  adapterVersion: '1.0.0',
  protocolVersions: [1],
  declaredCapabilities: {
    imageInput: true,
    structuredAction: true,
    stream: true,
    cancel: true,
    approval: true,
    resume: true,
    steer: true,
    preferences: true,
  },
};

class HermesExecutionPort implements VisualAgentExecutionPort {
  private state: VisualAgentConnectionState = {status: 'disconnected'};
  private session: VisualAgentUpstreamSession | null = null;
  private unsubscribeUpstream: (() => void) | null = null;
  private negotiated: VisualAgentCapabilitySet | null = null;
  private tracker: VisualAgentProtocolTaskTracker | null = null;
  private requestSeq = 0;
  private currentTask: {taskId: string; sessionRevision: number} | null = null;
  private terminalDelivered = false;
  private lastDeliveredSequence = -1;
  private readonly listeners = new Set<(event: VisualAgentTaskEvent) => void>();

  constructor(
    private readonly bindings: VisualAgentBindingPort,
    private readonly upstream: VisualAgentUpstreamPort,
  ) {}

  getConnectionState(): VisualAgentConnectionState {
    return this.state;
  }

  async connect(
    profile: VisualAgentProfileV1,
    signal: AbortSignal,
  ): Promise<VisualAgentCapabilitySet> {
    this.state = {status: 'connecting'};
    let binding: HermesBindingV1;
    try {
      const raw = await this.bindings.read(profile.connector.bindingId, 'hermes');
      binding = validateHermesBinding(raw);
    } catch (error) {
      this.state = {status: 'failed', errorCode: 'visual_agent_invalid_profile'};
      throw error instanceof CapabilityError
        ? error
        : new CapabilityError('visual_agent_invalid_profile');
    }

    this.state = {status: 'negotiating'};
    const protocol: VisualAgentUpstreamProtocol = binding.protocol;
    const session = await this.upstream.open({
      protocol,
      binding: binding as unknown as Readonly<Record<string, unknown>>,
      signal,
    });
    this.session = session;
    this.unsubscribeUpstream = session.subscribe(message =>
      this.handleUpstream(message),
    );

    const negotiated = await session.negotiate(profile.requestedCapabilities);
    for (const key of CAPABILITY_KEYS) {
      if (profile.requestedCapabilities[key] && !negotiated[key]) {
        this.state = {
          status: 'failed',
          errorCode: 'visual_agent_capability_unsupported',
        };
        await this.closeSession();
        throw new CapabilityError('visual_agent_capability_unsupported');
      }
    }

    this.negotiated = negotiated;
    this.state = {status: 'ready', negotiatedCapabilities: negotiated};
    return negotiated;
  }

  private handleUpstream(message: unknown): void {
    // A malformed or mis-correlated frame must never throw out of the upstream
    // subscribe listener. Decode/tracker rejections are caught and modeled as a
    // `visual_agent_protocol_error` failed state; the raw frame is never leaked.
    if (this.terminalDelivered) {
      return;
    }
    try {
      if (typeof message !== 'string') {
        return;
      }
      const decoded = decodeVisualAgentMessage(message);
      switch (decoded.type) {
        case 'task.status':
        case 'task.event':
        case 'task.completed':
        case 'task.failed':
        case 'task.cancelled':
          this.forward(decoded.event);
          break;
        default:
          break;
      }
    } catch {
      this.failWithProtocolError();
    }
  }

  private forward(event: VisualAgentTaskEvent): void {
    if (this.tracker) {
      this.tracker.accept(event);
    }
    this.lastDeliveredSequence = event.sequence;
    if (event.type === 'terminal') {
      this.terminalDelivered = true;
    }
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  private failWithProtocolError(): void {
    this.state = {status: 'failed', errorCode: 'visual_agent_protocol_error'};
    if (!this.currentTask || this.terminalDelivered) {
      return;
    }
    const terminal: VisualAgentTaskEvent = {
      type: 'terminal',
      taskId: this.currentTask.taskId,
      sessionRevision: this.currentTask.sessionRevision,
      sequence: this.lastDeliveredSequence + 1,
      status: 'failed',
      errorCode: 'visual_agent_protocol_error',
    };
    this.terminalDelivered = true;
    this.lastDeliveredSequence = terminal.sequence;
    for (const listener of [...this.listeners]) {
      listener(terminal);
    }
  }

  subscribe(listener: (event: VisualAgentTaskEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private ensureReady(): {
    session: VisualAgentUpstreamSession;
    negotiated: VisualAgentCapabilitySet;
  } {
    if (this.state.status !== 'ready' || !this.session || !this.negotiated) {
      throw new CapabilityError('visual_agent_not_ready');
    }
    return {session: this.session, negotiated: this.negotiated};
  }

  private nextRequestId(): string {
    this.requestSeq += 1;
    return `hermes-req-${this.requestSeq}`;
  }

  async execute(
    envelope: VisualAgentTaskEnvelopeV1,
    _signal: AbortSignal,
  ): Promise<{taskId: string}> {
    const {session, negotiated} = this.ensureReady();
    for (const key of CAPABILITY_KEYS) {
      if (envelope.requiredCapabilities[key] && !negotiated[key]) {
        throw new CapabilityError('visual_agent_capability_unsupported');
      }
    }
    if (envelope.image && !negotiated.imageInput) {
      throw new CapabilityError('visual_agent_capability_unsupported');
    }
    this.tracker = createVisualAgentProtocolTaskTracker({
      taskId: envelope.taskId,
      sessionRevision: envelope.sessionRevision,
    });
    this.currentTask = {
      taskId: envelope.taskId,
      sessionRevision: envelope.sessionRevision,
    };
    this.terminalDelivered = false;
    this.lastDeliveredSequence = -1;
    await session.send(
      encodeVisualAgentMessage({
        version: 1,
        type: 'task.start',
        requestId: this.nextRequestId(),
        envelope,
      }),
    );
    return {taskId: envelope.taskId};
  }

  async cancel(
    input: {taskId: string; sessionRevision: number},
    _signal: AbortSignal,
  ): Promise<void> {
    const {session, negotiated} = this.ensureReady();
    if (!negotiated.cancel) {
      throw new CapabilityError('visual_agent_capability_unsupported');
    }
    await session.send(
      encodeVisualAgentMessage({
        version: 1,
        type: 'task.cancel',
        requestId: this.nextRequestId(),
        taskId: input.taskId,
        sessionRevision: input.sessionRevision,
      }),
    );
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
    const {session, negotiated} = this.ensureReady();
    if (!negotiated.approval) {
      throw new CapabilityError('visual_agent_capability_unsupported');
    }
    await session.send(
      encodeVisualAgentMessage({
        version: 1,
        type: 'task.approval.resolve',
        requestId: this.nextRequestId(),
        taskId: input.taskId,
        sessionRevision: input.sessionRevision,
        approvalId: input.approvalId,
        decision: input.decision,
      }),
    );
  }

  async resume(
    input: {taskId: string; sessionRevision: number; resumeToken: string},
    _signal: AbortSignal,
  ): Promise<void> {
    const {session, negotiated} = this.ensureReady();
    if (!negotiated.resume) {
      throw new CapabilityError('visual_agent_resume_unsupported');
    }
    await session.send(
      encodeVisualAgentMessage({
        version: 1,
        type: 'task.resume',
        requestId: this.nextRequestId(),
        taskId: input.taskId,
        sessionRevision: input.sessionRevision,
        resumeToken: input.resumeToken,
      }),
    );
  }

  async steer(
    input: {taskId: string; sessionRevision: number; instruction: string},
    _signal: AbortSignal,
  ): Promise<void> {
    const {session, negotiated} = this.ensureReady();
    if (!negotiated.steer) {
      throw new CapabilityError('visual_agent_capability_unsupported');
    }
    await session.send(
      encodeVisualAgentMessage({
        version: 1,
        type: 'task.steer',
        requestId: this.nextRequestId(),
        taskId: input.taskId,
        sessionRevision: input.sessionRevision,
        instruction: input.instruction,
      }),
    );
  }

  async requestPreferences(
    command: VisualAgentPreferenceCommand,
    _signal: AbortSignal,
  ): Promise<unknown> {
    const {session, negotiated} = this.ensureReady();
    if (!negotiated.preferences) {
      throw new CapabilityError('visual_agent_capability_unsupported');
    }
    await session.send(
      encodeVisualAgentMessage({
        version: 1,
        type: 'preference.request',
        requestId: this.nextRequestId(),
        command,
      }),
    );
    return undefined;
  }

  private async closeSession(): Promise<void> {
    const session = this.session;
    this.unsubscribeUpstream?.();
    this.unsubscribeUpstream = null;
    this.session = null;
    if (session) {
      await session.close();
    }
  }

  async disconnect(): Promise<void> {
    await this.closeSession();
    this.tracker = null;
    this.currentTask = null;
    this.negotiated = null;
    this.state = {status: 'disconnected'};
  }
}

export class HermesAdapter implements VisualAgentToolAdapter {
  readonly toolId = 'hermes' as const;
  readonly manifest = hermesManifest;

  constructor(
    private readonly bindings: VisualAgentBindingPort,
    private readonly upstream: VisualAgentUpstreamPort,
  ) {}

  validateBinding(input: unknown): HermesBindingV1 {
    return validateHermesBinding(input);
  }

  create(_profile: VisualAgentProfileV1): VisualAgentExecutionPort {
    return new HermesExecutionPort(this.bindings, this.upstream);
  }
}
