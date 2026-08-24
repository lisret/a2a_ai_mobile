### Task 7: Replace Global Task Events with a Task-Scoped V1 Channel

**Mode:** Wave 2；集成 Agent 串行；JS 与 Android/iOS native signature 必须在同一 commit 原子交付。

**Files:**

- Create: `AwesomeProject/src/features/task/services/TaskUiEventNames.ts`
- Create: `AwesomeProject/src/features/task/services/NativeTaskUiEventSource.ts`
- Modify: `AwesomeProject/src/features/task/hooks/useTaskExecution.ts`
- Modify: `AwesomeProject/src/features/task/useTaskExecutionWithBackground.ts`
- Modify: `AwesomeProject/src/features/task/services/TaskExecutionHeadless.ts`
- Modify: `AwesomeProject/src/core/engine/taskEngine/task/TaskExecutionEngine.ts`
- Modify: `AwesomeProject/src/core/engine/taskEngine/task/modules/TaskStateModule.ts`
- Modify: `AwesomeProject/src/core/engine/taskEngine/task/modules/CancellationModule.ts`
- Modify: `AwesomeProject/src/features/task/screens/TaskHistoryScreen.tsx`
- Modify: `AwesomeProject/src/core/ability/accessibility/AccessibilityService.ts`
- Modify: `AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityModule.kt`
- Modify: `AwesomeProject/android/app/src/main/java/com/awesomeproject/utils/ServiceManager.kt`
- Modify: `AwesomeProject/android/app/src/main/java/com/awesomeproject/service/TaskExecutionService.kt`
- Modify: `AwesomeProject/android/app/src/main/java/com/awesomeproject/service/TaskExecutionHeadlessService.kt`
- Modify: `AwesomeProject/ios/AwesomeProject/AutoGLMAccessibilityModule.m`
- Test: `AwesomeProject/src/__tests__/features/task/TaskUiEvents.test.ts`
- Test: `AwesomeProject/src/__tests__/features/task/TaskExecutionHeadlessSession.test.ts`
- Test: `AwesomeProject/src/__tests__/features/task/TaskNativeContract.test.ts`

**Interfaces:**

- Consumes: Task 1 `TaskUiEvent`、Task 2 `ScopedTaskUiEvents`、runtime `TaskEventPort`、`OperateTaskRunner`。
- Produces:

```ts
export const TASK_UI_EVENT_NAME = 'NonoTaskEventV1';
export const TASK_CANCEL_REQUEST_EVENT_NAME = 'NonoTaskCancelRequestedV1';

export interface HeadlessTaskIdentityV1 {
  taskId: string;
  sessionRevision: number;
}

export interface TaskCancelRequestV1 {
  taskId: string;
  sessionRevision: number;
}
```

- [ ] **Step 1: Write RED event/payload/native contract tests**

```ts
import fs from 'node:fs';
import path from 'node:path';
import {parseHeadlessTaskIdentity} from '../../../features/task/services/TaskExecutionHeadless';

describe('task-scoped runtime channel', () => {
  it('accepts exactly taskId and sessionRevision in Headless payload', () => {
    expect(parseHeadlessTaskIdentity(JSON.stringify({taskId: 'task-1', sessionRevision: 3}))).toEqual({taskId: 'task-1', sessionRevision: 3});
    expect(() => parseHeadlessTaskIdentity(JSON.stringify({taskId: 'task-1', sessionRevision: 3, instruction: 'secret'}))).toThrow('invalid_headless_payload');
    expect(() => parseHeadlessTaskIdentity(JSON.stringify({taskId: 'current', sessionRevision: 3}))).toThrow('invalid_task_id');
  });

  it('contains no legacy global event names in execution entrypoints', () => {
    const files = [
      'src/features/task/hooks/useTaskExecution.ts',
      'src/features/task/useTaskExecutionWithBackground.ts',
      'src/features/task/services/TaskExecutionHeadless.ts',
      'src/core/engine/taskEngine/task/TaskExecutionEngine.ts',
      'src/core/engine/taskEngine/task/modules/TaskStateModule.ts',
      'src/core/engine/taskEngine/task/modules/CancellationModule.ts',
    ];
    const text = files.map(file => fs.readFileSync(path.resolve(file), 'utf8')).join('\n');
    expect(text).not.toMatch(/TaskStarted|TaskStepStarted|TaskStepCompleted|TaskCompleted|TaskFailed|TaskCancelRequested|taskId:\s*['"]current['"]/);
    expect(text).not.toMatch(/modelInferenceModule|while\s*\(step\s*</);
  });

  it('passes task identity through the Android service cancel intent', () => {
    const service = fs.readFileSync(path.resolve('android/app/src/main/java/com/awesomeproject/service/TaskExecutionService.kt'), 'utf8');
    const headless = fs.readFileSync(path.resolve('android/app/src/main/java/com/awesomeproject/service/TaskExecutionHeadlessService.kt'), 'utf8');
    expect(service).toMatch(/putString\("taskId"/);
    expect(service).toMatch(/putDouble\("sessionRevision"/);
    expect(headless).not.toMatch(/任务数据:\s*\$taskData/);
  });
});
```

