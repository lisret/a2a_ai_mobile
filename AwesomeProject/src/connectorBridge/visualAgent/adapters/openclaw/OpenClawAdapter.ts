// OpenClaw Gateway WebSocket adapter (capability-domain Task 9, Wave 2B Worker A).
// All IO goes through the injected `VisualAgentUpstreamPort` (protocol `gateway_ws`);
// this adapter never opens a socket or spawns a process itself. Every public
// failure surfaces as a generic `CapabilityError` — Gateway frames, URLs, and
// tokens are never echoed back to callers.
import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import type {TimerPort} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {
  VisualAgentCapabilitySet,
  VisualAgentConnectionState,
  VisualAgentErrorCode,
  VisualAgentExecutionPort,
  VisualAgentPreferenceCommand,
  VisualAgentProfileV1,
  VisualAgentResultV1,
  VisualAgentStructuredAction,
  VisualAgentTaskEnvelopeV1,
  VisualAgentTaskEvent,
  VisualAgentToolAdapter,
  VisualAgentToolManifestV1,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import type {
  VisualAgentBindingPort,
  VisualAgentUpstreamPort,
  VisualAgentUpstreamSession,
} from '../../ports/VisualAgentUpstreamPort';
import {parseOpenClawBindingV1, toOpenClawUpstreamBinding} from './OpenClawBinding';

const HEARTBEAT_TIMEOUT_MS = 45_000;

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

const VISUAL_AGENT_ERROR_CODES = new Set<string>([
  'visual_agent_invalid_profile',
  'visual_agent_adapter_not_found',
  'visual_agent_adapter_duplicate',
  'visual_agent_capability_unsupported',
  'visual_agent_not_ready',
  'visual_agent_auth_failed',
  'visual_agent_protocol_error',
  'visual_agent_disconnected',
  'visual_agent_execution_failed',
  'visual_agent_cancel_timeout',
  'visual_agent_approval_required',
  'visual_agent_resume_unsupported',
]);

export const openClawManifest: VisualAgentToolManifestV1 = {
  toolId: 'openclaw',
  displayName: 'OpenClaw',
  maturity: 'stable',
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isVisualAgentErrorCode(value: unknown): value is VisualAgentErrorCode {
  return typeof value === 'string' && VISUAL_AGENT_ERROR_CODES.has(value);
}

/**
 * Intersects requested with Gateway-negotiated capabilities: a capability is
 * only granted when it was both requested and returned by the Gateway.
 * Throws when a requested capability was not granted.
 */
function computeGrantedCapabilities(
  requested: VisualAgentCapabilitySet,
  negotiatedFromGateway: VisualAgentCapabilitySet,
): VisualAgentCapabilitySet {
  const granted: Record<string, boolean> = {};
  for (const key of CAPABILITY_KEYS) {
    if (requested[key] && !negotiatedFromGateway[key]) {
      throw new CapabilityError('visual_agent_capability_unsupported');
    }
    granted[key] = requested[key] === true && negotiatedFromGateway[key] === true;
  }
  return granted as unknown as VisualAgentCapabilitySet;
}

type PendingPreferenceRequest = {
  resolve(value: unknown): void;
  reject(error: unknown): void;
};

class OpenClawExecutionPort implements VisualAgentExecutionPort {
  private state: VisualAgentConnectionState = {status: 'disconnected'};
  private session: VisualAgentUpstreamSession | null = null;
  private negotiatedCapabilities: VisualAgentCapabilitySet | null = null;
  private readonly listeners = new Set<(event: VisualAgentTaskEvent) => void>();
  private readonly pendingPreferenceRequests = new Map<string, PendingPreferenceRequest>();
  private unsubscribeUpstream: (() => void) | null = null;
  private cancelHeartbeatTimeout: (() => void) | null = null;
  private requestSequence = 0;

  constructor(
    private readonly bindings: VisualAgentBindingPort,
    private readonly upstream: VisualAgentUpstreamPort,
    private readonly timer: TimerPort,
  ) {}

  getConnectionState(): VisualAgentConnectionState {
    return this.state;
  }

  async connect(
    profile: VisualAgentProfileV1,
    signal: AbortSignal,
  ): Promise<VisualAgentCapabilitySet> {
    this.state = {status: 'connecting'};
    const rawBinding = await this.bindings.read(profile.connector.bindingId, 'openclaw');
    const binding = parseOpenClawBindingV1(rawBinding);

    this.state = {status: 'authenticating'};
    let session: VisualAgentUpstreamSession;
    try {
      session = await this.upstream.open({
        protocol: 'gateway_ws',
        binding: toOpenClawUpstreamBinding(binding),
        signal,
      });
    } catch {
      this.state = {status: 'failed', errorCode: 'visual_agent_auth_failed'};
      throw new CapabilityError('visual_agent_auth_failed');
    }

    this.state = {status: 'negotiating'};
    let negotiatedFromGateway: VisualAgentCapabilitySet;
    try {
      negotiatedFromGateway = await session.negotiate(profile.requestedCapabilities);
    } catch {
      await this.closeSessionQuietly(session);
      this.state = {status: 'failed', errorCode: 'visual_agent_not_ready'};
      throw new CapabilityError('visual_agent_not_ready');
    }

    let granted: VisualAgentCapabilitySet;
    try {
      granted = computeGrantedCapabilities(profile.requestedCapabilities, negotiatedFromGateway);
    } catch (error) {
      await this.closeSessionQuietly(session);
      this.state = {status: 'failed', errorCode: 'visual_agent_capability_unsupported'};
      throw error;
    }

    this.session = session;
    this.negotiatedCapabilities = granted;
    this.unsubscribeUpstream = session.subscribe(message => this.handleUpstreamMessage(message));
    this.scheduleHeartbeatTimeout();
    this.state = {status: 'ready', negotiatedCapabilities: granted};
    return granted;
  }

  async disconnect(): Promise<void> {
    if (this.state.status === 'disconnected' || this.state.status === 'disabled') {
      return;
    }
    const session = this.session;
    this.teardownConnection('visual_agent_disconnected');
    if (session) {
      await this.closeSessionQuietly(session);
    }
  }

  async execute(
    envelope: VisualAgentTaskEnvelopeV1,
    _signal: AbortSignal,
  ): Promise<{taskId: string}> {
    this.assertReady();
    await this.sendOrFail({
      type: 'task.start',
      taskId: envelope.taskId,
      sessionRevision: envelope.sessionRevision,
      profileId: envelope.profileId,
      instruction: envelope.instruction,
      idempotencyKey: envelope.idempotencyKey,
      requiredCapabilities: envelope.requiredCapabilities,
      ...(envelope.image ? {image: envelope.image} : {}),
    });
    return {taskId: envelope.taskId};
  }

  async cancel(
    input: {taskId: string; sessionRevision: number},
    _signal: AbortSignal,
  ): Promise<void> {
    this.assertReady();
    this.assertCapability('cancel');
    await this.sendOrFail({type: 'task.cancel', taskId: input.taskId, sessionRevision: input.sessionRevision});
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
    await this.sendOrFail({
      type: 'task.approval.resolve',
      taskId: input.taskId,
      sessionRevision: input.sessionRevision,
      approvalId: input.approvalId,
      decision: input.decision,
    });
  }

  async resume(
    input: {taskId: string; sessionRevision: number; resumeToken: string},
    _signal: AbortSignal,
  ): Promise<void> {
    this.assertReady();
    this.assertCapability('resume');
    await this.sendOrFail({
      type: 'task.resume',
      taskId: input.taskId,
      sessionRevision: input.sessionRevision,
      resumeToken: input.resumeToken,
    });
  }

  async steer(
    input: {taskId: string; sessionRevision: number; instruction: string},
    _signal: AbortSignal,
  ): Promise<void> {
    this.assertReady();
    this.assertCapability('steer');
    await this.sendOrFail({
      type: 'task.steer',
      taskId: input.taskId,
      sessionRevision: input.sessionRevision,
      instruction: input.instruction,
    });
  }

  async requestPreferences(command: VisualAgentPreferenceCommand, signal: AbortSignal): Promise<unknown> {
    this.assertReady();
    this.assertCapability('preferences');
    const requestId = this.nextRequestId();
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new CapabilityError('visual_agent_disconnected'));
        return;
      }
      this.pendingPreferenceRequests.set(requestId, {resolve, reject});
      this.sendOrFail({type: 'preference.request', requestId, command}).catch(error => {
        this.pendingPreferenceRequests.delete(requestId);
        reject(error);
      });
    });
  }

  subscribe(listener: (event: VisualAgentTaskEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private assertReady(): void {
    if (this.state.status !== 'ready' || !this.session) {
      throw new CapabilityError('visual_agent_not_ready');
    }
  }

  private assertCapability(key: keyof VisualAgentCapabilitySet): void {
    if (!this.negotiatedCapabilities || this.negotiatedCapabilities[key] !== true) {
      throw new CapabilityError('visual_agent_capability_unsupported');
    }
  }

  private async sendOrFail(message: Readonly<Record<string, unknown>>): Promise<void> {
    if (!this.session) {
      throw new CapabilityError('visual_agent_disconnected');
    }
    try {
      await this.session.send(message);
    } catch {
      throw new CapabilityError('visual_agent_disconnected');
    }
  }

  private nextRequestId(): string {
    this.requestSequence += 1;
    return `openclaw-req-${this.requestSequence}`;
  }

  private scheduleHeartbeatTimeout(): void {
    this.cancelHeartbeatTimeout?.();
    this.cancelHeartbeatTimeout = this.timer.schedule(
      () => this.handleUpstreamDisconnected(),
      HEARTBEAT_TIMEOUT_MS,
    );
  }

  private teardownConnection(rejectionCode: VisualAgentErrorCode): void {
    this.cancelHeartbeatTimeout?.();
    this.cancelHeartbeatTimeout = null;
    this.unsubscribeUpstream?.();
    this.unsubscribeUpstream = null;
    for (const pending of this.pendingPreferenceRequests.values()) {
      pending.reject(new CapabilityError(rejectionCode));
    }
    this.pendingPreferenceRequests.clear();
    this.session = null;
    this.negotiatedCapabilities = null;
    this.state = {status: 'disconnected'};
  }

  private async closeSessionQuietly(session: VisualAgentUpstreamSession): Promise<void> {
    try {
      await session.close();
    } catch {
      // Disconnect is best-effort; the caller already has the outcome it needs.
    }
  }

  private handleUpstreamDisconnected(): void {
    if (this.state.status === 'disconnected' || this.state.status === 'disabled') {
      return;
    }
    this.teardownConnection('visual_agent_disconnected');
  }

  private handleUpstreamMessage(message: unknown): void {
    if (!isObject(message) || typeof message.type !== 'string') {
      return;
    }
    switch (message.type) {
      case 'gateway.heartbeat':
        this.scheduleHeartbeatTimeout();
        this.sendOrFail({type: 'gateway.heartbeat.ack'}).catch(() => {
          // Heartbeat ack failures are surfaced to callers via the next
          // operation's rejection, not as an unhandled promise here.
        });
        return;
      case 'gateway.disconnected':
        this.handleUpstreamDisconnected();
        return;
      case 'task.accepted':
        this.emitStatusEvent(message, 'queued');
        return;
      case 'task.event':
        this.emitTaskEvent(message);
        return;
      case 'task.completed':
        this.emitTerminalCompleted(message);
        return;
      case 'task.failed':
        this.emitTerminalFailed(message);
        return;
      case 'task.cancelled':
        this.emitTerminalCancelled(message);
        return;
      case 'preference.result':
        this.resolvePreferenceResult(message);
        return;
      default:
        return;
    }
  }

  private correlated(message: Record<string, unknown>): {taskId: string; sessionRevision: number; sequence: number} | null {
    if (
      !isNonEmptyString(message.taskId) ||
      !isFiniteNumber(message.sessionRevision) ||
      !isFiniteNumber(message.sequence)
    ) {
      return null;
    }
    return {
      taskId: message.taskId,
      sessionRevision: message.sessionRevision,
      sequence: message.sequence,
    };
  }

  private emitStatusEvent(message: Record<string, unknown>, status: 'queued' | 'running'): void {
    const base = this.correlated(message);
    if (!base) {
      return;
    }
    this.emit({type: 'status', ...base, status});
  }

  private emitTaskEvent(message: Record<string, unknown>): void {
    const base = this.correlated(message);
    if (!base) {
      return;
    }
    if (message.kind === 'running') {
      this.emit({type: 'status', ...base, status: 'running'});
      return;
    }
    if (message.kind === 'waiting_approval') {
      if (!isNonEmptyString(message.approvalId)) {
        return;
      }
      this.emit({type: 'status', ...base, status: 'waiting_approval', approvalId: message.approvalId});
      return;
    }
    if (message.kind === 'delta') {
      const delta: {
        type: 'delta';
        taskId: string;
        sessionRevision: number;
        sequence: number;
        textDelta?: string;
        visualUnderstandingDelta?: string;
        structuredAction?: VisualAgentStructuredAction;
      } = {type: 'delta', ...base};
      if (typeof message.textDelta === 'string') {
        delta.textDelta = message.textDelta;
      }
      if (typeof message.visualUnderstandingDelta === 'string') {
        delta.visualUnderstandingDelta = message.visualUnderstandingDelta;
      }
      if (isObject(message.structuredAction)) {
        delta.structuredAction = message.structuredAction as unknown as VisualAgentStructuredAction;
      }
      this.emit(delta);
    }
  }

  private emitTerminalCompleted(message: Record<string, unknown>): void {
    const base = this.correlated(message);
    if (!base || !isObject(message.result)) {
      return;
    }
    this.emit({
      type: 'terminal',
      ...base,
      status: 'completed',
      result: message.result as unknown as VisualAgentResultV1,
    });
  }

  private emitTerminalFailed(message: Record<string, unknown>): void {
    const base = this.correlated(message);
    if (!base) {
      return;
    }
    const errorCode = isVisualAgentErrorCode(message.errorCode)
      ? message.errorCode
      : 'visual_agent_execution_failed';
    this.emit({
      type: 'terminal',
      ...base,
      status: 'failed',
      errorCode,
      ...(isNonEmptyString(message.resumeToken) ? {resumeToken: message.resumeToken} : {}),
    });
  }

  private emitTerminalCancelled(message: Record<string, unknown>): void {
    const base = this.correlated(message);
    if (!base) {
      return;
    }
    this.emit({
      type: 'terminal',
      ...base,
      status: 'cancelled',
      ...(isNonEmptyString(message.resumeToken) ? {resumeToken: message.resumeToken} : {}),
    });
  }

  private resolvePreferenceResult(message: Record<string, unknown>): void {
    if (!isNonEmptyString(message.requestId)) {
      return;
    }
    const pending = this.pendingPreferenceRequests.get(message.requestId);
    if (!pending) {
      return;
    }
    this.pendingPreferenceRequests.delete(message.requestId);
    pending.resolve(message.result);
  }

  private emit(event: VisualAgentTaskEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export class OpenClawAdapter implements VisualAgentToolAdapter {
  readonly toolId = 'openclaw' as const;
  readonly manifest = openClawManifest;

  constructor(
    private readonly bindings: VisualAgentBindingPort,
    private readonly upstream: VisualAgentUpstreamPort,
    private readonly timer: TimerPort,
  ) {}

  create(_profile: VisualAgentProfileV1): VisualAgentExecutionPort {
    return new OpenClawExecutionPort(this.bindings, this.upstream, this.timer);
  }
}
