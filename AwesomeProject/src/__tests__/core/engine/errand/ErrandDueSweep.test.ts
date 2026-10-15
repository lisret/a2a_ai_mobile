import {ErrandDueSweep, type ErrandExecutionPort} from '@core/engine/errand/application/ErrandDueSweep';
import type {CapabilityConfigPort, CapabilityConfigSnapshot} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {Errand} from '@core/engine/errand/domain/Errand';
import type {ErrandClaim, ErrandRepository} from '@core/engine/errand/ports/ErrandRepository';

function makeSnapshot(errandsEnabled: boolean): CapabilityConfigSnapshot {
  return {
    revision: 1,
    capabilities: {errands: errandsEnabled},
    privacy: {memoryEnabled: true, memoryLocation: 'device', memoryProfileId: null},
    visualAgent: {enabled: false, activeProfileId: null, profiles: []},
  };
}

function makeErrand(overrides: Partial<Errand> = {}): Errand {
  return {
    id: 'e1',
    title: '交周报',
    schedule: {kind: 'once', dueAtMs: 1_700_000_000_000, timeZoneOffsetMinutes: 480},
    status: 'running',
    nextDueAtMs: 1_700_000_000_000,
    lease: {leaseId: 'l1', workerId: 'w1', claimedAtMs: 1_700_000_000_500},
    lastFailure: null,
    createdAtMs: 1_699_000_000_000,
    updatedAtMs: 1_700_000_000_500,
    ...overrides,
  };
}

describe('ErrandDueSweep', () => {
  let repository: jest.Mocked<ErrandRepository>;
  let executor: jest.Mocked<ErrandExecutionPort>;
  let capabilityConfig: jest.Mocked<CapabilityConfigPort>;
  let claim: ErrandClaim;

  beforeEach(() => {
    claim = {errand: makeErrand(), lease: {leaseId: 'l1', workerId: 'w1', claimedAtMs: 1_700_000_000_500}};
    repository = {
      create: jest.fn(),
      list: jest.fn(),
      claimDue: jest.fn().mockResolvedValue([claim]),
      complete: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn(),
      updateDraft: jest.fn(),
    };
    executor = {execute: jest.fn().mockResolvedValue(undefined)};
    capabilityConfig = {
      read: jest.fn().mockResolvedValue(makeSnapshot(true)),
      compareAndSet: jest.fn(),
    };
  });

  function makeSweep(): ErrandDueSweep {
    const clock = {now: () => 1_700_000_001_000};
    const idGenerator = {next: () => 'w1'};
    return new ErrandDueSweep(repository, clock, idGenerator, capabilityConfig, executor);
  }

  it('executes one claimed lease and completes it on success', async () => {
    const sweep = makeSweep();
    await expect(sweep.run()).resolves.toEqual({claimed: 1, succeeded: 1, failed: 0});
    expect(repository.claimDue).toHaveBeenCalledTimes(1);
    expect(repository.claimDue).toHaveBeenCalledWith('w1', 1_700_000_001_000);
    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(repository.complete).toHaveBeenCalledWith(
      expect.objectContaining({errandId: 'e1', leaseId: 'l1'}),
    );
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it('executes one claimed lease and persists a generic failure code', async () => {
    executor.execute.mockRejectedValueOnce(new Error('visual_agent_disconnected'));
    const sweep = makeSweep();
    await expect(sweep.run()).resolves.toEqual({claimed: 1, succeeded: 0, failed: 1});
    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({errandId: 'e1', leaseId: 'l1', errorCode: 'visual_agent_disconnected'}),
    );
    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it('maps an unrecognized error to capability_invalid_input', async () => {
    executor.execute.mockRejectedValueOnce(new Error('some raw stack trace text'));
    const sweep = makeSweep();
    await sweep.run();
    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({errorCode: 'capability_invalid_input'}),
    );
  });

  it('does nothing when there is no due errand', async () => {
    repository.claimDue.mockResolvedValueOnce([]);
    const sweep = makeSweep();
    await expect(sweep.run()).resolves.toEqual({claimed: 0, succeeded: 0, failed: 0});
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('skips claiming entirely when the errands capability is disabled', async () => {
    capabilityConfig.read.mockResolvedValueOnce(makeSnapshot(false));
    const sweep = makeSweep();
    await expect(sweep.run()).resolves.toEqual({claimed: 0, succeeded: 0, failed: 0});
    expect(repository.claimDue).not.toHaveBeenCalled();
  });
});
