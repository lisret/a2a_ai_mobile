// Strict wire codec for the runtime-owned `VisualAgentProtocolV1` (Wave 2A Task 7).
// Every rejection is the single, ref-free `visual_agent_protocol_error`; the raw
// frame is never echoed back in the thrown error.
import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import type {
  VisualAgentCapabilitySet,
  VisualAgentErrorCode,
  VisualAgentJson,
  VisualAgentPreferenceCommand,
  VisualAgentPreferenceRecord,
  VisualAgentPreferenceResult,
  VisualAgentProtocolV1,
  VisualAgentResultV1,
  VisualAgentStructuredAction,
  VisualAgentTaskEnvelopeV1,
  VisualAgentTaskEvent,
  VisualAgentToolId,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

const MAX_FRAME_BYTES = 1024 * 1024;

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

const BUILT_IN_TOOL_IDS: readonly string[] = ['openclaw', 'codex', 'cursor', 'dsh', 'hermes'];

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

function fail(): never {
  throw new CapabilityError('visual_agent_protocol_error');
}

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

function isVisualAgentToolId(value: unknown): value is VisualAgentToolId {
  if (typeof value !== 'string') {
    return false;
  }
  if (BUILT_IN_TOOL_IDS.includes(value)) {
    return true;
  }
  return value.startsWith('custom:') && value.length > 'custom:'.length;
}

function assertKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set<string>([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail();
    }
  }
  for (const key of required) {
    if (!(key in value)) {
      fail();
    }
  }
}

function validateCapabilitySet(value: unknown): VisualAgentCapabilitySet {
  if (!isObject(value)) {
    fail();
  }
  assertKeys(value, CAPABILITY_KEYS);
  for (const key of CAPABILITY_KEYS) {
    if (typeof value[key] !== 'boolean') {
      fail();
    }
  }
  return value as unknown as VisualAgentCapabilitySet;
}

function validateJson(value: unknown): VisualAgentJson {
  if (value === null) {
    return null;
  }
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(validateJson);
  }
  if (isObject(value)) {
    const out: Record<string, VisualAgentJson> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = validateJson(nested);
    }
    return out;
  }
  return fail();
}

function validateStructuredAction(value: unknown): VisualAgentStructuredAction {
  if (!isObject(value)) {
    fail();
  }
  assertKeys(value, ['name', 'arguments']);
  if (!isNonEmptyString(value.name) || !isObject(value.arguments)) {
    fail();
  }
  const args: Record<string, VisualAgentJson> = {};
  for (const [key, nested] of Object.entries(value.arguments as Record<string, unknown>)) {
    args[key] = validateJson(nested);
  }
  return {name: value.name as string, arguments: args};
}

function validateResult(value: unknown): VisualAgentResultV1 {
  if (!isObject(value)) {
    fail();
  }
  assertKeys(value, ['summary'], ['visualUnderstanding', 'structuredActions']);
  if (!isNonEmptyString(value.summary)) {
    fail();
  }
  const result: {
    summary: string;
    visualUnderstanding?: VisualAgentResultV1['visualUnderstanding'];
    structuredActions?: readonly VisualAgentStructuredAction[];
  } = {summary: value.summary};
  if ('visualUnderstanding' in value) {
    const vu = value.visualUnderstanding;
    if (!isObject(vu)) {
      fail();
    }
    assertKeys(vu, ['description', 'observations']);
    if (typeof vu.description !== 'string') {
      fail();
    }
    if (!Array.isArray(vu.observations) || !vu.observations.every(item => typeof item === 'string')) {
      fail();
    }
    result.visualUnderstanding = {
      description: vu.description,
      observations: [...(vu.observations as string[])],
    };
  }
  if ('structuredActions' in value) {
    if (!Array.isArray(value.structuredActions)) {
      fail();
    }
    result.structuredActions = value.structuredActions.map(validateStructuredAction);
  }
  return result;
}

