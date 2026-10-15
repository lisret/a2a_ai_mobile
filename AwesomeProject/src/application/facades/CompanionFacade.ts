import type {
  CompanionApplicationPort,
  CompanionFacade,
  CompanionTurnViewState,
  CompanionViewState,
} from './UiRuntimeContracts';
import type {PetIntent, PetIntentContext} from './PetIntent';

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

  /**
   * Forwards to the optional port method. A composition without a model-backed
   * intent service resolves `null` instead of throwing, so the host stays local.
   */
  suggestPetIntent(
    context: PetIntentContext,
    signal: AbortSignal,
  ): Promise<PetIntent | null> {
    const suggest = this.port.suggestPetIntent;
    if (typeof suggest !== 'function') {
      return Promise.resolve(null);
    }
    return suggest.call(this.port, context, signal);
  }
}
