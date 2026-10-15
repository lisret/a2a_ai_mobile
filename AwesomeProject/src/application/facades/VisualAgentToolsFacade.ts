import type {
  VisualAgentProfileDraftInput,
  VisualAgentToolsApplicationPort,
  VisualAgentToolsFacade,
  VisualAgentToolsViewState,
} from './UiRuntimeContracts';

export class DefaultVisualAgentToolsFacade implements VisualAgentToolsFacade {
  constructor(private readonly port: VisualAgentToolsApplicationPort) {}

  getViewState(): Promise<VisualAgentToolsViewState> {
    return this.port.read();
  }

  setEnabled(
    enabled: boolean,
    expectedRevision: number,
  ): Promise<VisualAgentToolsViewState> {
    return this.port.setEnabled(enabled, expectedRevision);
  }

  saveProfile(
    profile: VisualAgentProfileDraftInput,
    expectedRevision: number,
  ): Promise<VisualAgentToolsViewState> {
    return this.port.saveProfile(profile, expectedRevision);
  }

  deleteProfile(
    profileId: string,
    expectedRevision: number,
  ): Promise<VisualAgentToolsViewState> {
    return this.port.deleteProfile(profileId, expectedRevision);
  }

  setActiveProfile(
    profileId: string,
    expectedRevision: number,
  ): Promise<VisualAgentToolsViewState> {
    return this.port.setActiveProfile(profileId, expectedRevision);
  }

  refreshProfile(profileId: string): Promise<VisualAgentToolsViewState> {
    return this.port.refreshProfile(profileId);
  }
}
