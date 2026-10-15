import AsyncStorage from '@react-native-async-storage/async-storage';
import {ForegroundTaskExecutionAdapter} from '../../../features/task/services/ForegroundTaskExecutionAdapter';
import {
  HeadlessTaskExecutionAdapter,
  parseTaskExecutionData,
  serializeHeadlessTaskData,
} from '../../../features/task/services/HeadlessTaskExecutionAdapter';
import {OperateSessionStore} from '../../../core/engine/operateRuntime/session/OperateSessionStore';
import type {ResolvedOperateSessionV1} from '../../../core/engine/operateRuntime/contracts/OperateSessionContracts';
import type {OperateTaskOutcome} from '../../../core/engine/operateRuntime/runner/OperateTaskPorts';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

function sessionFor(
  taskId: string,
  sessionRevision: number,
): ResolvedOperateSessionV1 {
  return {
    schemaVersion: 1,
    taskId,
    sessionRevision,
    configRevision: 1,
    channel: 'cloud_direct',
    modelBindings: {},
    createdAtMs: 0,
  };
}

describe('parseTaskExecutionData', () => {
  it('accepts exactly {taskId, sessionRevision}', () => {
    expect(
      parseTaskExecutionData('{"taskId":"task-1","sessionRevision":7}'),
    ).toEqual({
      taskId: 'task-1',
      sessionRevision: 7,
    });
  });

  it('rejects extra keys, stale/invalid revisions, blank ids and malformed JSON', () => {
    expect(
      parseTaskExecutionData('{"taskId":"t","sessionRevision":1,"model":{}}'),
    ).toBeNull();
    expect(parseTaskExecutionData('{"taskId":"t"}')).toBeNull();
    expect(
      parseTaskExecutionData('{"taskId":"","sessionRevision":1}'),
    ).toBeNull();
    expect(
      parseTaskExecutionData('{"taskId":"t","sessionRevision":0}'),
    ).toBeNull();
    expect(
      parseTaskExecutionData('{"taskId":"t","sessionRevision":1.5}'),
    ).toBeNull();
    expect(
      parseTaskExecutionData('{"taskId":"t","sessionRevision":-3}'),
    ).toBeNull();
    expect(parseTaskExecutionData('not json')).toBeNull();
  });

  it('serializes only the two minimal keys with no credential or instruction', () => {
    const serialized = serializeHeadlessTaskData({
      taskId: 'task-1',
      sessionRevision: 7,
    });
    expect(JSON.parse(serialized)).toEqual({
      taskId: 'task-1',
      sessionRevision: 7,
    });
    expect(serialized).not.toMatch(
      /instruction|model|apiKey|baseUrl|secretRef|screenshot|response/i,
    );
  });
});

describe('foreground and Headless entry adapters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const backing: Record<string, string> = {};
    mockAsyncStorage.getItem.mockImplementation(
      async key => backing[key] ?? null,
    );
    mockAsyncStorage.setItem.mockImplementation(async (key, value) => {
      backing[key] = value;
    });
  });

  it('drives one immutable session through the same runner from both entry points', async () => {
    const store = new OperateSessionStore(() => 1000);
    const runner = {
      run: jest.fn().mockResolvedValue({kind: 'success'} as OperateTaskOutcome),
    };

    // Foreground creates the session and runs it.
    const runtime = {
      createSession: jest.fn(async ({taskId}: {taskId: string}) => {
        const sessionRevision = await store.nextSessionRevision();
        const session = sessionFor(taskId, sessionRevision);
        const created = await store.create(session);
        return created.ok
          ? ({ok: true, session} as const)
          : ({ok: false, code: created.code} as const);
      }),
      claim: (
        taskId: string,
        sessionRevision: number,
        owner: 'foreground' | 'headless',
      ) => store.claim(taskId, sessionRevision, owner),
    };

    const foreground = new ForegroundTaskExecutionAdapter({
      runtime,
      runner,
      initialWriter: {saveInitialTask: jest.fn().mockResolvedValue(undefined)},
      newTaskId: () => 'task-1',
    });

    const fgResult = await foreground.execute('open settings');
    expect(fgResult.taskId).toBe('task-1');
    expect(fgResult.outcome).toEqual({kind: 'success'});
    expect(runner.run).toHaveBeenCalledTimes(1);
    const foregroundLease = runner.run.mock.calls[0][0];
    expect(foregroundLease.owner).toBe('foreground');
    expect(foregroundLease.session.taskId).toBe('task-1');

    // The session is terminal after foreground; a second task reuses the flow.
    const store2 = new OperateSessionStore(() => 2000);
    const created2 = await store2.create(sessionFor('task-2', 1));
    expect(created2.ok).toBe(true);

    const headlessRuntime = {
      createSession: jest.fn(),
      claim: (
        taskId: string,
        sessionRevision: number,
        owner: 'foreground' | 'headless',
      ) => store2.claim(taskId, sessionRevision, owner),
    };
    const headless = new HeadlessTaskExecutionAdapter({
      runtime: headlessRuntime,
      runner,
    });
    const hlResult = await headless.run(
      serializeHeadlessTaskData({taskId: 'task-2', sessionRevision: 1}),
    );

    expect(hlResult.ok).toBe(true);
    expect(headlessRuntime.createSession).not.toHaveBeenCalled();
    expect(runner.run).toHaveBeenCalledTimes(2);
    const headlessLease = runner.run.mock.calls[1][0];
    expect(headlessLease.owner).toBe('headless');
    expect(headlessLease.session.taskId).toBe('task-2');
  });

  it('foreground never runs when session creation is blocked', async () => {
    const runner = {run: jest.fn()};
    const runtime = {
      createSession: jest
        .fn()
        .mockResolvedValue({ok: false, code: 'local_model_not_ready'}),
      claim: jest.fn(),
    };
    const foreground = new ForegroundTaskExecutionAdapter({
      runtime,
      runner,
      initialWriter: {saveInitialTask: jest.fn().mockResolvedValue(undefined)},
      newTaskId: () => 'task-1',
    });
    const result = await foreground.execute('do thing');
    expect(result.blockedCode).toBe('local_model_not_ready');
    expect(runner.run).not.toHaveBeenCalled();
    expect(runtime.claim).not.toHaveBeenCalled();
  });

  it('Headless rejects an invalid payload without touching the runner', async () => {
    const runner = {run: jest.fn()};
    const runtime = {createSession: jest.fn(), claim: jest.fn()};
    const headless = new HeadlessTaskExecutionAdapter({runtime, runner});
    const result = await headless.run(
      '{"taskId":"t","sessionRevision":1,"apiKey":"x"}',
    );
    expect(result).toEqual({ok: false, code: 'headless_task_invalid_payload'});
    expect(runtime.claim).not.toHaveBeenCalled();
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('Headless rejects a stale revision as a replay', async () => {
    const store = new OperateSessionStore(() => 1000);
    await store.create(sessionFor('task-1', 5));
    const runner = {run: jest.fn()};
    const runtime = {
      createSession: jest.fn(),
      claim: (
        taskId: string,
        sessionRevision: number,
        owner: 'foreground' | 'headless',
      ) => store.claim(taskId, sessionRevision, owner),
    };
    const headless = new HeadlessTaskExecutionAdapter({runtime, runner});
    const result = await headless.run(
      serializeHeadlessTaskData({taskId: 'task-1', sessionRevision: 2}),
    );
    expect(result.ok).toBe(false);
    expect(runner.run).not.toHaveBeenCalled();
  });
});
