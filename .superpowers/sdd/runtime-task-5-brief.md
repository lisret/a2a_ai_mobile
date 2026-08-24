### Task 5: Serialize Task History And Expose TaskInstructionPort

**Files:**

- Modify: `AwesomeProject/src/features/task/services/TaskHistoryService.ts`
- Modify: `AwesomeProject/src/core/engine/taskEngine/types/Task.ts`
- Create: `AwesomeProject/src/core/engine/operateRuntime/ports/TaskInstructionPort.ts`
- Modify: `AwesomeProject/src/__tests__/services/TaskHistoryService.test.ts`

**Interfaces:**

- Consumes: one `STORAGE_KEYS.TASKS` array and existing Task history screens.
- Produces:

```ts
export interface TaskInstructionPort {
  load(taskId: string): Promise<string | null>;
}

export interface PersistedTaskV2 extends Task {
  readonly schemaVersion: 2;
  readonly sessionRevision: number;
}
```

`TaskHistoryService` remains compatible with `saveTask`, `getAllTasks`, `getTaskById`, `getTasksByModelId`, `deleteTask`, and `deleteTasksByModelId`; `load(taskId)` returns only the trimmed instruction or `null`.

- [ ] **Step 1: Add concurrency/terminal/privacy RED tests**

```ts
it('does not lose either task across concurrent read-modify-write calls', async () => {
  await Promise.all([service.saveTask(taskA), service.saveTask(taskB)]);
  expect(await service.getAllTasks()).toEqual(
    expect.arrayContaining([taskA, taskB]),
  );
});

it('keeps the queue usable after a failed write', async () => {
  storage.setItem.mockRejectedValueOnce(new Error('write failed'));
  await expect(service.saveTask(taskA)).rejects.toThrow('write failed');
  await expect(service.saveTask(taskB)).resolves.toBeUndefined();
});

it('rejects a terminal task transition back to running', async () => {
  await service.saveTask(successTask);
  await expect(service.saveTask({...successTask, status: 'running'})).rejects
    .toMatchObject({code: 'task_terminal_transition_rejected'});
});
```

Also assert no write to `TASKS_BY_MODEL_PREFIX`, same-id idempotency, deterministic oldest trimming, instruction lookup, and serialized stored JSON without `apiKey`, `secretRef`, `data:image`, screenshot URI or raw provider response fixtures.

Run:

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache src/__tests__/services/TaskHistoryService.test.ts
```

Expected: concurrent save loses one record or writes an inconsistent secondary index; terminal regression is accepted.

- [ ] **Step 2: Port the verified queue pattern, not the donor file wholesale**

Use `e5bdbe1` lines 10–24 as the behavioral source. Every mutating method goes through `enqueueMutation`; reads inside a mutation call `readAllTasksStrict()` and never the forgiving public `getAllTasks()`. Derive `getTasksByModelId` from the primary list and stop writing/removing model index keys.

- [ ] **Step 3: Enforce terminal and safe-step serialization**

Before replacing an existing task, reject `success|failed → idle|waiting|running`. Serialize history steps through a projection that keeps step number, timestamp, safe action description/details and bounded summary, but drops `screenshotUri` and `modelResponse`. Preserve full instruction in the Task repository because the runner loads it by `taskId`; logs and Headless payload still may not carry it.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- --runInBand --no-cache \
  src/__tests__/services/TaskHistoryService.test.ts \
  src/__tests__/hooks/useTaskHistory.test.ts
npx tsc --noEmit
```

Expected: both suites and TypeScript pass; concurrent operations retain both records, failed writes do not poison the queue, terminal regressions reject with the stable code, and model queries use the main list.

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/features/task/services/TaskHistoryService.ts \
  AwesomeProject/src/core/engine/taskEngine/types/Task.ts \
  AwesomeProject/src/core/engine/operateRuntime/ports/TaskInstructionPort.ts \
  AwesomeProject/src/__tests__/services/TaskHistoryService.test.ts
git commit -m "fix: serialize task history and protect terminal state"
```

---