- [ ] **Step 2: Run RED**

```bash
cd AwesomeProject
npx jest src/__tests__/features/task/TaskUiEvents.test.ts src/__tests__/features/task/TaskExecutionHeadlessSession.test.ts src/__tests__/features/task/TaskNativeContract.test.ts --runInBand
```

Expected: FAIL because payload accepts extra fields、legacy global events remain、native cancel has no task identity and Headless logs raw taskData.

- [ ] **Step 3: Implement strict Headless identity parsing and one runner**

`parseHeadlessTaskIdentity` 必须 parse JSON object、要求 keys 排序后精确等于 `['sessionRevision','taskId']`、taskId 非空且不等于 `current`、revision 为正整数。`registerTaskExecutionTask` 只 claim stored session and invoke the same `OperateTaskRunner`；instruction 由 `TaskInstructionPort.load(taskId)` 读取。删除 Headless 中截图、model inference、action while-loop 和完整模型反序列化。

`useTaskExecutionWithBackground.startBackgroundTask` 序列化：

```ts
JSON.stringify({taskId, sessionRevision})
```

它不创建第二个 taskId、不读取 `AIModel`、不在 startBackgroundTask 失败时调用 foreground runner。`useTaskExecution` 变成 `OperateFacade` 的薄 React adapter；`TaskExecutionEngine` 只兼容委托给 `OperateTaskRunner`。

- [ ] **Step 4: Emit one validated UI event stream**

`NativeTaskUiEventSource` 只监听 `TASK_UI_EVENT_NAME`，对 raw value 做 Task 1 union validation；未知 type、空 taskId、非正 revision、非整数/负 sequence 均丢弃并只记录固定 reason code。`TaskStateModule` 不再 emit raw Task、model response、screenshot；sequence 从 session event counter 单调递增。`CancellationModule` 只接受 exact `{taskId, sessionRevision}`，不接受 absent/current/wildcard。

- [ ] **Step 5: Carry task identity through Android and iOS service APIs**

JS/Android method signatures改为：

```ts
startTaskExecutionService(taskId: string, sessionRevision: number, statusText: string): Promise<void>;
updateTaskExecutionService(taskId: string, sessionRevision: number, statusText: string): Promise<void>;
stopTaskExecutionService(taskId: string, sessionRevision: number): Promise<void>;
```

Android `ServiceManager` 给 start/update/cancel Intent 写 `taskId` 和 `sessionRevision`；`TaskExecutionService` 保存本次 identity，通知 cancel PendingIntent 也写同一 identity，`sendCancelTaskEvent` emit `NonoTaskCancelRequestedV1` 并放两个字段。没有 identity 时拒绝 emit，不能广播取消。`TaskExecutionHeadlessService` 只记录 `taskId` 与 revision，不记录 JSON payload。

