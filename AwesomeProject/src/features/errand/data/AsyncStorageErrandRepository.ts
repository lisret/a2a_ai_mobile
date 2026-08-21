// Durable errand repository. All mutations run through one serialized queue
// so claim/reclaim/complete/fail never race against each other.
import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import type {Clock, IdGenerator} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {Errand, ErrandFailure, ErrandLease, ErrandSchedule, ErrandStatus} from '@core/engine/errand/domain/Errand';
import {nextDueAfter} from '@core/engine/errand/domain/parseErrandTime';
import type {
  ErrandClaim,
  ErrandCompleteInput,
  ErrandDraft,
  ErrandFailInput,
  ErrandRepository,
} from '@core/engine/errand/ports/ErrandRepository';

export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const ERRAND_STORAGE_KEY = '@nono:errands:v1';
const ERRAND_LEASE_TTL_MS = 5 * 60 * 1000;

interface StoredErrand {
  readonly id: string;
  title: string;
  schedule: ErrandSchedule;
  status: ErrandStatus;
  nextDueAtMs: number | null;
  lease: ErrandLease | null;
  lastFailure: ErrandFailure | null;
  readonly createdAtMs: number;
  updatedAtMs: number;
}

interface StoredEnvelope {
  readonly schemaVersion: 1;
  records: Record<string, StoredErrand>;
}

const KNOWN_STATUSES: readonly ErrandStatus[] = [
  'scheduled',
  'due',
  'running',
  'completed',
  'failed',
  'needs_attention',
  'cancelled',
];

function emptyEnvelope(): StoredEnvelope {
  return {schemaVersion: 1, records: {}};
}

function isKnownStatus(value: unknown): value is ErrandStatus {
  return typeof value === 'string' && (KNOWN_STATUSES as readonly string[]).includes(value);
}

function isValidSchedule(value: unknown): value is ErrandSchedule {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const schedule = value as Record<string, unknown>;
  if (typeof schedule.timeZoneOffsetMinutes !== 'number') {
    return false;
  }
  if (schedule.kind === 'once') {
    return typeof schedule.dueAtMs === 'number';
  }
  if (schedule.kind === 'weekly') {
    return (
      typeof schedule.weekday === 'number' &&
      typeof schedule.hour === 'number' &&
      typeof schedule.minute === 'number'
    );
  }
  return false;
}

// Any record that does not match the current shape becomes needs_attention
// and is never auto-run, instead of crashing or silently disappearing.
function sanitizeRecord(id: string, raw: unknown, nowMs: number): StoredErrand | null {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const title = typeof value.title === 'string' ? value.title : null;
  if (title === null) {
    return null;
  }
  const createdAtMs = typeof value.createdAtMs === 'number' ? value.createdAtMs : nowMs;
  const validShape = isValidSchedule(value.schedule) && isKnownStatus(value.status);
  if (!validShape) {
    return {
      id,
      title,
      schedule: {kind: 'once', dueAtMs: createdAtMs, timeZoneOffsetMinutes: 0},
      status: 'needs_attention',
      nextDueAtMs: null,
      lease: null,
      lastFailure: null,
      createdAtMs,
      updatedAtMs: nowMs,
    };
  }
  return {
    id,
    title,
    schedule: value.schedule as ErrandSchedule,
    status: value.status as ErrandStatus,
    nextDueAtMs: typeof value.nextDueAtMs === 'number' ? value.nextDueAtMs : null,
    lease: (value.lease as ErrandLease | null) ?? null,
    lastFailure: (value.lastFailure as ErrandFailure | null) ?? null,
    createdAtMs,
    updatedAtMs: typeof value.updatedAtMs === 'number' ? value.updatedAtMs : createdAtMs,
  };
}

function toErrand(stored: StoredErrand): Errand {
  return {
    id: stored.id,
    title: stored.title,
    schedule: stored.schedule,
    status: stored.status,
    nextDueAtMs: stored.nextDueAtMs,
    lease: stored.lease,
    lastFailure: stored.lastFailure,
    createdAtMs: stored.createdAtMs,
    updatedAtMs: stored.updatedAtMs,
  };
}

export class AsyncStorageErrandRepository implements ErrandRepository {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: AsyncStorageLike,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async readEnvelope(): Promise<StoredEnvelope> {
    let raw: string | null;
    try {
      raw = await this.storage.getItem(ERRAND_STORAGE_KEY);
    } catch {
      return emptyEnvelope();
    }
    if (!raw) {
      return emptyEnvelope();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return emptyEnvelope();
    }
    if (parsed === null || typeof parsed !== 'object') {
      return emptyEnvelope();
    }
    const envelope = parsed as {records?: Record<string, unknown>};
    const nowMs = this.clock.now();
    const records: Record<string, StoredErrand> = {};
    for (const [id, value] of Object.entries(envelope.records ?? {})) {
      const sanitized = sanitizeRecord(id, value, nowMs);
      if (sanitized) {
        records[id] = sanitized;
      }
    }
    return {schemaVersion: 1, records};
  }

