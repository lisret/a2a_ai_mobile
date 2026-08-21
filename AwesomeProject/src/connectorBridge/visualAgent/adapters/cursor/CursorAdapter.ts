// Wave 2B Worker B: Cursor Visual Agent adapter. Mobile never spawns `cursor-agent`
// or opens a Cursor product endpoint directly; all IO flows through the injected
// `VisualAgentUpstreamPort`, which opens the single bridge-owned upstream session
// for the mode declared in the Cursor binding. The adapter selects exactly one
// transport, negotiates capabilities honestly (a CLI that cannot acknowledge a
// cancel never claims it), and normalizes transport-neutral upstream messages into
// frozen task events.
import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import type {
  VisualAgentCapabilitySet,
  VisualAgentConnectionState,
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
import {
  cursorCapabilityMask,
  parseCursorBinding,
  type CursorBindingV1,
} from './CursorBinding';

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

export const cursorManifest: VisualAgentToolManifestV1 = {
  toolId: 'cursor',
  displayName: 'Cursor',
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
    preferences: false,
  },
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

type NormalizedUpstreamEvent =
  | {readonly kind: 'status'; readonly status: 'queued' | 'running'}
  | {readonly kind: 'approval'; readonly approvalId: string}
  | {
      readonly kind: 'delta';
      readonly textDelta?: string;
      readonly visualUnderstandingDelta?: string;
      readonly structuredAction?: VisualAgentStructuredAction;
    }
  | {readonly kind: 'completed'; readonly result: VisualAgentResultV1}
  | {readonly kind: 'failed'; readonly resumeToken?: string}
  | {readonly kind: 'cancelled'; readonly resumeToken?: string}
  | {readonly kind: 'closed'};

function normalizeResult(value: unknown): VisualAgentResultV1 {
  if (isObject(value) && typeof value.summary === 'string' && value.summary.length > 0) {
    return {summary: value.summary};
  }
  return {summary: 'completed'};
}

function normalizeDelta(params: Record<string, unknown>): NormalizedUpstreamEvent {
  const structuredAction =
    isObject(params.structuredAction) && typeof params.structuredAction.name === 'string'
      ? {
          name: params.structuredAction.name,
          arguments: isObject(params.structuredAction.arguments)
            ? (params.structuredAction.arguments as VisualAgentStructuredAction['arguments'])
            : {},
        }
      : undefined;
  return {
    kind: 'delta',
    ...(typeof params.textDelta === 'string' ? {textDelta: params.textDelta} : {}),
    ...(typeof params.visualUnderstandingDelta === 'string'
      ? {visualUnderstandingDelta: params.visualUnderstandingDelta}
      : {}),
    ...(structuredAction ? {structuredAction} : {}),
  };
}

/**
 * Normalizes a single transport-neutral upstream message (delivered by the Bridge
 * over whichever Cursor transport was opened) into a normalized lifecycle event, or
 * `null` when the frame carries no task-relevant signal. Approval / permission
 * requests are surfaced as `waiting_approval`; they are never auto-approved here.
 */
function normalizeUpstreamMessage(raw: unknown): NormalizedUpstreamEvent | null {
  if (!isObject(raw)) {
    return null;
  }
  const tag =
    typeof raw.method === 'string'
      ? raw.method
      : typeof raw.type === 'string'
        ? raw.type
        : null;
  if (!tag) {
    return null;
  }
  const params = isObject(raw.params) ? raw.params : raw;
  switch (tag) {
    case 'status':
    case 'task/status':
      if (params.status === 'queued' || params.status === 'running') {
        return {kind: 'status', status: params.status};
      }
      return null;
    case 'approval':
    case 'approval/request':
    case 'permission/request': {
      const approvalId = asString(params.id) ?? asString(params.approvalId);
      return approvalId ? {kind: 'approval', approvalId} : null;
    }
    case 'delta':
    case 'task/delta':
      return normalizeDelta(params);
    case 'completed':
    case 'task/completed':
      return {kind: 'completed', result: normalizeResult(params.result ?? params)};
    case 'failed':
    case 'task/failed': {
      const resumeToken = asString(params.resumeToken);
      return {kind: 'failed', ...(resumeToken ? {resumeToken} : {})};
    }
    case 'cancelled':
    case 'task/cancelled': {
      const resumeToken = asString(params.resumeToken);
      return {kind: 'cancelled', ...(resumeToken ? {resumeToken} : {})};
    }
    case 'closed':
    case 'session/closed':
      return {kind: 'closed'};
    default:
      return null;
  }
}

class CursorExecutionPort implements VisualAgentExecutionPort {
  private state: VisualAgentConnectionState = {status: 'disconnected'};
  private session: VisualAgentUpstreamSession | null = null;
  private unsubscribeUpstream: (() => void) | null = null;
  private negotiated: VisualAgentCapabilitySet | null = null;
  private readonly listeners = new Set<(event: VisualAgentTaskEvent) => void>();
  private sequence = 0;
  private taskId = '';
  private sessionRevision = 0;
  private terminated = false;

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
    const raw = await this.bindings.read(profile.connector.bindingId, 'cursor');
    const binding = parseCursorBinding(raw);
    const mask = cursorCapabilityMask(binding.protocol);
    const requested = profile.requestedCapabilities;

    for (const key of CAPABILITY_KEYS) {
      if (requested[key] && !mask[key]) {
        this.state = {status: 'failed', errorCode: 'visual_agent_capability_unsupported'};
        throw new CapabilityError('visual_agent_capability_unsupported');
      }
    }

    this.state = {status: 'negotiating'};
    const session = await this.upstream.open({
      protocol: binding.protocol,
      binding: binding as unknown as Readonly<Record<string, unknown>>,
      signal,
    });
    const upstreamNegotiated = await session.negotiate(requested);

    const negotiated: VisualAgentCapabilitySet = CAPABILITY_KEYS.reduce(
      (acc, key) => ({
        ...acc,
        [key]: Boolean(requested[key] && mask[key] && upstreamNegotiated[key]),
      }),
      {} as VisualAgentCapabilitySet,
    );
    for (const key of CAPABILITY_KEYS) {
      if (requested[key] && !negotiated[key]) {
        await session.close();
        this.state = {status: 'failed', errorCode: 'visual_agent_capability_unsupported'};
        throw new CapabilityError('visual_agent_capability_unsupported');
      }
    }

    this.session = session;
    this.negotiated = negotiated;
    this.unsubscribeUpstream = session.subscribe(message => this.handleUpstream(message));
    this.state = {status: 'ready', negotiatedCapabilities: negotiated};
    return negotiated;
  }

  async disconnect(): Promise<void> {
    this.unsubscribeUpstream?.();
    this.unsubscribeUpstream = null;
    const session = this.session;
    this.session = null;
    this.state = {status: 'disconnected'};
    await session?.close();
  }

  async execute(
    envelope: VisualAgentTaskEnvelopeV1,
    _signal: AbortSignal,
  ): Promise<{taskId: string}> {
    const session = this.requireReady();
    if (envelope.image && !this.negotiated?.imageInput) {
      throw new CapabilityError('visual_agent_capability_unsupported');
    }
    this.taskId = envelope.taskId;
    this.sessionRevision = envelope.sessionRevision;
    this.terminated = false;
    await session.send({method: 'task/start', params: {envelope}});
    return {taskId: envelope.taskId};
  }

  async cancel(
    input: {taskId: string; sessionRevision: number},
    _signal: AbortSignal,
  ): Promise<void> {
    const session = this.requireCapability('cancel');
    await session.send({method: 'task/cancel', params: input});
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
    const session = this.requireCapability('approval');
    await session.send({method: 'approval/resolve', params: input});
  }

  async resume(
    input: {taskId: string; sessionRevision: number; resumeToken: string},
    _signal: AbortSignal,
  ): Promise<void> {
    if (!this.negotiated?.resume) {
      throw new CapabilityError('visual_agent_resume_unsupported');
    }
    const session = this.requireReady();
    await session.send({method: 'task/resume', params: input});
  }

  async steer(
    input: {taskId: string; sessionRevision: number; instruction: string},
    _signal: AbortSignal,
  ): Promise<void> {
    const session = this.requireCapability('steer');
    await session.send({method: 'task/steer', params: input});
  }

  async requestPreferences(
    command: VisualAgentPreferenceCommand,
    _signal: AbortSignal,
  ): Promise<unknown> {
    const session = this.requireCapability('preferences');
    await session.send({method: 'preference/request', params: {command}});
    return {type: 'list', preferences: []};
  }

  subscribe(listener: (event: VisualAgentTaskEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private requireReady(): VisualAgentUpstreamSession {
    if (this.state.status !== 'ready' || !this.session) {
      throw new CapabilityError('visual_agent_not_ready');
    }
    return this.session;
  }

  private requireCapability(
    key: keyof VisualAgentCapabilitySet,
  ): VisualAgentUpstreamSession {
    const session = this.requireReady();
    if (!this.negotiated?.[key]) {
      throw new CapabilityError('visual_agent_capability_unsupported');
    }
    return session;
  }

  private emit(event: VisualAgentTaskEvent): void {
    this.listeners.forEach(listener => listener(event));
  }

  private handleUpstream(message: unknown): void {
    if (!this.taskId) {
      return;
    }
    const normalized = normalizeUpstreamMessage(message);
    if (!normalized) {
      return;
    }
    if (this.terminated) {
      return;
    }
    const base = {
      taskId: this.taskId,
      sessionRevision: this.sessionRevision,
      sequence: this.sequence++,
    } as const;
    switch (normalized.kind) {
      case 'status':
        this.emit({type: 'status', ...base, status: normalized.status});
        return;
      case 'approval':
        this.emit({
          type: 'status',
          ...base,
          status: 'waiting_approval',
          approvalId: normalized.approvalId,
        });
        return;
      case 'delta':
        this.emit({
          type: 'delta',
          ...base,
          ...(normalized.textDelta !== undefined ? {textDelta: normalized.textDelta} : {}),
          ...(normalized.visualUnderstandingDelta !== undefined
            ? {visualUnderstandingDelta: normalized.visualUnderstandingDelta}
            : {}),
          ...(normalized.structuredAction ? {structuredAction: normalized.structuredAction} : {}),
        });
        return;
      case 'completed':
        this.terminated = true;
        this.emit({type: 'terminal', ...base, status: 'completed', result: normalized.result});
        return;
      case 'failed':
        this.terminated = true;
        this.emit({
          type: 'terminal',
          ...base,
          status: 'failed',
          errorCode: 'visual_agent_execution_failed',
          ...(normalized.resumeToken ? {resumeToken: normalized.resumeToken} : {}),
        });
        return;
      case 'cancelled':
        this.terminated = true;
        this.emit({
          type: 'terminal',
          ...base,
          status: 'cancelled',
          ...(normalized.resumeToken ? {resumeToken: normalized.resumeToken} : {}),
        });
        return;
      case 'closed':
        this.terminated = true;
        this.emit({
          type: 'terminal',
          ...base,
          status: 'failed',
          errorCode: 'visual_agent_disconnected',
        });
        return;
    }
  }
}

export class CursorAdapter implements VisualAgentToolAdapter {
  readonly toolId = 'cursor' as const;
  readonly manifest = cursorManifest;

  constructor(
    private readonly bindings: VisualAgentBindingPort,
    private readonly upstream: VisualAgentUpstreamPort,
  ) {}

  create(_profile: VisualAgentProfileV1): VisualAgentExecutionPort {
    return new CursorExecutionPort(this.bindings, this.upstream);
  }
}

export type {CursorBindingV1};
