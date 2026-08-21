// Foreground operate entry point (runtime-foundation Task 8).
// Creates/persists the initial task, asks `OperateRuntime` for one immutable
// session, claims it as `foreground`, drives the shared runner, marks the
// session terminal from the runner outcome, and releases in `finally`.
// It owns no provider, screenshot loop, history schema, or background service.
import type {OperateTaskOutcome} from '@core/engine/operateRuntime/runner/OperateTaskPorts';
import {
  terminalKindFromOutcome,
  type OperateSessionProvider,
  type OperateTaskRunnerPort,
} from './OperateTaskEntryPorts';

export interface ForegroundInitialTaskWriter {
  saveInitialTask(taskId: string, instruction: string): Promise<void>;
}

export interface ForegroundTaskExecutionResult {
  readonly taskId: string;
  readonly outcome: OperateTaskOutcome | null;
  readonly blockedCode?: string;
}

export interface ForegroundTaskExecutionAdapterDeps {
  readonly runtime: OperateSessionProvider;
  readonly runner: OperateTaskRunnerPort;
  readonly initialWriter: ForegroundInitialTaskWriter;
  readonly newTaskId?: () => string;
}

function defaultTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export class ForegroundTaskExecutionAdapter {
  constructor(private readonly deps: ForegroundTaskExecutionAdapterDeps) {}

  async execute(instruction: string): Promise<ForegroundTaskExecutionResult> {
    const taskId = (this.deps.newTaskId ?? defaultTaskId)();
    // The only place foreground handles raw instruction: persisted, never in the session.
    await this.deps.initialWriter.saveInitialTask(taskId, instruction.trim());

    const created = await this.deps.runtime.createSession({taskId});
    if (!created.ok) {
      return {taskId, outcome: null, blockedCode: created.code};
    }

    const claimed = await this.deps.runtime.claim(
      taskId,
      created.session.sessionRevision,
      'foreground',
    );
    if (!claimed.ok) {
      return {taskId, outcome: null, blockedCode: claimed.code};
    }

    try {
      const outcome = await this.deps.runner.run(claimed.lease);
      await claimed.lease.markTerminal(terminalKindFromOutcome(outcome));
      return {taskId, outcome};
    } finally {
      await claimed.lease.release();
    }
  }

  cancel(lease: {cancel(reason?: string): boolean}, reason?: string): boolean {
    return lease.cancel(reason);
  }
}