iOS notification identifier 使用 `` `TaskExecutionService.${taskId}.${sessionRevision}` ``；update/stop 只操作 exact identifier。iOS 无 Headless JS 等价后台保证，保持现有时间窗口语义并在最终报告单列。

- [ ] **Step 6: Remove legacy Screen cancellation/listeners**

`TaskHistoryScreen.tsx` 只用 `OperateFacade.subscribeTask(taskId, sessionRevision, listener)`；停止按钮调用 `operate.cancel(taskId)`。删除所有 direct `DeviceEventEmitter` import 和 `'current'` cancel。页面收到其他 task/session 或重复 sequence 时不更新。

- [ ] **Step 7: Run JS and Android GREEN gates**

```bash
cd AwesomeProject
npx jest src/__tests__/features/task/TaskUiEvents.test.ts src/__tests__/features/task/TaskExecutionHeadlessSession.test.ts src/__tests__/features/task/TaskNativeContract.test.ts --runInBand
npx tsc --noEmit --pretty false
cd android
./gradlew :app:testDebugUnitTest :app:compileDebugKotlin --stacktrace
```

Expected: Jest/TypeScript PASS；Gradle `BUILD SUCCESSFUL`。

- [ ] **Step 8: Run source privacy/ownership guards**

```bash
cd AwesomeProject
if rg -n "TaskStarted|TaskStepStarted|TaskStepCompleted|TaskCompleted|TaskFailed|TaskCancelRequested|taskId:\s*['\"]current['\"]|modelInferenceModule|while\s*\(step\s*<" src/features/task/hooks/useTaskExecution.ts src/features/task/useTaskExecutionWithBackground.ts src/features/task/services/TaskExecutionHeadless.ts src/core/engine/taskEngine/task/TaskExecutionEngine.ts src/core/engine/taskEngine/task/modules/TaskStateModule.ts src/core/engine/taskEngine/task/modules/CancellationModule.ts; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
if rg -n "apiKey|Authorization|instruction|modelResponse|screenshot" src/features/task/services/TaskExecutionHeadless.ts android/app/src/main/java/com/awesomeproject/service/TaskExecutionHeadlessService.kt; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: 两个 `rg` 均无输出。类型定义/固定错误码若包含 `instruction` 名称，必须移到 `TaskInstructionPort` 文件且不进入 Headless payload。

- [ ] **Step 9: Commit the atomic event/native change**

```bash
git add AwesomeProject/src/features/task/services/TaskUiEventNames.ts \
  AwesomeProject/src/features/task/services/NativeTaskUiEventSource.ts \
  AwesomeProject/src/features/task/hooks/useTaskExecution.ts \
  AwesomeProject/src/features/task/useTaskExecutionWithBackground.ts \
  AwesomeProject/src/features/task/services/TaskExecutionHeadless.ts \
  AwesomeProject/src/core/engine/taskEngine/task/TaskExecutionEngine.ts \
  AwesomeProject/src/core/engine/taskEngine/task/modules/TaskStateModule.ts \
  AwesomeProject/src/core/engine/taskEngine/task/modules/CancellationModule.ts \
  AwesomeProject/src/features/task/screens/TaskHistoryScreen.tsx \
  AwesomeProject/src/core/ability/accessibility/AccessibilityService.ts \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityModule.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/utils/ServiceManager.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/service/TaskExecutionService.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/service/TaskExecutionHeadlessService.kt \
  AwesomeProject/ios/AwesomeProject/AutoGLMAccessibilityModule.m \
  AwesomeProject/src/__tests__/features/task/TaskUiEvents.test.ts \
  AwesomeProject/src/__tests__/features/task/TaskExecutionHeadlessSession.test.ts \
  AwesomeProject/src/__tests__/features/task/TaskNativeContract.test.ts
git commit -m "refactor: scope task UI events to immutable sessions"
```

若 Task 7 刚提交后 gate 失败，Rollback 必须整 commit 执行 `git revert HEAD`；禁止只回滚 JS 或只回滚 native signature。

---

