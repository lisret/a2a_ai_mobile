// Durable retirement ledger of opaque credential refs. Never reads or deletes a
// credential. A staged record precedes a config CAS; commit follows it.
import type {
  CredentialRetirementRecordV1,
  CredentialRetirementRepository,
} from '../contracts/RuntimeConfigContracts';
import {
  RUNTIME_STORAGE_KEYS,
  type RuntimeAsyncStorage,
} from './RuntimeConfigStorageKeys';

export class RuntimeConfigError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'RuntimeConfigError';
    this.code = code;
  }
}

type Ledger = Record<string, CredentialRetirementRecordV1>;

export class AsyncStorageCredentialRetirementRepository
  implements CredentialRetirementRepository
{
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly storage: RuntimeAsyncStorage,
    private readonly now: () => number,
  ) {}

  stage(
    input: Omit<CredentialRetirementRecordV1, 'schemaVersion' | 'state'>,
  ): Promise<void> {
    if (input.oldSecretRef === null && input.replacementSecretRef === null) {
      return Promise.reject(new RuntimeConfigError('runtime_config_invalid'));
    }
    if (!input.retirementId) {
      return Promise.reject(new RuntimeConfigError('runtime_config_invalid'));
    }
    return this.enqueue(async ledger => {
      ledger[input.retirementId] = {
        schemaVersion: 1,
        retirementId: input.retirementId,
        state: 'staged',
        oldSecretRef: input.oldSecretRef,
        replacementSecretRef: input.replacementSecretRef,
        createdAtMs: input.createdAtMs || this.now(),
      };
      return ledger;
    });
  }

  commit(retirementId: string): Promise<void> {
    return this.enqueue(async ledger => {
      const record = ledger[retirementId];
      if (!record) {
        throw new RuntimeConfigError('runtime_config_retirement_not_found');
      }
      ledger[retirementId] = {...record, state: 'committed'};
      return ledger;
    });
  }

  rollback(retirementId: string): Promise<void> {
    return this.enqueue(async ledger => {
      delete ledger[retirementId];
      return ledger;
    });
  }

  complete(retirementId: string): Promise<void> {
    return this.enqueue(async ledger => {
      delete ledger[retirementId];
      return ledger;
    });
  }

  async list(): Promise<readonly CredentialRetirementRecordV1[]> {
    const ledger = await this.read();
    return Object.values(ledger);
  }

  private enqueue(
    mutation: (ledger: Ledger) => Promise<Ledger>,
  ): Promise<void> {
    const run = this.queue.then(async () => {
      const ledger = await this.read();
      const next = await mutation(ledger);
      await this.storage.setItem(
        RUNTIME_STORAGE_KEYS.CREDENTIAL_RETIREMENTS_V1,
        JSON.stringify(next),
      );
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async read(): Promise<Ledger> {
    let raw: string | null;
    try {
      raw = await this.storage.getItem(
        RUNTIME_STORAGE_KEYS.CREDENTIAL_RETIREMENTS_V1,
      );
    } catch {
      return {};
    }
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed !== null && typeof parsed === 'object'
        ? (parsed as Ledger)
        : {};
    } catch {
      return {};
    }
  }
}
