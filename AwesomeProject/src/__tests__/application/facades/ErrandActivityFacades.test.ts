import {DefaultErrandFacade, ErrandNotEditableError} from '../../../application/facades/ErrandFacade';
import {DefaultActivityFacade} from '../../../application/facades/ActivityFacade';
import type {
  ActivityApplicationPort,
  ErrandApplicationPort,
  ErrandItemViewState,
} from '../../../application/facades/UiRuntimeContracts';

function buildErrandPort(): jest.Mocked<ErrandApplicationPort> {
  return {
    read: jest.fn(),
    setEnabled: jest.fn(),
    create: jest.fn().mockResolvedValue('errand-1'),
    update: jest.fn(),
    cancel: jest.fn(),
  };
}

function buildActivityState() {
  return {
    status: 'ready' as const,
    memoryEnabled: true,
    memoryLocationLabel: '仅这台手机',
    preferences: [],
    errands: [],
    tasks: [],
  };
}

function buildErrandItem(status: ErrandItemViewState['status']): ErrandItemViewState {
  return {
    id: 'errand-1',
    title: '交周报',
    kind: 'schedule',
    status,
    scheduleLabel: '周五 18:00',
  };
}

describe('DefaultErrandFacade', () => {
  it('creates only after an explicit errand proposal is confirmed by the caller', async () => {
    const port = buildErrandPort();
    const facade = new DefaultErrandFacade(port);
    await expect(
      facade.createFromProposal({kind: 'errand', title: '交周报', errandType: 'schedule', when: '周五 18:00'}),
    ).resolves.toBe('errand-1');
    expect(port.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty title without calling the port', async () => {
    const port = buildErrandPort();
    const facade = new DefaultErrandFacade(port);
    await expect(
      facade.createFromProposal({kind: 'errand', title: '  ', errandType: 'schedule', when: '周五 18:00'}),
    ).rejects.toThrow();
    expect(port.create).not.toHaveBeenCalled();
  });

  it('rejects a schedule proposal with an empty "when" without calling the port', async () => {
    const port = buildErrandPort();
    const facade = new DefaultErrandFacade(port);
    await expect(
      facade.createFromProposal({kind: 'errand', title: '交周报', errandType: 'schedule', when: '  '}),
    ).rejects.toThrow();
    expect(port.create).not.toHaveBeenCalled();
  });

  it('normalizes a once proposal by dropping "when" before delegating', async () => {
    const port = buildErrandPort();
    const facade = new DefaultErrandFacade(port);
    await facade.createFromProposal({kind: 'errand', title: '倒垃圾', errandType: 'once', when: '忽略我'});
    expect(port.create).toHaveBeenCalledWith({kind: 'errand', title: '倒垃圾', errandType: 'once'});
  });

  it.each(['pending', 'failed'] as const)('delegates update for an editable %s item', async status => {
    const port = buildErrandPort();
    const item = buildErrandItem(status);
    (port.update as jest.Mock).mockResolvedValue(item);
    const facade = new DefaultErrandFacade(port);
    await expect(facade.update(item)).resolves.toEqual(item);
    expect(port.update).toHaveBeenCalledWith(item);
  });

  it.each(['leased', 'completed', 'cancelled'] as const)(
    'rejects update for a non-editable %s item with a fixed error code',
    async status => {
      const port = buildErrandPort();
      const item = buildErrandItem(status);
      const facade = new DefaultErrandFacade(port);
      await expect(facade.update(item)).rejects.toMatchObject({code: 'errand_not_editable'});
      expect(port.update).not.toHaveBeenCalled();
    },
  );

  it('exposes ErrandNotEditableError with the fixed code', () => {
    expect(new ErrandNotEditableError().code).toBe('errand_not_editable');
  });

  it('delegates getViewState, setEnabled, and cancel to the port', async () => {
    const port = buildErrandPort();
    const facade = new DefaultErrandFacade(port);
    await facade.getViewState();
    await facade.setEnabled(true);
    await facade.cancel('errand-1');
    expect(port.read).toHaveBeenCalledTimes(1);
    expect(port.setEnabled).toHaveBeenCalledWith(true);
    expect(port.cancel).toHaveBeenCalledWith('errand-1');
  });
});

describe('DefaultActivityFacade', () => {
  it('reloads the three-source activity projection after forgetting a preference', async () => {
    const state = buildActivityState();
    const port: jest.Mocked<ActivityApplicationPort> = {
      read: jest.fn().mockResolvedValue(state),
      forgetPreference: jest.fn().mockResolvedValue(state),
      deleteTask: jest.fn(),
    };
    const facade = new DefaultActivityFacade(port);
    await expect(facade.forgetPreference('pref-1')).resolves.toEqual(state);
    expect(port.forgetPreference).toHaveBeenCalledWith('pref-1');
  });

  it('delegates getViewState and deleteTask to the aggregate port without filtering', async () => {
    const state = buildActivityState();
    const port: jest.Mocked<ActivityApplicationPort> = {
      read: jest.fn().mockResolvedValue(state),
      forgetPreference: jest.fn(),
      deleteTask: jest.fn().mockResolvedValue(state),
    };
    const facade = new DefaultActivityFacade(port);
    await expect(facade.getViewState()).resolves.toBe(state);
    await expect(facade.deleteTask('task-1')).resolves.toBe(state);
    expect(port.deleteTask).toHaveBeenCalledWith('task-1');
  });
});
