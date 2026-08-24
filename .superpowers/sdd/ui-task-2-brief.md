### Task 2: Operate, Companion, and Scoped Task Event Facades

**Mode:** Wave 1 worker A；可与 Task 3、Task 4 并行；只新增列出的文件。

**Files:**

- Create: `AwesomeProject/src/application/events/ScopedTaskUiEvents.ts`
- Create: `AwesomeProject/src/application/facades/OperateFacade.ts`
- Create: `AwesomeProject/src/application/facades/CompanionFacade.ts`
- Test: `AwesomeProject/src/__tests__/application/facades/OperateAndCompanionFacade.test.ts`

**Interfaces:**

- Consumes: Task 1 的 `OperateFacade`、`CompanionFacade`、`TaskUiEvent`、`OperateApplicationPort`、`TaskUiEventSource`、`CompanionApplicationPort`；只 import 这些冻结 ports，不 import Screen、Hook、provider、AsyncStorage 或原生 bridge。
- Produces: `DefaultOperateFacade`、`DefaultCompanionFacade`、`ScopedTaskUiEvents`。

- [ ] **Step 1: Write RED tests for scope, no fallback, and explicit confirmation**

```ts
import {ScopedTaskUiEvents} from '../../../application/events/ScopedTaskUiEvents';
import {DefaultOperateFacade} from '../../../application/facades/OperateFacade';
import {DefaultCompanionFacade} from '../../../application/facades/CompanionFacade';
import type {TaskUiEvent} from '../../../application/facades/UiRuntimeContracts';

describe('application task facades', () => {
  it('delivers only matching session events with increasing sequence', () => {
    let emit: (event: TaskUiEvent) => void = () => undefined;
    const source = {subscribe: jest.fn(listener => { emit = listener; return jest.fn(); })};
    const events = new ScopedTaskUiEvents(source);
    const listener = jest.fn();
    events.subscribe('task-a', 3, listener);

    emit({type: 'started', taskId: 'task-b', sessionRevision: 3, sequence: 1, occurredAtMs: 1, maxSteps: 9});
    emit({type: 'started', taskId: 'task-a', sessionRevision: 2, sequence: 1, occurredAtMs: 1, maxSteps: 9});
    emit({type: 'started', taskId: 'task-a', sessionRevision: 3, sequence: 2, occurredAtMs: 2, maxSteps: 9});
    emit({type: 'step_started', taskId: 'task-a', sessionRevision: 3, sequence: 2, occurredAtMs: 3, step: 1, maxSteps: 9});

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].sequence).toBe(2);
  });

  it('returns a blocked operate result without opening a second execution path', async () => {
    const port = {
      getCurrent: jest.fn(),
      start: jest.fn().mockResolvedValue({kind: 'blocked', blocker: {code: 'visual_agent_not_ready', message: 'Active tool profile 未就绪'}}),
      cancel: jest.fn(),
    };
    const facade = new DefaultOperateFacade(port, {subscribe: jest.fn()});
    await expect(facade.start('打开设置')).resolves.toEqual({
      kind: 'blocked',
      blocker: {code: 'visual_agent_not_ready', message: 'Active tool profile 未就绪'},
    });
    expect(port.start).toHaveBeenCalledTimes(1);
  });

  it('does not persist a companion proposal before confirmProposal', async () => {
    const port = {
      getState: jest.fn(),
      submitTranscript: jest.fn().mockResolvedValue({
        id: 'turn-1', transcript: '以后少糖', reply: '要记住吗', intent: 'preference',
        proposal: {kind: 'preference', title: '少糖'},
      }),
      confirmProposal: jest.fn(),
      dismissTurn: jest.fn(),
    };
    const facade = new DefaultCompanionFacade(port);
    await facade.submitTranscript('以后少糖');
    expect(port.confirmProposal).not.toHaveBeenCalled();
    await facade.confirmProposal('turn-1');
    expect(port.confirmProposal).toHaveBeenCalledWith('turn-1');
  });
});
```

- [ ] **Step 2: Run RED**

```bash
cd AwesomeProject
npx jest src/__tests__/application/facades/OperateAndCompanionFacade.test.ts --runInBand
```

Expected: FAIL with the three missing production modules.

- [ ] **Step 3: Implement the thin facades and sequence filter**

`ScopedTaskUiEvents` 的核心必须精确为：

```ts
export class ScopedTaskUiEvents {
  constructor(private readonly source: TaskUiEventSource) {}

  subscribe(
    taskId: string,
    sessionRevision: number,
    listener: (event: TaskUiEvent) => void,
  ): Unsubscribe {
    let lastSequence = -1;
    return this.source.subscribe(event => {
      if (event.taskId !== taskId || event.sessionRevision !== sessionRevision) return;
      if (!Number.isInteger(event.sequence) || event.sequence <= lastSequence) return;
      lastSequence = event.sequence;
      listener(event);
    });
  }
}
```

`DefaultOperateFacade` 只 trim instruction、拒绝空输入、委托一次 `port.start()`、按 exact task/session 订阅，并把 `cancel(taskId)` 原样委托；它不 catch blocked 后启动别的 runner。`DefaultCompanionFacade` 只委托四个文本用例，proposal 返回时不自动确认。

- [ ] **Step 4: Verify green and ownership**

```bash
cd AwesomeProject
npx jest src/__tests__/application/facades/OperateAndCompanionFacade.test.ts --runInBand
npx tsc --noEmit --pretty false
git diff --name-only codex/checkpoint-v1-wave2...HEAD
```

Expected: Jest/TypeScript PASS；diff 只有 Task 2 的三个 production 文件和一个 test 文件。

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/application/events/ScopedTaskUiEvents.ts \
  AwesomeProject/src/application/facades/OperateFacade.ts \
  AwesomeProject/src/application/facades/CompanionFacade.ts \
  AwesomeProject/src/__tests__/application/facades/OperateAndCompanionFacade.test.ts
git commit -m "feat: add scoped operate and companion facades"
```

---

