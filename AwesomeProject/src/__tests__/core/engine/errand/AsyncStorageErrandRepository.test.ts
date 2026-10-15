import {
  AsyncStorageErrandRepository,
  ERRAND_STORAGE_KEY,
  type AsyncStorageLike,
} from '@features/errand/data/AsyncStorageErrandRepository';
import type {ErrandDraft} from '@core/engine/errand/ports/ErrandRepository';

function makeStorage(): AsyncStorageLike & {backing: Record<string, string>} {
  const backing: Record<string, string> = {};
  return {
    backing,
    getItem: async key => backing[key] ?? null,
    setItem: async (key, value) => {
      backing[key] = value;
    },
  };
}

function makeClock(startMs: number) {
  return {now: () => startMs};
}

function makeIdGenerator(prefix: string) {
  let count = 0;
  return {
    next: () => `${prefix}${++count}`,
  };
}

const ONCE_DRAFT: ErrandDraft = {
  title: '交周报',
  schedule: {kind: 'once', dueAtMs: 1_700_000_000_000, timeZoneOffsetMinutes: 480},
};

const WEEKLY_DRAFT: ErrandDraft = {
  title: '每周交周报',
  schedule: {kind: 'weekly', weekday: 5, hour: 18, minute: 0, timeZoneOffsetMinutes: 480},
};

describe('AsyncStorageErrandRepository', () => {
  it('creates and lists an errand', async () => {
    const storage = makeStorage();
    const clock = makeClock(1_699_000_000_000);
    const idGenerator = makeIdGenerator('e');
    const repository = new AsyncStorageErrandRepository(storage, clock, idGenerator);

    const created = await repository.create(ONCE_DRAFT);
    expect(created).toMatchObject({id: 'e1', title: '交周报', status: 'scheduled'});

    const listed = await repository.list();
    expect(listed).toEqual([created]);
  });

  it('allows one claimant for one due errand', async () => {
    const storage = makeStorage();
    const clock = makeClock(1_699_000_000_000);
    const idGenerator = makeIdGenerator('e');
    const repository = new AsyncStorageErrandRepository(storage, clock, idGenerator);
    await repository.create(ONCE_DRAFT);

    const claim = (workerId: string) => repository.claimDue(workerId, 1_700_000_001_000);
    const [a, b] = await Promise.all([claim('worker-a'), claim('worker-b')]);
    expect(a.length + b.length).toBe(1);
  });

  it('completes a once errand and reschedules a weekly errand', async () => {
    const storage = makeStorage();
    const clock = makeClock(1_699_000_000_000);
    const idGenerator = makeIdGenerator('e');
    const repository = new AsyncStorageErrandRepository(storage, clock, idGenerator);
    await repository.create(ONCE_DRAFT);

    const [claim] = await repository.claimDue('worker-a', 1_700_000_001_000);
    await repository.complete({
      errandId: claim.errand.id,
      leaseId: claim.lease.leaseId,
      completedAtMs: 1_700_000_002_000,
    });

    const [errand] = await repository.list();
    expect(errand.status).toBe('completed');
    expect(errand.nextDueAtMs).toBeNull();
    expect(errand.lease).toBeNull();
  });

  it('rejects a stale leaseId on complete and fail', async () => {
    const storage = makeStorage();
    const clock = makeClock(1_699_000_000_000);
    const idGenerator = makeIdGenerator('e');
    const repository = new AsyncStorageErrandRepository(storage, clock, idGenerator);
    await repository.create(ONCE_DRAFT);
    await repository.claimDue('worker-a', 1_700_000_001_000);

    await expect(
      repository.complete({errandId: 'e1', leaseId: 'wrong-lease', completedAtMs: 1_700_000_002_000}),
    ).rejects.toThrow('errand_lease_lost');
    await expect(
      repository.fail({
        errandId: 'e1',
        leaseId: 'wrong-lease',
        errorCode: 'visual_agent_disconnected',
        failedAtMs: 1_700_000_002_000,
      }),
    ).rejects.toThrow('errand_lease_lost');
  });

  it('rejects an expired lease even when the leaseId still matches', async () => {
    const storage = makeStorage();
    const clock = makeClock(1_699_000_000_000);
    const idGenerator = makeIdGenerator('e');
    const repository = new AsyncStorageErrandRepository(storage, clock, idGenerator);
    await repository.create(ONCE_DRAFT);
    const [claim] = await repository.claimDue('worker-a', 1_700_000_001_000);

    const farFuture = 1_700_000_001_000 + 6 * 60 * 1000;
    await expect(
      repository.complete({errandId: claim.errand.id, leaseId: claim.lease.leaseId, completedAtMs: farFuture}),
    ).rejects.toThrow('errand_lease_lost');
  });

  it('records a generic failure and reschedules a weekly errand for next week', async () => {
    const storage = makeStorage();
    const clock = makeClock(1_699_000_000_000);
    const idGenerator = makeIdGenerator('e');
    const repository = new AsyncStorageErrandRepository(storage, clock, idGenerator);
    await repository.create(WEEKLY_DRAFT);
    const nowMs = Date.UTC(2024, 0, 5, 10, 0, 0);
    const [claim] = await repository.claimDue('worker-a', nowMs);

    await repository.fail({
      errandId: claim.errand.id,
      leaseId: claim.lease.leaseId,
      errorCode: 'visual_agent_disconnected',
      failedAtMs: nowMs,
    });

    const [errand] = await repository.list();
    expect(errand.status).toBe('failed');
    expect(errand.lastFailure).toEqual({errorCode: 'visual_agent_disconnected', failedAtMs: nowMs});
    expect(errand.nextDueAtMs).toBeGreaterThan(nowMs);
  });

  it('cancels an errand so it is never claimed again', async () => {
    const storage = makeStorage();
    const clock = makeClock(1_699_000_000_000);
    const idGenerator = makeIdGenerator('e');
    const repository = new AsyncStorageErrandRepository(storage, clock, idGenerator);
    const created = await repository.create(ONCE_DRAFT);

    await repository.cancel(created.id);
    const claims = await repository.claimDue('worker-a', 1_700_000_001_000);
    expect(claims).toEqual([]);
    const [errand] = await repository.list();
    expect(errand.status).toBe('cancelled');
  });

  it('updates a draft and resets it back to scheduled', async () => {
    const storage = makeStorage();
    const clock = makeClock(1_699_000_000_000);
    const idGenerator = makeIdGenerator('e');
    const repository = new AsyncStorageErrandRepository(storage, clock, idGenerator);
    const created = await repository.create(ONCE_DRAFT);

    const updated = await repository.updateDraft(created.id, WEEKLY_DRAFT);
    expect(updated.title).toBe('每周交周报');
    expect(updated.schedule).toEqual(WEEKLY_DRAFT.schedule);
    expect(updated.status).toBe('scheduled');
  });

  it('treats an unrecognized legacy record as needs_attention and never claims it', async () => {
    const storage = makeStorage();
    storage.backing[ERRAND_STORAGE_KEY] = JSON.stringify({
      schemaVersion: 1,
      records: {
        legacy1: {title: '旧提醒', when: '每天'},
      },
    });
    const clock = makeClock(1_699_000_000_000);
    const idGenerator = makeIdGenerator('e');
    const repository = new AsyncStorageErrandRepository(storage, clock, idGenerator);

    const [errand] = await repository.list();
    expect(errand.status).toBe('needs_attention');

    const claims = await repository.claimDue('worker-a', 1_700_000_001_000);
    expect(claims).toEqual([]);
  });
});