function validateEnvelope(value: unknown): VisualAgentTaskEnvelopeV1 {
  if (!isObject(value)) {
    fail();
  }
  assertKeys(
    value,
    [
      'protocolVersion',
      'taskId',
      'sessionRevision',
      'profileId',
      'instruction',
      'idempotencyKey',
      'requiredCapabilities',
    ],
    ['image'],
  );
  if (value.protocolVersion !== 1) {
    fail();
  }
  if (!isNonEmptyString(value.taskId) || !isFiniteNumber(value.sessionRevision)) {
    fail();
  }
  if (!isNonEmptyString(value.profileId) || typeof value.instruction !== 'string' || value.instruction.length === 0) {
    fail();
  }
  if (!isNonEmptyString(value.idempotencyKey)) {
    fail();
  }
  const requiredCapabilities = validateCapabilitySet(value.requiredCapabilities);
  const envelope: {
    protocolVersion: 1;
    taskId: string;
    sessionRevision: number;
    profileId: string;
    instruction: string;
    idempotencyKey: string;
    requiredCapabilities: VisualAgentCapabilitySet;
    image?: VisualAgentTaskEnvelopeV1['image'];
  } = {
    protocolVersion: 1,
    taskId: value.taskId as string,
    sessionRevision: value.sessionRevision as number,
    profileId: value.profileId as string,
    instruction: value.instruction as string,
    idempotencyKey: value.idempotencyKey as string,
    requiredCapabilities,
  };
  if ('image' in value) {
    const image = value.image;
    if (!isObject(image)) {
      fail();
    }
    assertKeys(image, ['mimeType', 'base64', 'sharingConfirmed']);
    if (
      image.mimeType !== 'image/jpeg' &&
      image.mimeType !== 'image/png' &&
      image.mimeType !== 'image/webp'
    ) {
      fail();
    }
    if (!isNonEmptyString(image.base64) || image.sharingConfirmed !== true) {
      fail();
    }
    envelope.image = {
      mimeType: image.mimeType,
      base64: image.base64,
      sharingConfirmed: true,
    };
  }
  return envelope;
}

type TaskEventKind = 'status' | 'delta' | 'terminal';

function validateTaskEvent(value: unknown, expected: TaskEventKind): VisualAgentTaskEvent {
  if (!isObject(value) || value.type !== expected) {
    fail();
  }
  const obj = value as Record<string, unknown>;
  if (!isNonEmptyString(obj.taskId) || !isFiniteNumber(obj.sessionRevision) || !isFiniteNumber(obj.sequence)) {
    fail();
  }
  const taskId = obj.taskId as string;
  const sessionRevision = obj.sessionRevision as number;
  const sequence = obj.sequence as number;

  if (expected === 'status') {
    if (obj.status === 'queued' || obj.status === 'running') {
      assertKeys(obj, ['type', 'taskId', 'sessionRevision', 'sequence', 'status']);
      return {type: 'status', taskId, sessionRevision, sequence, status: obj.status};
    }
    if (obj.status === 'waiting_approval') {
      assertKeys(obj, ['type', 'taskId', 'sessionRevision', 'sequence', 'status', 'approvalId']);
      if (!isNonEmptyString(obj.approvalId)) {
        fail();
      }
      return {
        type: 'status',
        taskId,
        sessionRevision,
        sequence,
        status: 'waiting_approval',
        approvalId: obj.approvalId,
      };
    }
    return fail();
  }

  if (expected === 'delta') {
    assertKeys(
      obj,
      ['type', 'taskId', 'sessionRevision', 'sequence'],
      ['textDelta', 'visualUnderstandingDelta', 'structuredAction'],
    );
    if ('textDelta' in obj && typeof obj.textDelta !== 'string') {
      fail();
    }
    if ('visualUnderstandingDelta' in obj && typeof obj.visualUnderstandingDelta !== 'string') {
      fail();
    }
    const structuredAction =
      'structuredAction' in obj ? validateStructuredAction(obj.structuredAction) : undefined;
    return {
      type: 'delta',
      taskId,
      sessionRevision,
      sequence,
      ...('textDelta' in obj ? {textDelta: obj.textDelta as string} : {}),
      ...('visualUnderstandingDelta' in obj
        ? {visualUnderstandingDelta: obj.visualUnderstandingDelta as string}
        : {}),
      ...(structuredAction ? {structuredAction} : {}),
    };
  }

  // terminal
  if (obj.status === 'completed') {
    assertKeys(obj, ['type', 'taskId', 'sessionRevision', 'sequence', 'status', 'result']);
    return {
      type: 'terminal',
      taskId,
      sessionRevision,
      sequence,
      status: 'completed',
      result: validateResult(obj.result),
    };
  }
  if (obj.status === 'failed') {
    assertKeys(
      obj,
      ['type', 'taskId', 'sessionRevision', 'sequence', 'status', 'errorCode'],
      ['resumeToken'],
    );
    if (!isVisualAgentErrorCode(obj.errorCode)) {
      fail();
    }
    if ('resumeToken' in obj && !isNonEmptyString(obj.resumeToken)) {
      fail();
    }
    return {
      type: 'terminal',
      taskId,
      sessionRevision,
      sequence,
      status: 'failed',
      errorCode: obj.errorCode,
      ...('resumeToken' in obj ? {resumeToken: obj.resumeToken as string} : {}),
    };
  }
  if (obj.status === 'cancelled') {
    assertKeys(obj, ['type', 'taskId', 'sessionRevision', 'sequence', 'status'], ['resumeToken']);
    if ('resumeToken' in obj && !isNonEmptyString(obj.resumeToken)) {
      fail();
    }
    return {
      type: 'terminal',
      taskId,
      sessionRevision,
      sequence,
      status: 'cancelled',
      ...('resumeToken' in obj ? {resumeToken: obj.resumeToken as string} : {}),
    };
  }
  return fail();
}

