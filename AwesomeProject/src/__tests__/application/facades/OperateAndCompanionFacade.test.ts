import {ScopedTaskUiEvents} from '../../../application/events/ScopedTaskUiEvents';
import {DefaultOperateFacade} from '../../../application/facades/OperateFacade';
import {DefaultCompanionFacade} from '../../../application/facades/CompanionFacade';
import type {TaskUiEvent} from '../../../application/facades/UiRuntimeContracts';

describe('application task facades', () => {
  it('delivers only matching session events with increasing sequence', () => {
    let emit: (event: TaskUiEvent) => void = () => undefined;
    const source = {
      subscribe: jest.fn(listener => {
        emit = listener;
        return jest.fn();
      }),
    };
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
      start: jest.fn().mockResolvedValue({
        kind: 'blocked',
        blocker: {code: 'visual_agent_not_ready', message: 'Active tool profile 未就绪'},
      }),
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
        id: 'turn-1',
        transcript: '以后少糖',
        reply: '要记住吗',
        intent: 'preference',
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
