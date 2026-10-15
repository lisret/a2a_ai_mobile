// Errand domain entity, schedule, lease, and status contracts. Time is always
// epoch milliseconds plus an explicit timeZoneOffsetMinutes; never wall-clock.

export type ErrandSchedule =
  | {
      readonly kind: 'once';
      readonly dueAtMs: number;
      readonly timeZoneOffsetMinutes: number;
    }
  | {
      readonly kind: 'weekly';
      // ISO-8601 weekday numbering: 1=Monday .. 7=Sunday.
      readonly weekday: number;
      readonly hour: number;
      readonly minute: number;
      readonly timeZoneOffsetMinutes: number;
    };

export type ErrandStatus =
  | 'scheduled'
  | 'due'
  | 'running'
  | 'completed'
  | 'failed'
  | 'needs_attention'
  | 'cancelled';

export interface ErrandLease {
  readonly leaseId: string;
  readonly workerId: string;
  readonly claimedAtMs: number;
}

export interface ErrandFailure {
  readonly errorCode: string;
  readonly failedAtMs: number;
}

export interface Errand {
  readonly id: string;
  readonly title: string;
  readonly schedule: ErrandSchedule;
  readonly status: ErrandStatus;
  readonly nextDueAtMs: number | null;
  readonly lease: ErrandLease | null;
  readonly lastFailure: ErrandFailure | null;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}
