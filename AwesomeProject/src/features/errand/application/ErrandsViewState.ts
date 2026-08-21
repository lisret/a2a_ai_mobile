// UI-neutral, sanitized errand projection. Never carries a lease ID, worker
// ID, raw tool error, image, or credential.
import type {Errand} from '@core/engine/errand/domain/Errand';

export type ErrandViewStatus = 'scheduled' | 'due' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ErrandItemViewState {
  readonly id: string;
  readonly title: string;
  readonly errandType: 'once' | 'schedule';
  readonly status: ErrandViewStatus;
  readonly needsConfirmation: boolean;
  readonly nextDueAtMs: number | null;
  readonly lastErrorCode: string | null;
}

export interface ErrandsViewState {
  readonly enabled: boolean;
  readonly items: readonly ErrandItemViewState[];
}

function toItemViewState(errand: Errand): ErrandItemViewState {
  const needsConfirmation = errand.status === 'needs_attention';
  const status: ErrandViewStatus = errand.status === 'needs_attention' ? 'failed' : errand.status;
  return {
    id: errand.id,
    title: errand.title,
    errandType: errand.schedule.kind === 'weekly' ? 'schedule' : 'once',
    status,
    needsConfirmation,
    nextDueAtMs: errand.nextDueAtMs,
    lastErrorCode: errand.lastFailure?.errorCode ?? null,
  };
}

export function buildErrandsViewState(enabled: boolean, errands: readonly Errand[]): ErrandsViewState {
  return {enabled, items: errands.map(toItemViewState)};
}
