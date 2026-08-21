import {OperateRuntimeColdStart} from '../../../../../core/engine/operateRuntime/OperateRuntimeColdStart';

describe('OperateRuntimeColdStart', () => {
  function makeHarness() {
    const calls: string[] = [];
    const configRepository = {
      load: jest.fn().mockImplementation(async () => {
        calls.push('config.load');
        return {schemaVersion: 1, revision: 1, active: {}, draft: {}};
      }),
    };
    const sessionStore = {
      listNonterminal: jest.fn().mockImplementation(async () => {
        calls.push('session.recover');
        return [];
      }),
    };
    const collector = {
      reconcileBeforeAcceptingTasks: jest.fn().mockImplementation(async () => {
        calls.push('collector.reconcile');
      }),
    };
    const runtime = {
      createSession: jest.fn().mockResolvedValue({ok: true, session: {taskId: 'task-1'}}),
    };
    const coldStart = new OperateRuntimeColdStart({
      configRepository: configRepository as never,
      sessionStore: sessionStore as never,
      collector: collector as never,
      runtime: runtime as never,
    });
    return {calls, configRepository, sessionStore, collector, runtime, coldStart};
  }

  it('refuses createSession before cold start completes', async () => {
    const h = makeHarness();
    const result = await h.coldStart.createSession({taskId: 'task-1'});
    expect(result).toEqual({ok: false, code: 'operate_not_admitted'});
    expect(h.runtime.createSession).not.toHaveBeenCalled();
  });

  it('reconciles retired refs after config load and session recovery, then admits', async () => {
    const h = makeHarness();
    await h.coldStart.start();
    expect(h.calls).toEqual(['config.load', 'session.recover', 'collector.reconcile']);
    expect(h.coldStart.isAdmitted()).toBe(true);

    const result = await h.coldStart.createSession({taskId: 'task-1'});
    expect(result).toEqual({ok: true, session: {taskId: 'task-1'}});
    expect(h.runtime.createSession).toHaveBeenCalledWith({taskId: 'task-1'}, undefined);
  });

  it('keeps the gate closed when reconciliation fails', async () => {
    const h = makeHarness();
    h.collector.reconcileBeforeAcceptingTasks.mockRejectedValue(
      new Error('credential_cleanup_required'),
    );
    await expect(h.coldStart.start()).rejects.toThrow('credential_cleanup_required');
    expect(h.coldStart.isAdmitted()).toBe(false);
    const result = await h.coldStart.createSession({taskId: 'task-1'});
    expect(result).toEqual({ok: false, code: 'operate_not_admitted'});
  });
});