function validatePreferenceCommand(value: unknown): VisualAgentPreferenceCommand {
  if (!isObject(value)) {
    fail();
  }
  if (value.type === 'list' || value.type === 'clear') {
    assertKeys(value, ['type']);
    return {type: value.type};
  }
  if (value.type === 'upsert') {
    assertKeys(value, ['type', 'preference']);
    const preference = value.preference;
    if (!isObject(preference)) {
      fail();
    }
    assertKeys(preference, ['id', 'kind', 'title', 'summary']);
    if (!isNonEmptyString(preference.id)) {
      fail();
    }
    if (preference.kind !== 'name' && preference.kind !== 'preference') {
      fail();
    }
    if (typeof preference.title !== 'string' || typeof preference.summary !== 'string') {
      fail();
    }
    return {
      type: 'upsert',
      preference: {
        id: preference.id,
        kind: preference.kind,
        title: preference.title,
        summary: preference.summary,
      },
    };
  }
  if (value.type === 'delete') {
    assertKeys(value, ['type', 'preferenceId']);
    if (!isNonEmptyString(value.preferenceId)) {
      fail();
    }
    return {type: 'delete', preferenceId: value.preferenceId};
  }
  return fail();
}

function validatePreferenceRecord(value: unknown): VisualAgentPreferenceRecord {
  if (!isObject(value)) {
    fail();
  }
  assertKeys(value, ['id', 'kind', 'title', 'summary', 'createdAtEpochMs', 'updatedAtEpochMs']);
  if (!isNonEmptyString(value.id)) {
    fail();
  }
  if (value.kind !== 'name' && value.kind !== 'preference') {
    fail();
  }
  if (typeof value.title !== 'string' || typeof value.summary !== 'string') {
    fail();
  }
  if (!isFiniteNumber(value.createdAtEpochMs) || !isFiniteNumber(value.updatedAtEpochMs)) {
    fail();
  }
  return {
    id: value.id,
    kind: value.kind,
    title: value.title,
    summary: value.summary,
    createdAtEpochMs: value.createdAtEpochMs,
    updatedAtEpochMs: value.updatedAtEpochMs,
  };
}

function validatePreferenceResult(value: unknown): VisualAgentPreferenceResult {
  if (!isObject(value)) {
    fail();
  }
  if (value.type === 'list') {
    assertKeys(value, ['type', 'preferences']);
    if (!Array.isArray(value.preferences)) {
      fail();
    }
    return {type: 'list', preferences: value.preferences.map(validatePreferenceRecord)};
  }
  if (value.type === 'upsert') {
    assertKeys(value, ['type', 'preference']);
    return {type: 'upsert', preference: validatePreferenceRecord(value.preference)};
  }
  if (value.type === 'delete') {
    assertKeys(value, ['type', 'preferenceId']);
    if (!isNonEmptyString(value.preferenceId)) {
      fail();
    }
    return {type: 'delete', preferenceId: value.preferenceId};
  }
  if (value.type === 'clear') {
    assertKeys(value, ['type']);
    return {type: 'clear'};
  }
  return fail();
}

