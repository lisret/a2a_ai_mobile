// Durable, secret-free catalog cache. Applies freshness/stale windows on read.
import type {
  ModelCatalogCache,
  ProviderModelCatalogResult,
} from './ModelProviderContracts';

export const MODEL_CATALOG_CACHE_KEY = '@nono:model_catalog_cache:v1';

const READY_FRESH_MS = 15 * 60 * 1000;
const READY_STALE_MAX_MS = 24 * 60 * 60 * 1000;
const EMPTY_TTL_MS = 60 * 1000;

export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface CacheEntry {
  readonly profileId: string;
  readonly writtenAtMs: number;
  readonly result: ProviderModelCatalogResult;
}

type CacheFile = Readonly<Record<string, CacheEntry>>;

const isDurable = (result: ProviderModelCatalogResult): boolean =>
  result.status === 'ready' || result.status === 'empty';

export class AsyncStorageModelCatalogCache implements ModelCatalogCache {
  constructor(
    private readonly storage: AsyncStorageLike,
    private readonly now: () => number,
  ) {}

  async read(cacheKey: string): Promise<ProviderModelCatalogResult | null> {
    const file = await this.readFile();
    const entry = file[cacheKey];
    if (!entry) {
      return null;
    }
    const age = this.now() - entry.writtenAtMs;
    if (entry.result.status === 'ready') {
      if (age > READY_STALE_MAX_MS) {
        return null;
      }
      return {...entry.result, source: 'cache', stale: age > READY_FRESH_MS};
    }
    if (entry.result.status === 'empty') {
      return age > EMPTY_TTL_MS ? null : entry.result;
    }
    return null;
  }

  async write(
    cacheKey: string,
    value: ProviderModelCatalogResult,
  ): Promise<void> {
    if (!isDurable(value)) {
      return;
    }
    const file = {...(await this.readFile())};
    const profileId = cacheKey.split(':')[0] ?? cacheKey;
    file[cacheKey] = {profileId, writtenAtMs: this.now(), result: value};
    await this.storage.setItem(MODEL_CATALOG_CACHE_KEY, JSON.stringify(file));
  }

  async deleteProfile(profileId: string): Promise<void> {
    const file = await this.readFile();
    const next: Record<string, CacheEntry> = {};
    let changed = false;
    for (const [key, entry] of Object.entries(file)) {
      if (entry.profileId === profileId) {
        changed = true;
        continue;
      }
      next[key] = entry;
    }
    if (changed) {
      await this.storage.setItem(MODEL_CATALOG_CACHE_KEY, JSON.stringify(next));
    }
  }

  private async readFile(): Promise<CacheFile> {
    let raw: string | null;
    try {
      raw = await this.storage.getItem(MODEL_CATALOG_CACHE_KEY);
    } catch {
      return {};
    }
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed !== null && typeof parsed === 'object'
        ? (parsed as CacheFile)
        : {};
    } catch {
      return {};
    }
  }
}
