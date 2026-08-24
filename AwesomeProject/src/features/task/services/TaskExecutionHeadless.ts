// Headless background entry point for the task-scoped V1 channel.
//
// This entry point accepts ONLY the minimal `{taskId, sessionRevision}` payload.
// It performs no screen capture, no model inference, no action loop, and no
// model deserialization. The persisted task text is loaded by the runner via
// `TaskInstructionPort.load(taskId)` — never by this file, and never carried in
// the payload. The live `OperateRuntime` + `OperateTaskRunner` composition is
// wired by UI Task 8 through `setHeadlessOperateEntry`; until then this stays
// loud-unwired instead of silently faking a run.

import type {HeadlessTaskIdentityV1} from './TaskUiEventNames';

/**
 * Parses the Headless payload into an immutable task identity.
 *
 * The object must have exactly the two keys `sessionRevision` and `taskId`,
 * a positive safe-integer revision, and a non-blank id that is not the banned
 * wildcard placeholder. Any extra/missing key, non-object JSON, malformed JSON,
 * or bad revision throws `invalid_headless_payload`; a blank/wildcard id throws
 * `invalid_task_id`.
 */
export function parseHeadlessTaskIdentity(
  taskDataString: string,
): HeadlessTaskIdentityV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(taskDataString);
  } catch {
    throw new Error('invalid_headless_payload');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid_headless_payload');
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== 'sessionRevision' ||
    keys[1] !== 'taskId'
  ) {
    throw new Error('invalid_headless_payload');
  }
  const {taskId, sessionRevision} = record;
  if (
    typeof sessionRevision !== 'number' ||
    !Number.isSafeInteger(sessionRevision) ||
    sessionRevision <= 0
  ) {
    throw new Error('invalid_headless_payload');
  }
  if (
    typeof taskId !== 'string' ||
    taskId.trim().length === 0 ||
    taskId === 'current'
  ) {
    throw new Error('invalid_task_id');
  }
  return {taskId, sessionRevision};
}

export type HeadlessOperateEntry = (
  identity: HeadlessTaskIdentityV1,
) => Promise<void>;

let headlessOperateEntry: HeadlessOperateEntry | null = null;

/**
 * Wires the live headless entry (claim stored session + drive the shared
 * `OperateTaskRunner`). Called once by the UI Task 8 composition root.
 */
export function setHeadlessOperateEntry(entry: HeadlessOperateEntry): void {
  headlessOperateEntry = entry;
}

/**
 * Headless JS task registered in `index.js`. Validates the identity, then hands
 * off to the wired headless entry. Never captures the screen, infers, or loops.
 */
export async function registerTaskExecutionTask(taskDataObj: {
  taskData?: string;
}): Promise<void> {
  const taskDataString = taskDataObj?.taskData;
  if (typeof taskDataString !== 'string') {
    console.error('[Headless] missing task payload');
    return;
  }

  let identity: HeadlessTaskIdentityV1;
  try {
    identity = parseHeadlessTaskIdentity(taskDataString);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    console.error('[Headless] rejected task payload:', reason);
    return;
  }

  if (!headlessOperateEntry) {
    // Loud-unwired until UI Task 8 composes the live runtime + runner.
    throw new Error('headless_operate_not_wired');
  }

  await headlessOperateEntry(identity);
}
