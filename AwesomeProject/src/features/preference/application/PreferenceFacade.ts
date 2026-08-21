import type {
  CapabilityConfigPort,
  CapabilityConfigSnapshot,
} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {PreferenceRepository} from '@core/engine/preference/ports/PreferenceRepository';

// UI-neutral privacy snapshot. It exposes only where memory lives and whether
// Visual Agent memory can be used — never tool credentials, bridge URLs, or raw
// runtime errors.
export interface PrivacyViewState {
  readonly memoryEnabled: boolean;
  readonly memoryLocation: 'device' | 'visual_agent';
  readonly memoryProfileId: string | null;
  readonly canUseVisualAgentMemory: boolean;
}

export interface PreferenceFacadeDeps {
  readonly config: CapabilityConfigPort;
  readonly repository: PreferenceRepository;
}

export class PreferenceFacade {
  constructor(private readonly deps: PreferenceFacadeDeps) {}

  async read(): Promise<PrivacyViewState> {
    return project(await this.deps.config.read());
  }

  async setMemoryEnabled(enabled: boolean): Promise<PrivacyViewState> {
    return this.mutatePrivacy(privacy => ({...privacy, memoryEnabled: enabled}));
  }

  async setMemoryLocation(
    location: 'device' | 'visual_agent',
  ): Promise<PrivacyViewState> {
    return this.mutatePrivacy(privacy => ({...privacy, memoryLocation: location}));
  }

  async forgetAllPreferences(): Promise<void> {
    await this.deps.repository.forgetAll();
  }

  private async mutatePrivacy(
    mutate: (
      privacy: CapabilityConfigSnapshot['privacy'],
    ) => CapabilityConfigSnapshot['privacy'],
  ): Promise<PrivacyViewState> {
    const snapshot = await this.deps.config.read();
    const next = await this.deps.config.compareAndSet(snapshot.revision, {
      capabilities: snapshot.capabilities,
      privacy: mutate(snapshot.privacy),
      visualAgent: snapshot.visualAgent,
    });
    return project(next);
  }
}

function project(snapshot: CapabilityConfigSnapshot): PrivacyViewState {
  const profileId = snapshot.privacy.memoryProfileId;
  const canUseVisualAgentMemory =
    snapshot.visualAgent.enabled &&
    profileId !== null &&
    snapshot.visualAgent.profiles.some(
      profile => profile.profileId === profileId && profile.enabled,
    );
  return {
    memoryEnabled: snapshot.privacy.memoryEnabled,
    memoryLocation: snapshot.privacy.memoryLocation,
    memoryProfileId: profileId,
    canUseVisualAgentMemory,
  };
}
