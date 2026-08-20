// Frozen V1 Visual Agent contracts (runtime-foundation Task 4B `Produces`).
// Envelope field is always `visualAgent`; legacy OpenClaw exists only as `toolId: 'openclaw'`.
// Pure types plus the two named validators; no adapters, transports, or native access.

export type VisualAgentErrorCode =
  | 'visual_agent_invalid_profile'
  | 'visual_agent_adapter_not_found'
  | 'visual_agent_adapter_duplicate'
  | 'visual_agent_capability_unsupported'
  | 'visual_agent_not_ready'
  | 'visual_agent_auth_failed'
  | 'visual_agent_protocol_error'
  | 'visual_agent_disconnected'
  | 'visual_agent_execution_failed'
  | 'visual_agent_cancel_timeout'
  | 'visual_agent_approval_required'
  | 'visual_agent_resume_unsupported';

export type VisualAgentToolId =
  | 'openclaw'
  | 'codex'
  | 'cursor'
  | 'dsh'
  | 'hermes'
  | `custom:${string}`;

export interface VisualAgentCapabilitySet {
  readonly imageInput: boolean;
  readonly structuredAction: boolean;
  readonly stream: boolean;
  readonly cancel: boolean;
  readonly approval: boolean;
  readonly resume: boolean;
  readonly steer: boolean;
  readonly preferences: boolean;
}

export interface VisualAgentToolManifestV1 {
  readonly toolId: VisualAgentToolId;
  readonly displayName: string;
  readonly maturity: 'stable' | 'beta' | 'experimental';
  readonly adapterVersion: string;
  readonly protocolVersions: readonly [1];
  readonly declaredCapabilities: VisualAgentCapabilitySet;
}

export interface VisualAgentProfileV1 {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly toolId: VisualAgentToolId;
  readonly enabled: boolean;
  readonly connector: {
    readonly kind: 'connector_bridge';
    readonly bridgeUrl: string;
    readonly bindingId: string;
    readonly secretRef: string | null;
  };
  readonly requestedCapabilities: VisualAgentCapabilitySet;
}

export type VisualAgentRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type VisualAgentConnectionState =
  | {readonly status: 'disabled'}
  | {readonly status: 'disconnected'}
  | {readonly status: 'connecting'}
  | {readonly status: 'authenticating'}
  | {readonly status: 'negotiating'}
  | {
      readonly status: 'ready';
      readonly negotiatedCapabilities: VisualAgentCapabilitySet;
    }
  | {readonly status: 'failed'; readonly errorCode: VisualAgentErrorCode};

export interface VisualAgentTaskEnvelopeV1 {
  readonly protocolVersion: 1;
  readonly taskId: string;
  readonly sessionRevision: number;
  readonly profileId: string;
  readonly instruction: string;
  readonly idempotencyKey: string;
  readonly requiredCapabilities: VisualAgentCapabilitySet;
  readonly image?: {
    readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    readonly base64: string;
    readonly sharingConfirmed: true;
  };
}

export type VisualAgentJson =
  | null
  | boolean
  | number
  | string
  | readonly VisualAgentJson[]
  | {readonly [key: string]: VisualAgentJson};

export interface VisualAgentStructuredAction {
  readonly name: string;
  readonly arguments: Readonly<Record<string, VisualAgentJson>>;
}

export interface VisualAgentResultV1 {
  readonly summary: string;
  readonly visualUnderstanding?: {
    readonly description: string;
    readonly observations: readonly string[];
  };
  readonly structuredActions?: readonly VisualAgentStructuredAction[];
}

export type VisualAgentPreferenceCommand =
  | {readonly type: 'list'}
  | {
      readonly type: 'upsert';
      readonly preference: {
        readonly id: string;
        readonly kind: 'name' | 'preference';
        readonly title: string;
        readonly summary: string;
      };
    }
  | {readonly type: 'delete'; readonly preferenceId: string}
  | {readonly type: 'clear'};

export interface VisualAgentPreferenceRecord {
  readonly id: string;
  readonly kind: 'name' | 'preference';
  readonly title: string;
  readonly summary: string;
  readonly createdAtEpochMs: number;
  readonly updatedAtEpochMs: number;
}

export type VisualAgentPreferenceResult =
  | {
      readonly type: 'list';
      readonly preferences: readonly VisualAgentPreferenceRecord[];
    }
  | {readonly type: 'upsert'; readonly preference: VisualAgentPreferenceRecord}
  | {readonly type: 'delete'; readonly preferenceId: string}
  | {readonly type: 'clear'};

