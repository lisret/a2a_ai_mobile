// Serialized runtime configuration repository. One rejection-safe mutation queue
// implements atomic `compareAndActivate` and the profile/binding projection.
import type {CredentialStore} from '../contracts/CredentialStore';
import type {
  CredentialRetirementRepository,
  RuntimeConfigEnvelopeV1,
  RuntimeConfigRepository,
  RuntimeRouteConfigV1,
} from '../contracts/RuntimeConfigContracts';
import type {
  ModelBindingV1,
  ModelEndpointProfileV1,
} from '../model/ModelProviderContracts';
import {RuntimeConfigError} from './CredentialRetirementRepository';
import {
  RUNTIME_STORAGE_KEYS,
  type RuntimeAsyncStorage,
} from './RuntimeConfigStorageKeys';
import {
  EMPTY_ROUTE_CONFIG,
  assertNoForbiddenKeys,
  validateRuntimeRoute,
} from './RuntimeConfigValidation';

export interface RuntimeConfigMigrationRunner {
  run(): Promise<RuntimeConfigEnvelopeV1 | null>;
}

export interface CatalogCacheInvalidator {
  deleteProfile(profileId: string): Promise<void>;
}

export interface RuntimeConfigRepositoryDependencies {
  readonly storage: RuntimeAsyncStorage;
  readonly credentials: CredentialStore;
  readonly retirements: CredentialRetirementRepository;
  readonly now: () => number;
  readonly newId: () => string;
  readonly catalogCache?: CatalogCacheInvalidator;
  readonly migration?: RuntimeConfigMigrationRunner;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const deepFreeze = <T>(value: T): T => {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value) as T;
  }
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(value) as T;
  }
  return value;
};

const freezeEnvelope = (envelope: RuntimeConfigEnvelopeV1): RuntimeConfigEnvelopeV1 =>
  deepFreeze(clone(envelope));

