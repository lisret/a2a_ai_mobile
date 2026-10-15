import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import type {IdGenerator} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {CompanionService} from '@core/engine/companion/application/CompanionService';
import type {
  CompanionTurn,
  ConfirmedCompanionAction,
} from '@core/engine/companion/domain/CompanionTypes';
import type {PreferenceRepository} from '@core/engine/preference/ports/PreferenceRepository';
import type {
  CompanionPhase,
  CompanionTurnViewState,
  CompanionViewState,
} from './CompanionViewState';

// Narrow port into the errand domain (owned by Task 6). Companion depends on the
// abstraction, never the errand implementation, so this feature stays decoupled
// and never imports errand internals or a task runner.
export interface ErrandProposalPort {
  create(draft: {title: string; dueText: string}): Promise<{id: string}>;
}

export interface CompanionFacadeDeps {
  readonly service: CompanionService;
  readonly preferences: PreferenceRepository;
  readonly errandProposals: ErrandProposalPort;
  readonly ids: IdGenerator;
}

const RECENT_REPLY_LIMIT = 5;

// Owns UI phase, the immutable turn snapshot, and the in-memory
// turnId → proposalId mapping. Preference/errand proposals are routed only after
// explicit confirmation; the `operate` intent has no persisted handoff here.
export class CompanionFacade {
  private readonly conversationId: string;
  private readonly proposalByTurn = new Map<string, string>();
  private turns: CompanionTurnViewState[] = [];
  private phase: CompanionPhase = 'idle';
  private errorCode?: string;

  constructor(private readonly deps: CompanionFacadeDeps) {
    this.conversationId = deps.ids.next();
  }

  getState(): CompanionViewState {
    return {
      phase: this.phase,
      turns: this.turns.map(turn => ({...turn})),
      errorCode: this.errorCode,
    };
  }

  async submitTranscript(text: string): Promise<CompanionTurnViewState> {
    this.phase = 'thinking';
    this.errorCode = undefined;
    try {
      const turn = await this.deps.service.submit({
        conversationId: this.conversationId,
        text,
        recentReplies: this.recentReplies(),
      });
      const view = this.toViewState(turn);
      if (turn.proposal) {
        this.proposalByTurn.set(turn.id, turn.proposal.id);
      }
      this.turns = [...this.turns, view];
      this.phase = 'ready';
      return view;
    } catch (error) {
      this.phase = 'error';
      this.errorCode =
        error instanceof CapabilityError ? error.code : 'companion_failed';
      throw error;
    }
  }

  async confirmProposal(turnId: string): Promise<void> {
    const proposalId = this.proposalByTurn.get(turnId);
    if (proposalId === undefined) {
      throw new CapabilityError('proposal_not_found');
    }
    const action = await this.deps.service.confirm(proposalId);
    this.proposalByTurn.delete(turnId);
    await this.route(action);
  }

  dismissTurn(turnId: string): void {
    const proposalId = this.proposalByTurn.get(turnId);
    if (proposalId === undefined) {
      return;
    }
    this.deps.service.dismiss(proposalId);
    this.proposalByTurn.delete(turnId);
  }

  private async route(action: ConfirmedCompanionAction): Promise<void> {
    if (action.kind === 'preference') {
      await this.deps.preferences.upsertConfirmed({
        kind: 'preference',
        title: action.title,
        summary: action.summary,
      });
      return;
    }
    await this.deps.errandProposals.create({
      title: action.title,
      dueText: action.dueText,
    });
  }

  private toViewState(turn: CompanionTurn): CompanionTurnViewState {
    return {
      id: turn.id,
      intent: turn.intent,
      reply: turn.reply,
      hasProposal: turn.proposal !== undefined,
      proposalKind: turn.proposal?.action.kind,
    };
  }

  private recentReplies(): string[] {
    return this.turns.slice(-RECENT_REPLY_LIMIT).map(turn => turn.reply);
  }
}
