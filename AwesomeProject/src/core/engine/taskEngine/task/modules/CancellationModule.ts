/**
 * 取消检查模块
 *
 * Cancellation is now scoped to an exact `{taskId, sessionRevision}` session and
 * is driven through the shared runner / session lease. The legacy global
 * `DeviceEventEmitter` listener (which accepted absent or wildcard ids) has been
 * removed; this module is a plain, session-scoped flag holder.
 */

export class CancellationModule {
  private shouldCancel = false;
  private taskId: string | null = null;

  initialize(taskId: string): void {
    this.taskId = taskId;
    this.shouldCancel = false;
  }

  shouldCancelTask(): boolean {
    return this.shouldCancel;
  }

  setCancel(shouldCancel: boolean): void {
    this.shouldCancel = shouldCancel;
  }

  cleanup(): void {
    this.taskId = null;
    this.shouldCancel = false;
  }
}
