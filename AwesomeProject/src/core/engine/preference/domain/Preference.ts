// Confirmed user preferences and names. This domain never stores screenshots,
// credentials, action history, or errand records; those belong to other
// capability domains and must never leak into a preference record.
export type PreferenceKind = 'name' | 'preference';

export interface Preference {
  readonly id: string;
  readonly kind: PreferenceKind;
  readonly title: string;
  readonly summary: string;
  readonly createdAtEpochMs: number;
  readonly updatedAtEpochMs: number;
}

// A single explicitly confirmed preference to persist. Confirmation always
// happens before a draft reaches the repository.
export interface ConfirmedPreferenceDraft {
  readonly kind: PreferenceKind;
  readonly title: string;
  readonly summary: string;
}