export type VisualAgentTaskEvent =
  | {
      readonly type: 'status';
      readonly taskId: string;
      readonly sessionRevision: number;
      readonly sequence: number;
      readonly status: 'queued' | 'running';
    }
  | {
      readonly type: 'status';
      readonly taskId: string;
      readonly sessionRevision: number;
      readonly sequence: number;
      readonly status: 'waiting_approval';
      readonly approvalId: string;
    }
  | {
      readonly type: 'delta';
      readonly taskId: string;
      readonly sessionRevision: number;
      readonly sequence: number;
      readonly textDelta?: string;
      readonly visualUnderstandingDelta?: string;
      readonly structuredAction?: VisualAgentStructuredAction;
    }
  | {
      readonly type: 'terminal';
      readonly taskId: string;
      readonly sessionRevision: number;
      readonly sequence: number;
      readonly status: 'completed';
      readonly result: VisualAgentResultV1;
    }
  | {
      readonly type: 'terminal';
      readonly taskId: string;
      readonly sessionRevision: number;
      readonly sequence: number;
      readonly status: 'failed';
      readonly errorCode: VisualAgentErrorCode;
      readonly resumeToken?: string;
    }
  | {
      readonly type: 'terminal';
      readonly taskId: string;
      readonly sessionRevision: number;
      readonly sequence: number;
      readonly status: 'cancelled';
      readonly resumeToken?: string;
    };

export type VisualAgentProtocolV1 =
  | {readonly version: 1; readonly type: 'session.open'; readonly requestId: string; readonly profileId: string; readonly toolId: VisualAgentToolId; readonly requestedCapabilities: VisualAgentCapabilitySet}
  | {readonly version: 1; readonly type: 'task.start'; readonly requestId: string; readonly envelope: VisualAgentTaskEnvelopeV1}
  | {readonly version: 1; readonly type: 'task.cancel'; readonly requestId: string; readonly taskId: string; readonly sessionRevision: number}
  | {readonly version: 1; readonly type: 'task.approval.resolve'; readonly requestId: string; readonly taskId: string; readonly sessionRevision: number; readonly approvalId: string; readonly decision: 'approve' | 'reject'}
  | {readonly version: 1; readonly type: 'task.resume'; readonly requestId: string; readonly taskId: string; readonly sessionRevision: number; readonly resumeToken: string}
  | {readonly version: 1; readonly type: 'task.steer'; readonly requestId: string; readonly taskId: string; readonly sessionRevision: number; readonly instruction: string}
  | {readonly version: 1; readonly type: 'preference.request'; readonly requestId: string; readonly command: VisualAgentPreferenceCommand}
  | {readonly version: 1; readonly type: 'session.ready'; readonly requestId: string; readonly negotiatedCapabilities: VisualAgentCapabilitySet}
  | {readonly version: 1; readonly type: 'session.failed'; readonly requestId: string; readonly errorCode: VisualAgentErrorCode}
  | {readonly version: 1; readonly type: 'task.status'; readonly requestId: string; readonly event: Extract<VisualAgentTaskEvent, {readonly type: 'status'}>}
  | {readonly version: 1; readonly type: 'task.event'; readonly requestId: string; readonly event: Extract<VisualAgentTaskEvent, {readonly type: 'delta'}>}
  | {readonly version: 1; readonly type: 'task.completed'; readonly requestId: string; readonly event: Extract<VisualAgentTaskEvent, {readonly type: 'terminal'; readonly status: 'completed'}>}
  | {readonly version: 1; readonly type: 'task.failed'; readonly requestId: string; readonly event: Extract<VisualAgentTaskEvent, {readonly type: 'terminal'; readonly status: 'failed'}>}
  | {readonly version: 1; readonly type: 'task.cancelled'; readonly requestId: string; readonly event: Extract<VisualAgentTaskEvent, {readonly type: 'terminal'; readonly status: 'cancelled'}>}
  | {readonly version: 1; readonly type: 'preference.result'; readonly requestId: string; readonly result: VisualAgentPreferenceResult}
  | {readonly version: 1; readonly type: 'protocol.error'; readonly requestId: string; readonly errorCode: 'visual_agent_protocol_error'};

