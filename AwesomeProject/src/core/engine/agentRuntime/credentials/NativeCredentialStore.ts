import { NativeModules } from 'react-native';

import type { CredentialStore } from '../../operateRuntime/contracts/CredentialStore';

interface SecureCredentialModule {
  isAvailable(): Promise<boolean>;
  put(secretRef: string, plaintext: string): Promise<void>;
  get(secretRef: string): Promise<string | null>;
  delete(secretRef: string): Promise<void>;
}

const SECRET_REF_PATTERN = /^[a-z0-9][a-z0-9:._-]{2,127}$/i;

function invalidSecretRef(): Error {
  return new Error('E_INVALID_SECRET_REF');
}

function unavailable(): Error {
  return new Error('E_KEYSTORE_UNAVAILABLE');
}

export class NativeCredentialStore implements CredentialStore {
  private readonly nativeModule: SecureCredentialModule | undefined;

  constructor() {
    this.nativeModule = NativeModules.SecureCredentialModule as
      | SecureCredentialModule
      | undefined;
  }

  async isAvailable(): Promise<boolean> {
    return this.requireNativeModule().isAvailable();
  }

  async put(secretRef: string, plaintext: string): Promise<void> {
    this.validateSecretRef(secretRef);
    if (plaintext.trim().length === 0) {
      throw new Error('E_EMPTY_PLAINTEXT');
    }
    await this.requireNativeModule().put(secretRef, plaintext);
  }

  async get(secretRef: string): Promise<string | null> {
    this.validateSecretRef(secretRef);
    return this.requireNativeModule().get(secretRef);
  }

  async delete(secretRef: string): Promise<void> {
    this.validateSecretRef(secretRef);
    await this.requireNativeModule().delete(secretRef);
  }

  private requireNativeModule(): SecureCredentialModule {
    if (this.nativeModule === undefined) {
      throw unavailable();
    }
    return this.nativeModule;
  }

  private validateSecretRef(secretRef: string): void {
    if (!SECRET_REF_PATTERN.test(secretRef)) {
      throw invalidSecretRef();
    }
  }
}
