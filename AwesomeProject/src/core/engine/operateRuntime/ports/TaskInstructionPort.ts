/**
 * Runtime-facing port for loading a persisted task's instruction text by id.
 * `TaskHistoryService` implements this port; callers receive only the trimmed
 * instruction string (or `null`), never the full `Task` record.
 */
export interface TaskInstructionPort {
  load(taskId: string): Promise<string | null>;
}
