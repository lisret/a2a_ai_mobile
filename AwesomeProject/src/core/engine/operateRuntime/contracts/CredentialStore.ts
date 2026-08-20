// Frozen V1 runtime contract. Interface only: no persistence or native module here.
// Plaintext is transient at the method boundary; only opaque `secretRef` values are stored.
export interface CredentialStore {
  isAvailable(): Promise<boolean>;
  put(secretRef: string, plaintext: string): Promise<void>;
  get(secretRef: string): Promise<string | null>;
  delete(secretRef: string): Promise<void>;
}
