// Atomic errand storage port. Claim, reclaim, complete, and fail are always
// serialized by the implementation; stale/expired lease writes must reject.
import type {Errand, ErrandLease, ErrandSchedule} from '../domain/Errand';

export interface ErrandDraft {
  readonly title: string;
  readonly schedule: ErrandSchedule;
}

export interface ErrandClaim {
  readonly errand: Errand;
  readonly lease: ErrandLease;
}

export interface ErrandCompleteInput {
  readonly errandId: string;
  readonly leaseId: string;
  readonly completedAtMs: number;
}

export interface ErrandFailInput {
  readonly errandId: string;
  readonly leaseId: string;
  readonly errorCode: string;
  readonly failedAtMs: number;
}

export interface ErrandRepository {
  create(draft: ErrandDraft): Promise<Errand>;
  list(): Promise<readonly Errand[]>;
  // Claims at most one due, unleased-or-expired errand per call.
  claimDue(workerId: string, nowMs: number): Promise<readonly ErrandClaim[]>;
  complete(input: ErrandCompleteInput): Promise<void>;
  fail(input: ErrandFailInput): Promise<void>;
  cancel(errandId: string): Promise<void>;
  updateDraft(errandId: string, draft: ErrandDraft): Promise<Errand>;
}
