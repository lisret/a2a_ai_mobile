### Task 8: Remove DEMO_TURNS and Connect Home to Facades

**Mode:** Wave 2；集成 Agent 串行。

**Files:**

- Modify: `AwesomeProject/src/features/task/screens/HomeScreen.tsx`
- Test: `AwesomeProject/src/__tests__/features/task/HomeFacadeIntegration.test.tsx`
- Test: `AwesomeProject/src/__tests__/features/task/HomeArchitectureGuard.test.ts`

**Interfaces:**

- Consumes: `useAppFacades().companion`、`.operate`、`.errands`；Task 7 task-scoped subscription。
- Produces: Home 只渲染 `CompanionViewState` + `OperateTaskViewState`；没有 ASR event 时不制造 transcript。Task 10 在此边界接真实 `SpeechRouter` 和 Avatar store。

- [ ] **Step 1: Write RED architecture and behavior tests**

```ts
import fs from 'node:fs';
import path from 'node:path';

describe('Home architecture', () => {
  const source = fs.readFileSync(path.resolve('src/features/task/screens/HomeScreen.tsx'), 'utf8');

  it('has no demo turns, direct repositories, model selection, old hooks, or global events', () => {
    expect(source).not.toMatch(/DEMO_TURNS|listenTurn|listenTimer|setTimeout\(.*2600/);
    expect(source).not.toMatch(/modelService|nonoConfigService|taskHistoryService|useTaskExecution|useTaskExecutionWithBackground|DeviceEventEmitter/);
    expect(source).not.toMatch(/startBackgroundTask|executeTaskForeground|taskId:\s*['"]current['"]/);
    expect(source).toMatch(/useAppFacades/);
  });
});
```

```tsx
import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {HomeScreen} from '../../../features/task/screens/HomeScreen';
import {AppFacadesProvider} from '../../../application/facades/AppFacadesContext';
import type {AppFacades} from '../../../application/facades/UiRuntimeContracts';

test('starts the exact heard instruction and cancels the exact returned task', async () => {
  const listener = jest.fn();
  const operate = {
    getViewState: jest.fn().mockResolvedValue({phase: 'idle', steps: []}),
    start: jest.fn().mockResolvedValue({kind: 'started', taskId: 'task-7', sessionRevision: 4}),
    cancel: jest.fn().mockResolvedValue(undefined),
    subscribeTask: jest.fn((_id, _revision, next) => { listener.mockImplementation(next); return jest.fn(); }),
  };
  const companion = {
    getViewState: jest.fn().mockResolvedValue({
      phase: 'ready',
      turn: {id: 'turn-1', transcript: '打开设置', reply: '准备操作', intent: 'operate'},
    }),
    submitTranscript: jest.fn(), confirmProposal: jest.fn(), dismissTurn: jest.fn(),
  };
  const facades = {operate, companion, errands: {createFromProposal: jest.fn()}} as unknown as AppFacades;
  const screen = render(<AppFacadesProvider value={facades}><HomeScreen /></AppFacadesProvider>);
  await waitFor(() => expect(screen.getByText('开始操作')).toBeTruthy());
  fireEvent.press(screen.getByText('开始操作'));
  await waitFor(() => expect(operate.start).toHaveBeenCalledWith('打开设置'));
  expect(operate.subscribeTask).toHaveBeenCalledWith('task-7', 4, expect.any(Function));
});
```

- [ ] **Step 2: Run RED**

```bash
cd AwesomeProject
npx jest src/__tests__/features/task/HomeArchitectureGuard.test.ts src/__tests__/features/task/HomeFacadeIntegration.test.tsx --runInBand
```

Expected: FAIL because V1 still contains `DEMO_TURNS`、old hooks/services and global events.

- [ ] **Step 3: Replace Home state ownership with Facade state**

Home focus 时并行调用 `companion.getViewState()` 与 `operate.getViewState()`；保留页面本地的纯 presentation state：确认 modal 是否显示、当前 partial text、active subscription cleanup。删除 `AIModel`、`CapabilityFlags`、`MemoryItem`、`Task`、`TaskStep` 业务 state。

操作开始必须处理 discriminated result：

```ts
const result = await operate.start(turn.transcript);
if (result.kind === 'blocked') {
  setOperateState({phase: 'blocked', steps: [], blocker: result.blocker});
  return;
}
setOperateState({
  phase: 'running',
  taskId: result.taskId,
  sessionRevision: result.sessionRevision,
  instruction: turn.transcript,
  steps: [],
});
unsubscribeRef.current?.();
unsubscribeRef.current = operate.subscribeTask(
  result.taskId,
  result.sessionRevision,
  applyTaskUiEvent,
);
```

`applyTaskUiEvent` 只根据 Task 1 union 更新：step_started 更新 currentStep/maxSteps；step_completed append safe step label；completed/failed 进入终态并清 subscription。不得读取 event 中的 raw Task，因为 contract 不允许。

确认 proposal：preference 和 errand 都只调用一次 `companion.confirmProposal(turn.id)`；Companion application port 根据冻结 proposal kind 原子写入 `PreferenceRepository` 或 `ErrandRepository`。Home 不调用 `errands.createFromProposal`、不生成 id/时间，测试断言每次确认只有一次 repository mutation。

在 Task 10 前，点角色不得设置 listening timer 或返回演示句；可以保持 idle 并显示固定“听写组件不可用”错误 state。Task 10 替换为 `SpeechRouter`。

- [ ] **Step 4: Verify GREEN and source boundary**

```bash
cd AwesomeProject
npx jest src/__tests__/features/task/HomeArchitectureGuard.test.ts src/__tests__/features/task/HomeFacadeIntegration.test.tsx src/__tests__/features/task/HomeScreenCompanionAlert.test.ts --runInBand
npx tsc --noEmit --pretty false
if rg -n "DEMO_TURNS|modelService|nonoConfigService|taskHistoryService|useTaskExecution|useTaskExecutionWithBackground|DeviceEventEmitter|taskId:\s*['\"]current['\"]" src/features/task/screens/HomeScreen.tsx; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: tests/TypeScript PASS；`rg` 无输出。

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/features/task/screens/HomeScreen.tsx \
  AwesomeProject/src/__tests__/features/task/HomeFacadeIntegration.test.tsx \
  AwesomeProject/src/__tests__/features/task/HomeArchitectureGuard.test.ts
git commit -m "refactor: connect V1 Home to application facades"
```

---