function byteLength(raw: string): number {
  return Buffer.byteLength(raw, 'utf8');
}

export function decodeVisualAgentMessage(raw: string): VisualAgentProtocolV1 {
  if (typeof raw !== 'string' || byteLength(raw) > MAX_FRAME_BYTES) {
    fail();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail();
  }
  if (!isObject(parsed) || parsed.version !== 1 || !isNonEmptyString(parsed.requestId)) {
    fail();
  }
  const requestId = parsed.requestId as string;

  switch (parsed.type) {
    case 'session.open': {
      assertKeys(parsed, ['version', 'type', 'requestId', 'profileId', 'toolId', 'requestedCapabilities']);
      if (!isNonEmptyString(parsed.profileId) || !isVisualAgentToolId(parsed.toolId)) {
        fail();
      }
      return {
        version: 1,
        type: 'session.open',
        requestId,
        profileId: parsed.profileId as string,
        toolId: parsed.toolId as VisualAgentToolId,
        requestedCapabilities: validateCapabilitySet(parsed.requestedCapabilities),
      };
    }
    case 'task.start': {
      assertKeys(parsed, ['version', 'type', 'requestId', 'envelope']);
      return {version: 1, type: 'task.start', requestId, envelope: validateEnvelope(parsed.envelope)};
    }
    case 'task.cancel': {
      assertKeys(parsed, ['version', 'type', 'requestId', 'taskId', 'sessionRevision']);
      if (!isNonEmptyString(parsed.taskId) || !isFiniteNumber(parsed.sessionRevision)) {
        fail();
      }
      return {
        version: 1,
        type: 'task.cancel',
        requestId,
        taskId: parsed.taskId as string,
        sessionRevision: parsed.sessionRevision as number,
      };
    }
    case 'task.approval.resolve': {
      assertKeys(parsed, [
        'version',
        'type',
        'requestId',
        'taskId',
        'sessionRevision',
        'approvalId',
        'decision',
      ]);
      if (
        !isNonEmptyString(parsed.taskId) ||
        !isFiniteNumber(parsed.sessionRevision) ||
        !isNonEmptyString(parsed.approvalId) ||
        (parsed.decision !== 'approve' && parsed.decision !== 'reject')
      ) {
        fail();
      }
      return {
        version: 1,
        type: 'task.approval.resolve',
        requestId,
        taskId: parsed.taskId as string,
        sessionRevision: parsed.sessionRevision as number,
        approvalId: parsed.approvalId as string,
        decision: parsed.decision as 'approve' | 'reject',
      };
    }
    case 'task.resume': {
      assertKeys(parsed, ['version', 'type', 'requestId', 'taskId', 'sessionRevision', 'resumeToken']);
      if (
        !isNonEmptyString(parsed.taskId) ||
        !isFiniteNumber(parsed.sessionRevision) ||
        !isNonEmptyString(parsed.resumeToken)
      ) {
        fail();
      }
      return {
        version: 1,
        type: 'task.resume',
        requestId,
        taskId: parsed.taskId as string,
        sessionRevision: parsed.sessionRevision as number,
        resumeToken: parsed.resumeToken as string,
      };
    }
    case 'task.steer': {
      assertKeys(parsed, ['version', 'type', 'requestId', 'taskId', 'sessionRevision', 'instruction']);
      if (
        !isNonEmptyString(parsed.taskId) ||
        !isFiniteNumber(parsed.sessionRevision) ||
        typeof parsed.instruction !== 'string' ||
        parsed.instruction.length === 0
      ) {
        fail();
      }
      return {
        version: 1,
        type: 'task.steer',
        requestId,
        taskId: parsed.taskId as string,
        sessionRevision: parsed.sessionRevision as number,
        instruction: parsed.instruction as string,
      };
    }
    case 'preference.request': {
      assertKeys(parsed, ['version', 'type', 'requestId', 'command']);
      return {
        version: 1,
        type: 'preference.request',
        requestId,
        command: validatePreferenceCommand(parsed.command),
      };
    }
    case 'session.ready': {
      assertKeys(parsed, ['version', 'type', 'requestId', 'negotiatedCapabilities']);
      return {
        version: 1,
        type: 'session.ready',
        requestId,
        negotiatedCapabilities: validateCapabilitySet(parsed.negotiatedCapabilities),
      };
    }
    case 'session.failed': {
      assertKeys(parsed, ['version', 'type', 'requestId', 'errorCode']);
      if (!isVisualAgentErrorCode(parsed.errorCode)) {
        fail();
      }
      return {version: 1, type: 'session.failed', requestId, errorCode: parsed.errorCode as VisualAgentErrorCode};
    }
    case 'task.status': {
      assertKeys(parsed, ['version', 'type', 'requestId', 'event']);
      const event = validateTaskEvent(parsed.event, 'status');
      return {
        version: 1,
        type: 'task.status',
        requestId,
        event: event as Extract<VisualAgentTaskEvent, {type: 'status'}>,
      };
    }
    case 'task.event': {
      assertKeys(parsed, ['version', 'type', 'requestId', 'event']);
      const event = validateTaskEvent(parsed.event, 'delta');
      return {
        version: 1,
        type: 'task.event',
        requestId,
        event: event as Extract<VisualAgentTaskEvent, {type: 'delta'}>,
      };
    }
    case 'task.completed': {
      assertKeys(parsed, ['version', 'type', 'requestId', 'event']);
      const event = validateTaskEvent(parsed.event, 'terminal');
      if (event.type !== 'terminal' || event.status !== 'completed') {
        fail();
      }
      return {version: 1, type: 'task.completed', requestId, event};
    }
    case 'task.failed': {
      assertKeys(parsed, ['version', 'type', 'requestId', 'event']);
      const event = validateTaskEvent(parsed.event, 'terminal');
      if (event.type !== 'terminal' || event.status !== 'failed') {
        fail();
      }
      return {version: 1, type: 'task.failed', requestId, event};
    }
    case 'task.cancelled': {
      assertKeys(parsed, ['version', 'type', 'requestId', 'event']);
      const event = validateTaskEvent(parsed.event, 'terminal');
      if (event.type !== 'terminal' || event.status !== 'cancelled') {
        fail();
      }
      return {version: 1, type: 'task.cancelled', requestId, event};
    }
    case 'preference.result': {
      assertKeys(parsed, ['version', 'type', 'requestId', 'result']);
      return {
        version: 1,
        type: 'preference.result',
        requestId,
        result: validatePreferenceResult(parsed.result),
      };
    }
    case 'protocol.error': {
      assertKeys(parsed, ['version', 'type', 'requestId', 'errorCode']);
      if (parsed.errorCode !== 'visual_agent_protocol_error') {
        fail();
      }
      return {version: 1, type: 'protocol.error', requestId, errorCode: 'visual_agent_protocol_error'};
    }
    default:
      return fail();
  }
}

