import type {ConfirmedPreferenceDraft, Preference} from '../domain/Preference';

// One repository contract shared by the on-device store, the policy router, and
// the (Task 12) remote Visual Agent adapter. All four operations are async and
// never expose transport, credentials, or raw upstream errors.
export interface PreferenceRepository {
  list(): Promise<readonly Preference[]>;
  upsertConfirmed(draft: ConfirmedPreferenceDraft): Promise<Preference>;
  delete(id: string): Promise<void>;
  forgetAll(): Promise<void>;
}