export class AsyncStorageRuntimeConfigRepository
  implements RuntimeConfigRepository
{
  private queue: Promise<unknown> = Promise.resolve();
  private cached: RuntimeConfigEnvelopeV1 | null = null;

  constructor(private readonly deps: RuntimeConfigRepositoryDependencies) {}

  load(): Promise<RuntimeConfigEnvelopeV1> {
    return this.enqueue(async () => {
      const envelope = await this.readOrMigrate();
      return freezeEnvelope(envelope);
    });
  }

  mutateDraft(
    mutation: (draft: RuntimeRouteConfigV1) => RuntimeRouteConfigV1,
  ): Promise<RuntimeConfigEnvelopeV1> {
    return this.enqueue(async () => {
      const current = await this.readOrMigrate();
      const draft = mutation(clone(current.draft));
      const next: RuntimeConfigEnvelopeV1 = {
        ...current,
        draft: clone(draft),
      };
      await this.write(next);
      return freezeEnvelope(next);
    });
  }

  activateDraft(expectedRevision: number): Promise<RuntimeConfigEnvelopeV1> {
    return this.enqueue(async () => {
      const current = await this.readOrMigrate();
      this.assertRevision(current, expectedRevision);
      validateRuntimeRoute(current.draft);
      const active = clone(current.draft);
      const next: RuntimeConfigEnvelopeV1 = {
        schemaVersion: 1,
        revision: current.revision + 1,
        active,
        draft: clone(active),
      };
      await this.write(next);
      return freezeEnvelope(next);
    });
  }

  compareAndActivate(
    expectedRevision: number,
    mutation: (active: RuntimeRouteConfigV1) => RuntimeRouteConfigV1,
  ): Promise<RuntimeConfigEnvelopeV1> {
    return this.enqueue(async () => {
      const current = await this.readOrMigrate();
      this.assertRevision(current, expectedRevision);
      return this.applyActiveMutation(current, mutation);
    });
  }

  /** Single queued read-modify-write projection that ignores the caller revision. */
  private mutateActiveNow(
    mutation: (active: RuntimeRouteConfigV1) => RuntimeRouteConfigV1,
  ): Promise<RuntimeConfigEnvelopeV1> {
    return this.enqueue(async () => {
      const current = await this.readOrMigrate();
      return this.applyActiveMutation(current, mutation);
    });
  }

  private async applyActiveMutation(
    current: RuntimeConfigEnvelopeV1,
    mutation: (active: RuntimeRouteConfigV1) => RuntimeRouteConfigV1,
  ): Promise<RuntimeConfigEnvelopeV1> {
    const mutated = mutation(clone(current.active));
    validateRuntimeRoute(mutated);
    const active = clone(mutated);
    const next: RuntimeConfigEnvelopeV1 = {
      schemaVersion: 1,
      revision: current.revision + 1,
      active,
      draft: clone(active),
    };
    await this.write(next);
    return freezeEnvelope(next);
  }

  async listProfiles(): Promise<readonly ModelEndpointProfileV1[]> {
    const envelope = await this.load();
    return envelope.active.modelAPI.profiles;
  }

  async listBindings(): Promise<readonly ModelBindingV1[]> {
    const envelope = await this.load();
    return envelope.active.modelAPI.bindings;
  }

  async putProfile(
    profile: ModelEndpointProfileV1,
    plaintextCredential?: string,
  ): Promise<void> {
    const requiresCredential =
      profile.mode === 'custom'
        ? profile.custom.auth.kind !== 'none'
        : true;
    const plaintext =
      plaintextCredential && plaintextCredential.trim().length > 0
        ? plaintextCredential
        : undefined;

    if (plaintext && requiresCredential) {
      await this.putProfileWithCredential(profile, plaintext);
      return;
    }
    await this.projectProfile(profile);
    await this.deps.catalogCache?.deleteProfile(profile.id);
  }

  async putBinding(binding: ModelBindingV1): Promise<void> {
    await this.mutateActiveNow(active => ({
      ...active,
      modelAPI: {
        ...active.modelAPI,
        bindings: upsert(active.modelAPI.bindings, binding, item => item.id),
      },
    }));
  }

  async removeProfile(profileId: string): Promise<void> {
    const envelope = await this.load();
    const active = envelope.active;
    const inUse =
      active.modelAPI.bindings.some(binding => binding.profileId === profileId) ||
      envelope.draft.modelAPI.bindings.some(
        binding => binding.profileId === profileId,
      );
    if (inUse) {
      throw new RuntimeConfigError('model_profile_in_use');
    }
    const existing = active.modelAPI.profiles.find(item => item.id === profileId);
    const oldSecretRef = existing?.secretRef ?? null;
    if (oldSecretRef) {
      await this.deps.retirements.stage({
        retirementId: this.deps.newId(),
        oldSecretRef,
        replacementSecretRef: null,
        createdAtMs: this.deps.now(),
      });
    }
    // Never delete the old ref inline; a nonterminal session may still hold it.
    await this.mutateActiveNow(current => ({
      ...current,
      modelAPI: {
        ...current.modelAPI,
        profiles: current.modelAPI.profiles.filter(item => item.id !== profileId),
      },
    }));
    await this.deps.catalogCache?.deleteProfile(profileId);
  }

  private async putProfileWithCredential(
    profile: ModelEndpointProfileV1,
    plaintext: string,
  ): Promise<void> {
    const envelope = await this.load();
    const existing = envelope.active.modelAPI.profiles.find(
      item => item.id === profile.id,
    );
    const oldSecretRef = existing?.secretRef ?? null;
    const newSecretRef = `model:${profile.id}:${this.deps.newId()}`;
    const retirementId = this.deps.newId();

    // Durable stage before any secure write, so a crash never orphans a secret.
    await this.deps.retirements.stage({
      retirementId,
      oldSecretRef,
      replacementSecretRef: newSecretRef,
      createdAtMs: this.deps.now(),
    });

    try {
      await this.deps.credentials.put(newSecretRef, plaintext);
      const readback = await this.deps.credentials.get(newSecretRef);
      if (readback !== plaintext) {
        throw new RuntimeConfigError('runtime_config_credential_readback_failed');
      }
    } catch (error) {
      await this.rollbackNewSecret(newSecretRef, retirementId);
      throw error instanceof RuntimeConfigError
        ? error
        : new RuntimeConfigError('runtime_config_credential_write_failed');
    }

    const nextProfile: ModelEndpointProfileV1 = {
      ...profile,
      secretRef: newSecretRef,
      generation: (existing?.generation ?? 0) + 1,
    };

    try {
      await this.projectProfile(nextProfile);
    } catch (error) {
      await this.rollbackNewSecret(newSecretRef, retirementId);
      throw error;
    }

    await this.deps.retirements.commit(retirementId);
    await this.deps.catalogCache?.deleteProfile(profile.id);
  }

  private async projectProfile(profile: ModelEndpointProfileV1): Promise<void> {
    await this.mutateActiveNow(active => {
      const existing = active.modelAPI.profiles.find(item => item.id === profile.id);
      const nextProfile: ModelEndpointProfileV1 =
        existing && profile.generation <= existing.generation
          ? {...profile, generation: existing.generation + 1}
          : profile;
      return {
        ...active,
        modelAPI: {
          ...active.modelAPI,
          profiles: upsert(active.modelAPI.profiles, nextProfile, item => item.id),
        },
      };
    });
  }

  private async rollbackNewSecret(
    newSecretRef: string,
    retirementId: string,
  ): Promise<void> {
    try {
      await this.deps.credentials.delete(newSecretRef);
      const gone = await this.deps.credentials.get(newSecretRef);
      if (gone === null) {
        await this.deps.retirements.rollback(retirementId);
      }
      // If deletion/readback failed, leave the staged record for cold-start GC.
    } catch {
      // Leave the staged record for Task 6 crash recovery.
    }
  }

  private assertRevision(
    envelope: RuntimeConfigEnvelopeV1,
    expectedRevision: number,
  ): void {
    if (envelope.revision !== expectedRevision) {
      throw new RuntimeConfigError('runtime_config_conflict');
    }
  }

  private async readOrMigrate(): Promise<RuntimeConfigEnvelopeV1> {
    if (this.cached) {
      return this.cached;
    }
    let raw: string | null;
    try {
      raw = await this.deps.storage.getItem(RUNTIME_STORAGE_KEYS.RUNTIME_CONFIG_V1);
    } catch {
      raw = null;
    }
    if (raw) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new RuntimeConfigError('runtime_config_corrupt');
      }
      assertNoForbiddenKeys(parsed);
      const envelope = parsed as RuntimeConfigEnvelopeV1;
      if (envelope.schemaVersion !== 1 || typeof envelope.revision !== 'number') {
        throw new RuntimeConfigError('runtime_config_corrupt');
      }
      this.cached = envelope;
      return envelope;
    }
    if (this.deps.migration) {
      const migrated = await this.deps.migration.run();
      if (migrated) {
        this.cached = migrated;
        return migrated;
      }
    }
    const empty: RuntimeConfigEnvelopeV1 = {
      schemaVersion: 1,
      revision: 0,
      active: clone(EMPTY_ROUTE_CONFIG),
      draft: clone(EMPTY_ROUTE_CONFIG),
    };
    this.cached = empty;
    return empty;
  }

  private async write(envelope: RuntimeConfigEnvelopeV1): Promise<void> {
    await this.deps.storage.setItem(
      RUNTIME_STORAGE_KEYS.RUNTIME_CONFIG_V1,
      JSON.stringify(envelope),
    );
    this.cached = envelope;
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

function upsert<T>(list: readonly T[], item: T, keyOf: (value: T) => string): T[] {
  const key = keyOf(item);
  const index = list.findIndex(existing => keyOf(existing) === key);
  if (index === -1) {
    return [...list, item];
  }
  const next = [...list];
  next[index] = item;
  return next;
}