export function encodeVisualAgentMessage(message: VisualAgentProtocolV1): string {
  const raw = JSON.stringify(message);
  if (byteLength(raw) > MAX_FRAME_BYTES) {
    fail();
  }
  return raw;
}

export interface VisualAgentProtocolTaskTracker {
  accept(event: VisualAgentTaskEvent): void;
  acceptSteer(input: {taskId: string; sessionRevision: number}): void;
}

/**
 * Stateful per-task/session correlation: enforces strictly increasing event
 * sequence, a single terminal state, and rejects steer requests that do not
 * match the running task's `taskId + sessionRevision`.
 */
export function createVisualAgentProtocolTaskTracker(input: {
  taskId: string;
  sessionRevision: number;
}): VisualAgentProtocolTaskTracker {
  let lastSequence = -1;
  let terminal = false;

  const assertCorrelated = (taskId: string, sessionRevision: number): void => {
    if (taskId !== input.taskId || sessionRevision !== input.sessionRevision) {
      fail();
    }
  };

  return {
    accept(event) {
      assertCorrelated(event.taskId, event.sessionRevision);
      if (terminal || event.sequence <= lastSequence) {
        fail();
      }
      lastSequence = event.sequence;
      if (event.type === 'terminal') {
        terminal = true;
      }
    },
    acceptSteer(steerInput) {
      assertCorrelated(steerInput.taskId, steerInput.sessionRevision);
      if (terminal) {
        fail();
      }
    },
  };
}
