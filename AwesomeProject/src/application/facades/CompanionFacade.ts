import type {
  CompanionApplicationPort,
  CompanionFacade,
  CompanionTurnViewState,
  CompanionViewState,
} from './UiRuntimeContracts';

export class DefaultCompanionFacade implements CompanionFacade {
  constructor(private readonly port: CompanionApplicationPort) {}

  getViewState(): Promise<CompanionViewState> {
    return this.port.getState();
  }

  submitTranscript(text: string): Promise<CompanionTurnViewState> {
    return this.port.submitTranscript(text);
  }

  confirmProposal(turnId: string): Promise<void> {
    return this.port.confirmProposal(turnId);
  }

  dismissTurn(turnId: string): Promise<void> {
    return this.port.dismissTurn(turnId);
  }
}