  private async writeEnvelope(envelope: StoredEnvelope): Promise<void> {
    await this.storage.setItem(ERRAND_STORAGE_KEY, JSON.stringify(envelope));
  }

  private requireActiveLease(record: StoredErrand | undefined, leaseId: string, nowMs: number): StoredErrand {
    if (!record || record.lease === null || record.lease.leaseId !== leaseId) {
      throw new CapabilityError('errand_lease_lost');
    }
    if (nowMs - record.lease.claimedAtMs > ERRAND_LEASE_TTL_MS) {
      throw new CapabilityError('errand_lease_lost');
    }
    return record;
  }

  create(draft: ErrandDraft): Promise<Errand> {
    return this.enqueue(async () => {
      const envelope = await this.readEnvelope();
      const nowMs = this.clock.now();
      const id = this.idGenerator.next();
      const stored: StoredErrand = {
        id,
        title: draft.title,
        schedule: draft.schedule,
        status: 'scheduled',
        nextDueAtMs: nextDueAfter(draft.schedule, nowMs),
        lease: null,
        lastFailure: null,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      };
      envelope.records[id] = stored;
      await this.writeEnvelope(envelope);
      return toErrand(stored);
    });
  }

  list(): Promise<readonly Errand[]> {
    return this.enqueue(async () => {
      const envelope = await this.readEnvelope();
      return Object.values(envelope.records).map(toErrand);
    });
  }

  claimDue(workerId: string, nowMs: number): Promise<readonly ErrandClaim[]> {
    return this.enqueue(async () => {
      const envelope = await this.readEnvelope();
      const candidates = Object.values(envelope.records).filter(record => {
        if (record.status === 'completed' || record.status === 'cancelled' || record.status === 'needs_attention') {
          return false;
        }
        if (record.nextDueAtMs === null || record.nextDueAtMs > nowMs) {
          return false;
        }
        if (record.lease !== null && nowMs - record.lease.claimedAtMs < ERRAND_LEASE_TTL_MS) {
          return false;
        }
        return true;
      });
      if (candidates.length === 0) {
        return [];
      }
      candidates.sort((a, b) => (a.nextDueAtMs ?? 0) - (b.nextDueAtMs ?? 0));
      const record = candidates[0];
      const lease: ErrandLease = {leaseId: this.idGenerator.next(), workerId, claimedAtMs: nowMs};
      record.lease = lease;
      record.status = 'running';
      record.updatedAtMs = nowMs;
      await this.writeEnvelope(envelope);
      return [{errand: toErrand(record), lease}];
    });
  }

  complete(input: ErrandCompleteInput): Promise<void> {
    return this.enqueue(async () => {
      const envelope = await this.readEnvelope();
      const record = this.requireActiveLease(envelope.records[input.errandId], input.leaseId, input.completedAtMs);
      if (record.schedule.kind === 'weekly') {
        record.status = 'scheduled';
        record.nextDueAtMs = nextDueAfter(record.schedule, input.completedAtMs);
      } else {
        record.status = 'completed';
        record.nextDueAtMs = null;
      }
      record.lease = null;
      record.updatedAtMs = input.completedAtMs;
      await this.writeEnvelope(envelope);
    });
  }

  fail(input: ErrandFailInput): Promise<void> {
    return this.enqueue(async () => {
      const envelope = await this.readEnvelope();
      const record = this.requireActiveLease(envelope.records[input.errandId], input.leaseId, input.failedAtMs);
      record.status = 'failed';
      record.lastFailure = {errorCode: input.errorCode, failedAtMs: input.failedAtMs};
      record.lease = null;
      record.nextDueAtMs =
        record.schedule.kind === 'weekly' ? nextDueAfter(record.schedule, input.failedAtMs) : null;
      record.updatedAtMs = input.failedAtMs;
      await this.writeEnvelope(envelope);
    });
  }

  cancel(errandId: string): Promise<void> {
    return this.enqueue(async () => {
      const envelope = await this.readEnvelope();
      const record = envelope.records[errandId];
      if (!record) {
        return;
      }
      const nowMs = this.clock.now();
      record.status = 'cancelled';
      record.lease = null;
      record.nextDueAtMs = null;
      record.updatedAtMs = nowMs;
      await this.writeEnvelope(envelope);
    });
  }

  updateDraft(errandId: string, draft: ErrandDraft): Promise<Errand> {
    return this.enqueue(async () => {
      const envelope = await this.readEnvelope();
      const record = envelope.records[errandId];
      if (!record) {
        throw new Error('errand_not_found');
      }
      const nowMs = this.clock.now();
      record.title = draft.title;
      record.schedule = draft.schedule;
      record.status = 'scheduled';
      record.lease = null;
      record.nextDueAtMs = nextDueAfter(draft.schedule, nowMs);
      record.updatedAtMs = nowMs;
      await this.writeEnvelope(envelope);
      return toErrand(record);
    });
  }
}
