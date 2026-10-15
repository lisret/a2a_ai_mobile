import {ErrandFacade, type ErrandProposal} from '@features/errand/application/ErrandFacade';
import type {CapabilityConfigPort, CapabilityConfigSnapshot} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {Errand} from '@core/engine/errand/domain/Errand';
import type {ErrandRepository} from '@core/engine/errand/ports/ErrandRepository';

function makeSnapshot(overrides: Partial<CapabilityConfigSnapshot> = {}): CapabilityConfigSnapshot {
  return {
    revision: 1,
    capabilities: {errands: true},
    privacy: {memoryEnabled: true, memoryLocation: 'device', memoryProfileId: null},
    visualAgent: {enabled: false, activeProfileId: null, profiles: []},
    ...overrides,
  };
}

function makeErrand(overrides: Partial<Errand> = {}): Errand {
  return {
    id: 'e1',
    title: '交周报',
    schedule: {kind: 'weekly', weekday: 5, hour: 18, minute: 0, timeZoneOffsetMinutes: 480},
    status: 'scheduled',
    nextDueAtMs: 1_700_000_000_000,
    lease: null,
    lastFailure: null,
    createdAtMs: 1_699_000_000_000,
    updatedAtMs: 1_699_000_000_000,
    ...overrides,
  };
}

describe('ErrandFacade', () => {
  let repository: jest.Mocked<ErrandRepository>;
  let capabilityConfig: jest.Mocked<CapabilityConfigPort>;

  beforeEach(() => {
    repository = {
      create: jest.fn().mockResolvedValue(makeErrand()),
      list: jest.fn().mockResolvedValue([makeErrand()]),
      claimDue: jest.fn(),
      complete: jest.fn(),
      fail: jest.fn(),
      cancel: jest.fn().mockResolvedValue(undefined),
      updateDraft: jest.fn().mockResolvedValue(makeErrand()),
    };
    capabilityConfig = {
      read: jest.fn().mockResolvedValue(makeSnapshot()),
      compareAndSet: jest.fn().mockResolvedValue(makeSnapshot()),
    };
  });

  function makeFacade(): ErrandFacade {
    const clock = {now: () => Date.UTC(2024, 0, 5, 2, 0, 0)};
    return new ErrandFacade(repository, clock, capabilityConfig, () => 480);
  }

  it('parses and persists only a confirmed proposal', async () => {
    const facade = makeFacade();
    const proposal: ErrandProposal = {kind: 'errand', title: '交周报', errandType: 'schedule', when: '每周五 18:00'};
    await expect(facade.create(proposal)).resolves.toBe('e1');
    expect(repository.create).toHaveBeenCalledWith({
      title: '交周报',
      schedule: {kind: 'weekly', weekday: 5, hour: 18, minute: 0, timeZoneOffsetMinutes: 480},
    });
  });

  it('rejects an ambiguous when string without persisting', async () => {
    const facade = makeFacade();
    const proposal: ErrandProposal = {kind: 'errand', title: '交周报', errandType: 'once', when: '下班前'};
    await expect(facade.create(proposal)).rejects.toThrow('errand_time_ambiguous');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('reads a merged view of enablement and errand items', async () => {
    const facade = makeFacade();
    await expect(facade.read()).resolves.toEqual({
      enabled: true,
      items: [
        {
          id: 'e1',
          title: '交周报',
          errandType: 'schedule',
          status: 'scheduled',
          needsConfirmation: false,
          nextDueAtMs: 1_700_000_000_000,
          lastErrorCode: null,
        },
      ],
    });
  });

  it('maps a needs_attention errand to failed with needsConfirmation', async () => {
    repository.list.mockResolvedValueOnce([makeErrand({status: 'needs_attention', nextDueAtMs: null})]);
    const facade = makeFacade();
    const view = await facade.read();
    expect(view.items[0]).toMatchObject({status: 'failed', needsConfirmation: true});
  });

  it('toggles the errands capability through compareAndSet', async () => {
    const facade = makeFacade();
    await facade.setEnabled(false);
    expect(capabilityConfig.compareAndSet).toHaveBeenCalledWith(1, {
      capabilities: {errands: false},
      privacy: {memoryEnabled: true, memoryLocation: 'device', memoryProfileId: null},
      visualAgent: {enabled: false, activeProfileId: null, profiles: []},
    });
  });

  it('updates and cancels by id', async () => {
    const facade = makeFacade();
    await facade.update('e1', {kind: 'errand', title: '新标题', errandType: 'schedule', when: '每周五 18:00'});
    expect(repository.updateDraft).toHaveBeenCalledWith('e1', {
      title: '新标题',
      schedule: {kind: 'weekly', weekday: 5, hour: 18, minute: 0, timeZoneOffsetMinutes: 480},
    });

    await facade.cancel('e1');
    expect(repository.cancel).toHaveBeenCalledWith('e1');
  });
});
