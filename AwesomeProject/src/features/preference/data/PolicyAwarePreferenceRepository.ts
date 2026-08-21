import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import type {
  CapabilityConfigPort,
  CapabilityConfigSnapshot,
} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {
  ConfirmedPreferenceDraft,
  Preference,
} from '@core/engine/preference/domain/Preference';
import type {PreferenceRepository} from '@core/engine/preference/ports/PreferenceRepository';

export interface PolicyAwarePreferenceRepositoryDeps {
  readonly local: PreferenceRepository;
  readonly remote: PreferenceRepository;
  readonly config: CapabilityConfigPort;
}

// Routes each operation to the device or Visual Agent store based on the current
// privacy policy, read fresh before every call. Disabled memory reads empty and
// blocks mutations; Visual Agent memory fails closed with no silent fallback to
// the device store when the selected profile is unavailable.
export class PolicyAwarePreferenceRepository implements PreferenceRepository {
  constructor(private readonly deps: PolicyAwarePreferenceRepositoryDeps) {}

  async list(): Promise<readonly Preference[]> {
    const snapshot = await this.deps.config.read();
    if (!snapshot.privacy.memoryEnabled) {
      return [];
    }
    if (snapshot.privacy.memoryLocation === 'device') {
      return this.deps.local.list();
    }
    this.assertVisualAgentReady(snapshot);
    return this.remote(() => this.deps.remote.list());
  }

  async upsertConfirmed(draft: ConfirmedPreferenceDraft): Promise<Preference> {
    const target = await this.resolveMutationTarget();
    if (target === 'local') {
      return this.deps.local.upsertConfirmed(draft);
    }
    return this.remote(() => this.deps.remote.upsertConfirmed(draft));
  }

  async delete(id: string): Promise<void> {
    const target = await this.resolveMutationTarget();
    if (target === 'local') {
      return this.deps.local.delete(id);
    }
    return this.remote(() => this.deps.remote.delete(id));
  }

  async forgetAll(): Promise<void> {
    const target = await this.resolveMutationTarget();
    if (target === 'local') {
      return this.deps.local.forgetAll();
    }
    return this.remote(() => this.deps.remote.forgetAll());
  }

  private async resolveMutationTarget(): Promise<'local' | 'remote'> {
    const snapshot = await this.deps.config.read();
    if (!snapshot.privacy.memoryEnabled) {
      throw new CapabilityError('privacy_blocked');
    }
    if (snapshot.privacy.memoryLocation === 'device') {
      return 'local';
    }
    this.assertVisualAgentReady(snapshot);
    return 'remote';
  }

  private assertVisualAgentReady(snapshot: CapabilityConfigSnapshot): void {
    const profileId = snapshot.privacy.memoryProfileId;
    const ready =
      snapshot.visualAgent.enabled &&
      profileId !== null &&
      snapshot.visualAgent.profiles.some(
        profile => profile.profileId === profileId && profile.enabled,
      );
    if (!ready) {
      throw new CapabilityError('preference_remote_unavailable');
    }
  }

  private async remote<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CapabilityError) {
        throw error;
      }
      throw new CapabilityError('preference_remote_unavailable');
    }
  }
}
