import type {CompanionIntent} from '@core/engine/companion/domain/CompanionTypes';

export type CompanionPhase =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'ready'
  | 'error';

// UI-neutral projection of a single turn. It exposes only whether a proposal is
// pending and its kind — never the proposal id, the confirmed action payload,
// screenshots, credentials, or raw model output.
export interface CompanionTurnViewState {
  readonly id: string;
  readonly intent: CompanionIntent;
  readonly reply: string;
  readonly hasProposal: boolean;
  readonly proposalKind?: 'preference' | 'errand';
}

export interface CompanionViewState {
  readonly phase: CompanionPhase;
  readonly turns: readonly CompanionTurnViewState[];
  readonly errorCode?: string;
}
