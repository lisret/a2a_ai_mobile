// Frozen V1 task-event identity (runtime-foundation Task 7 `OperateTaskEventBase`).
// Every task execution event carries the same immutable identity: taskId, sessionRevision, sequence.
export interface OperateTaskEventBase {
  readonly taskId: string;
  readonly sessionRevision: number;
  readonly sequence: number;
}

/**
 * The frozen task event identity every runner/facade event must extend. The `type`
 * discriminant is provided by concrete event unions in later waves; the three identity
 * fields are non-negotiable and may not be redefined or widened downstream.
 */
export interface TaskExecutionEvent extends OperateTaskEventBase {
  readonly type: string;
}
