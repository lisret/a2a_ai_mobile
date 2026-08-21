import type {Clock, IdGenerator} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {
  ConfirmedPreferenceDraft,
  Preference,
  PreferenceKind,
} from '@core/engine/preference/domain/Preference';
import type {PreferenceRepository} from '@core/engine/preference/ports/PreferenceRepository';

// Minimal AsyncStorage surface. Injected so the repository stays testable and
// never imports React Native directly.
export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const PREFERENCE_STORAGE_KEYS = {
  PREFERENCES_V1: '@nono:preferences:v1',
  LEGACY_MEMORIES: '@nono:memories',
} as const;

interface PreferenceEnvelopeV1 {
  readonly version: 1;
  readonly items: readonly Preference[];
}

interface LegacyMemoryRecord {
  readonly id?: unknown;
  readonly kind?: unknown;
  readonly title?: unknown;
  readonly body?: unknown;
}

const isPreferenceKind = (value: unknown): value is PreferenceKind =>
  value === 'name' || value === 'preference';

// On-device preference store. A single promise-tail critical section serializes
// every read-modify-write so concurrent mutations can never interleave or lose
// data. Legacy `@nono:memories` name/preference records migrate forward once;
// the legacy key is never written back.
export class AsyncStoragePreferenceRepository implements PreferenceRepository {
  private queue: Promise<unknown> = Promise.resolve();
  private cache: Preference[] | null = null;

  constructor(
    private readonly storage: AsyncStorageLike,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  list(): Promise<readonly Preference[]> {
    return this.enqueue(async () => {
      const items = await this.loadItems();
      return items.map(clone);
    });
  }

  upsertConfirmed(draft: ConfirmedPreferenceDraft): Promise<Preference> {
    return this.enqueue(async () => {
      const items = [...(await this.loadItems())];
      const now = this.clock.now();
      const index = items.findIndex(
        item => item.kind === draft.kind && item.title === draft.title,
      );
      let result: Preference;
      if (index === -1) {
        result = {
          id: this.ids.next(),
          kind: draft.kind,
          title: draft.title,
          summary: draft.summary,
          createdAtEpochMs: now,
          updatedAtEpochMs: now,
        };
        items.push(result);
      } else {
        result = {
          ...items[index],
          summary: draft.summary,
          updatedAtEpochMs: now,
        };
        items[index] = result;
      }
      await this.write(items);
      return clone(result);
    });
  }

  delete(id: string): Promise<void> {
    return this.enqueue(async () => {
      const items = (await this.loadItems()).filter(item => item.id !== id);
      await this.write(items);
    });
  }

  forgetAll(): Promise<void> {
    return this.enqueue(async () => {
      await this.write([]);
    });
  }

  private async loadItems(): Promise<Preference[]> {
    if (this.cache) {
      return this.cache;
    }
    const raw = await this.readKey(PREFERENCE_STORAGE_KEYS.PREFERENCES_V1);
    if (raw !== null) {
      this.cache = parseEnvelope(raw);
      return this.cache;
    }
    const migrated = await this.migrateLegacy();
    this.cache = migrated;
    if (migrated.length > 0) {
      // Persist forward into the current schema without ever touching the
      // legacy key, so the migration is idempotent on the next cold start.
      await this.persist(migrated);
    }
    return this.cache;
  }

  private async migrateLegacy(): Promise<Preference[]> {
    const raw = await this.readKey(PREFERENCE_STORAGE_KEYS.LEGACY_MEMORIES);
    if (raw === null) {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) {
      return [];
    }
    const now = this.clock.now();
    const migrated: Preference[] = [];
    for (const entry of parsed as LegacyMemoryRecord[]) {
      if (!entry || !isPreferenceKind(entry.kind)) {
        continue;
      }
      const title = typeof entry.title === 'string' ? entry.title : '';
      const summary = typeof entry.body === 'string' ? entry.body : '';
      migrated.push({
        id: typeof entry.id === 'string' ? entry.id : this.ids.next(),
        kind: entry.kind,
        title,
        summary,
        createdAtEpochMs: now,
        updatedAtEpochMs: now,
      });
    }
    return migrated;
  }

  private async readKey(key: string): Promise<string | null> {
    try {
      return await this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  private async write(items: Preference[]): Promise<void> {
    this.cache = items;
    await this.persist(items);
  }

  private async persist(items: readonly Preference[]): Promise<void> {
    const envelope: PreferenceEnvelopeV1 = {version: 1, items};
    await this.storage.setItem(
      PREFERENCE_STORAGE_KEYS.PREFERENCES_V1,
      JSON.stringify(envelope),
    );
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function parseEnvelope(raw: string): Preference[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('repository_corrupt');
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    (parsed as PreferenceEnvelopeV1).version !== 1 ||
    !Array.isArray((parsed as PreferenceEnvelopeV1).items)
  ) {
    throw new Error('repository_corrupt');
  }
  return [...(parsed as PreferenceEnvelopeV1).items];
}

function clone(preference: Preference): Preference {
  return {...preference};
}
