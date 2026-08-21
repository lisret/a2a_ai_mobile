// Private storage keys owned by the runtime configuration foundation.
// Existing shared storage files are never modified to introduce these.
export const RUNTIME_STORAGE_KEYS = {
  RUNTIME_CONFIG_V1: '@nono:runtime_config:v1',
  OPERATE_SESSIONS_V1: '@nono:operate_sessions:v1',
  RUNTIME_CONFIG_MIGRATION_V1: '@nono:runtime_config_migration:v1',
  CREDENTIAL_RETIREMENTS_V1: '@nono:credential_retirements:v1',
} as const;

export type RuntimeStorageKey =
  (typeof RUNTIME_STORAGE_KEYS)[keyof typeof RUNTIME_STORAGE_KEYS];

export interface RuntimeAsyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
