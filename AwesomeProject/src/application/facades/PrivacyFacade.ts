import type {
  PrivacyApplicationPort,
  PrivacyFacade,
  PrivacyViewState,
} from './UiRuntimeContracts';

/** Ref-free guard failure whose message is the stable blocker code. */
class PrivacyGuardError extends Error {
  readonly code: 'visual_agent_not_ready';
  constructor() {
    super('visual_agent_not_ready');
    this.name = 'PrivacyGuardError';
    this.code = 'visual_agent_not_ready';
  }
}

export class DefaultPrivacyFacade implements PrivacyFacade {
  constructor(private readonly port: PrivacyApplicationPort) {}

  getViewState(): Promise<PrivacyViewState> {
    return this.port.read();
  }

  setMemoryEnabled(enabled: boolean): Promise<PrivacyViewState> {
    return this.port.setMemoryEnabled(enabled);
  }

  async setMemoryLocation(
    location: 'device' | 'visual_agent',
  ): Promise<PrivacyViewState> {
    if (location === 'visual_agent') {
      const state = await this.port.read();
      if (!state.canUseVisualAgentMemory) {
        throw new PrivacyGuardError();
      }
    }
    return this.port.setMemoryLocation(location);
  }

  forgetAllPreferences(): Promise<PrivacyViewState> {
    return this.port.forgetAllPreferences();
  }
}
