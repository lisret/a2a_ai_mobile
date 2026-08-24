// The single validated UI event stream for the task-scoped V1 channel.
//
// It listens ONLY to `TASK_UI_EVENT_NAME`, validates every raw value against
// the frozen `TaskUiEvent` union, and drops anything malformed while logging a
// single fixed reason code (never the raw payload). `ScopedTaskUiEvents` layers
// task/session/sequence scoping on top of this source; this file only guards
// the shape and the monotonic integer invariants.

import {DeviceEventEmitter} from 'react-native';
import type {
  TaskUiEvent,
  TaskUiEventSource,
  Unsubscribe,
} from '../../../application/facades/UiRuntimeContracts';
import {TASK_UI_EVENT_NAME} from './TaskUiEventNames';

const DROP_REASON = 'task_ui_event_rejected';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Validates a raw native value into a `TaskUiEvent`, or returns `null` when the
 * value is not a well-formed member of the union. Unknown `type`, empty
 * `taskId`, non-positive `sessionRevision`, or a non-integer/negative
 * `sequence` are all rejected.
 */
export function validateTaskUiEvent(raw: unknown): TaskUiEvent | null {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (
    !isNonEmptyString(record.taskId) ||
    !isPositiveInteger(record.sessionRevision) ||
    !isNonNegativeInteger(record.sequence) ||
    typeof record.occurredAtMs !== 'number'
  ) {
    return null;
  }

  const base = {
    taskId: record.taskId,
    sessionRevision: record.sessionRevision,
    sequence: record.sequence,
    occurredAtMs: record.occurredAtMs,
  };

  switch (record.type) {
    case 'started':
      if (!isNonNegativeInteger(record.maxSteps)) {
        return null;
      }
      return {...base, type: 'started', maxSteps: record.maxSteps};
    case 'step_started':
      if (
        !isNonNegativeInteger(record.step) ||
        !isNonNegativeInteger(record.maxSteps)
      ) {
        return null;
      }
      return {
        ...base,
        type: 'step_started',
        step: record.step,
        maxSteps: record.maxSteps,
      };
    case 'step_completed':
      if (
        !isNonNegativeInteger(record.step) ||
        typeof record.actionLabel !== 'string'
      ) {
        return null;
      }
      return {
        ...base,
        type: 'step_completed',
        step: record.step,
        actionLabel: record.actionLabel,
      };
    case 'completed':
      if (typeof record.summary !== 'string') {
        return null;
      }
      return {...base, type: 'completed', summary: record.summary};
    case 'failed':
      if (
        typeof record.code !== 'string' ||
        typeof record.message !== 'string' ||
        typeof record.isCancelled !== 'boolean'
      ) {
        return null;
      }
      return {
        ...base,
        type: 'failed',
        code: record.code,
        message: record.message,
        isCancelled: record.isCancelled,
      };
    default:
      return null;
  }
}

export class NativeTaskUiEventSource implements TaskUiEventSource {
  subscribe(listener: (event: TaskUiEvent) => void): Unsubscribe {
    const subscription = DeviceEventEmitter.addListener(
      TASK_UI_EVENT_NAME,
      (raw: unknown) => {
        const event = validateTaskUiEvent(raw);
        if (event === null) {
          console.warn(`[NativeTaskUiEventSource] ${DROP_REASON}`);
          return;
        }
        listener(event);
      },
    );
    return () => subscription.remove();
  }
}

export const nativeTaskUiEventSource = new NativeTaskUiEventSource();
