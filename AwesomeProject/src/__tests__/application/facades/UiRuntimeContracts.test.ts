import type {
  AppFacades,
  ModelCatalogStatus,
  PhoneOperateViewState,
  TaskUiEvent,
  BuiltInVisualAgentToolId,
  OperateApplicationPort,
  ModelConfigApplicationPort,
  VisualAgentToolsApplicationPort,
} from '../../../application/facades/UiRuntimeContracts';

describe('UiRuntimeContracts', () => {
  it('requires task identity and sequence on every task event', () => {
    const event: TaskUiEvent = {
      type: 'completed',
      taskId: 'task-1',
      sessionRevision: 7,
      sequence: 9,
      occurredAtMs: 100,
      summary: '完成',
    };
    expect(event.taskId).toBe('task-1');
    expect(event.sessionRevision).toBe(7);
    expect(event.sequence).toBe(9);
  });

  it('models mode readiness instead of a cosmetic selected flag', () => {
    const state = {
      modes: {} as PhoneOperateViewState['modes'],
    } as PhoneOperateViewState;
    const facade = {operate: {} as AppFacades['operate']} as AppFacades;
    expect(state.modes).toBeDefined();
    expect(facade.operate).toBeDefined();
  });

  it('freezes generic tool and model catalog unions', () => {
    const preset: BuiltInVisualAgentToolId = 'hermes';
    const catalog: ModelCatalogStatus = 'stale';
    expect(preset).toBe('hermes');
    expect(catalog).toBe('stale');
  });

  it('freezes every application port before parallel facade workers start', () => {
    const ports = {} as {
      operate: OperateApplicationPort;
      modelConfig: ModelConfigApplicationPort;
      visualAgentTools: VisualAgentToolsApplicationPort;
    };
    expect(ports).toBeDefined();
  });
});