export interface VisualAgentExecutionPort {
  getConnectionState(): VisualAgentConnectionState;
  connect(
    profile: VisualAgentProfileV1,
    signal: AbortSignal,
  ): Promise<VisualAgentCapabilitySet>;
  disconnect(): Promise<void>;
  execute(
    envelope: VisualAgentTaskEnvelopeV1,
    signal: AbortSignal,
  ): Promise<{taskId: string}>;
  cancel(
    input: {taskId: string; sessionRevision: number},
    signal: AbortSignal,
  ): Promise<void>;
  resolveApproval(
    input: {
      taskId: string;
      sessionRevision: number;
      approvalId: string;
      decision: 'approve' | 'reject';
    },
    signal: AbortSignal,
  ): Promise<void>;
  resume(
    input: {taskId: string; sessionRevision: number; resumeToken: string},
    signal: AbortSignal,
  ): Promise<void>;
  steer(
    input: {taskId: string; sessionRevision: number; instruction: string},
    signal: AbortSignal,
  ): Promise<void>;
  requestPreferences(
    command: VisualAgentPreferenceCommand,
    signal: AbortSignal,
  ): Promise<unknown>;
  subscribe(listener: (event: VisualAgentTaskEvent) => void): () => void;
}

export interface VisualAgentToolAdapter {
  readonly toolId: VisualAgentToolId;
  readonly manifest: VisualAgentToolManifestV1;
  create(profile: VisualAgentProfileV1): VisualAgentExecutionPort;
}

export interface VisualAgentToolRegistry {
  require(toolId: VisualAgentToolId): VisualAgentToolAdapter;
  list(): readonly VisualAgentToolId[];
}

const VISUAL_AGENT_CAPABILITY_KEYS = [
  'imageInput',
  'structuredAction',
  'stream',
  'cancel',
  'approval',
  'resume',
  'steer',
  'preferences',
] as const;

const BUILT_IN_TOOL_IDS: readonly string[] = [
  'openclaw',
  'codex',
  'cursor',
  'dsh',
  'hermes',
];

const CUSTOM_TOOL_ID_PREFIX = 'custom:';

/** Stable, ref-free validation failure carried on `.code`. */
export class VisualAgentContractError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'VisualAgentContractError';
    this.code = code;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isVisualAgentToolId = (value: unknown): value is VisualAgentToolId => {
  if (typeof value !== 'string') {
    return false;
  }
  if (BUILT_IN_TOOL_IDS.includes(value)) {
    return true;
  }
  return (
    value.startsWith(CUSTOM_TOOL_ID_PREFIX) &&
    value.length > CUSTOM_TOOL_ID_PREFIX.length
  );
};

export function validateVisualAgentCapabilitySet(
  value: unknown,
): VisualAgentCapabilitySet {
  if (!isObject(value)) {
    throw new VisualAgentContractError('visual_agent_invalid_capability_set');
  }
  for (const key of VISUAL_AGENT_CAPABILITY_KEYS) {
    if (typeof value[key] !== 'boolean') {
      throw new VisualAgentContractError('visual_agent_invalid_capability_set');
    }
  }
  return value as unknown as VisualAgentCapabilitySet;
}

export function validateVisualAgentProfileV1(
  value: unknown,
): VisualAgentProfileV1 {
  if (!isObject(value)) {
    throw new VisualAgentContractError('visual_agent_invalid_profile');
  }
  if (value.schemaVersion !== 1) {
    throw new VisualAgentContractError('visual_agent_invalid_profile');
  }
  if (typeof value.profileId !== 'string' || value.profileId.length === 0) {
    throw new VisualAgentContractError('visual_agent_invalid_profile');
  }
  if (!isVisualAgentToolId(value.toolId)) {
    throw new VisualAgentContractError('visual_agent_invalid_profile');
  }
  if (typeof value.enabled !== 'boolean') {
    throw new VisualAgentContractError('visual_agent_invalid_profile');
  }
  const connector = value.connector;
  if (
    !isObject(connector) ||
    connector.kind !== 'connector_bridge' ||
    typeof connector.bridgeUrl !== 'string' ||
    typeof connector.bindingId !== 'string' ||
    !(connector.secretRef === null || typeof connector.secretRef === 'string')
  ) {
    throw new VisualAgentContractError('visual_agent_invalid_profile');
  }
  validateVisualAgentCapabilitySet(value.requestedCapabilities);
  return value as unknown as VisualAgentProfileV1;
}
