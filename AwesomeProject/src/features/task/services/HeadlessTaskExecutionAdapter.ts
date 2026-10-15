// Headless operate entry point (runtime-foundation Task 9).
// Accepts ONLY the minimal `{taskId, sessionRevision}` payload, loads the exact
// persisted immutable session, claims it as `headless`, and drives the same
// shared runner as foreground. It never constructs an `AIModel`, calls
// `modelInferenceModule`, reads current RuntimeConfig, or starts a second engine.
import type {OperateTaskOutcome} from '@core/engine/operateRuntime/runner/OperateTaskPorts';
import {
  terminalKindFromOutcome,
  type OperateSessionProvider,
  type OperateTaskRunnerPort,
} from './OperateTaskEntryPorts';

export interface HeadlessTaskExecutionData {
  readonly taskId: string;
  readonly sessionRevision: number;
}

/**
 * Requires exactly the two own keys, a nonblank `taskId`, and a positive safe
 * integer `sessionRevision`. Any extra key, missing key, malformed JSON, blank
 * id, or non-positive/non-integer revision is rejected.
 */
export function parseTaskExecutionData(
  taskDataString: string,
): HeadlessTaskExecutionData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(taskDataString);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== 2 ||
    !('taskId' in record) ||
    !('sessionRevision' in record)
  ) {
    return null;
  }
  const {taskId, sessionRevision} = record;
  if (typeof taskId !== 'string' || taskId.trim().length === 0) {
    return null;
  }
  if (
    typeof sessionRevision !== 'number' ||
    !Number.isSafeInteger(sessionRevision) ||
    sessionRevision <= 0
  ) {
    return null;
  }
  return {taskId, sessionRevision};
}

export function serializeHeadlessTaskData(
  data: HeadlessTaskExecutionData,
): string {
  return JSON.stringify({
    taskId: data.taskId,
    sessionRevision: data.sessionRevision,
  });
}

export type HeadlessTaskExecutionResult =
  | {
      readonly ok: true;
      readonly taskId: string;
      readonly outcome: OperateTaskOutcome;
    }
  | {readonly ok: false; readonly code: string; readonly taskId?: string};

export interface HeadlessTaskExecutionAdapterDeps {
  readonly runtime: OperateSessionProvider;
  readonly runner: OperateTaskRunnerPort;
}

export class HeadlessTaskExecutionAdapter {
  constructor(private readonly deps: HeadlessTaskExecutionAdapterDeps) {}

  async run(taskDataString: string): Promise<HeadlessTaskExecutionResult> {
    const data = parseTaskExecutionData(taskDataString);
    if (!data) {
      return {ok: false, code: 'headless_task_invalid_payload'};
    }

    const claimed = await this.deps.runtime.claim(
      data.taskId,
      data.sessionRevision,
      'headless',
    );
    if (!claimed.ok) {
      return {ok: false, code: claimed.code, taskId: data.taskId};
    }

    try {
      const outcome = await this.deps.runner.run(claimed.lease);
      await claimed.lease.markTerminal(terminalKindFromOutcome(outcome));
      return {ok: true, taskId: data.taskId, outcome};
    } finally {
      await claimed.lease.release();
    }
  }
}
