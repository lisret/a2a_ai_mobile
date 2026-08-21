import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import {projectCompanionRequest} from '@core/engine/capabilities/shared/CapabilityPrivacy';
import type {Clock, IdGenerator} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {PreferenceRepository} from '@core/engine/preference/ports/PreferenceRepository';
import type {
  CompanionModelOutput,
  CompanionModelPort,
} from '../ports/CompanionModelPort';
import type {
  CompanionProposal,
  CompanionSubmission,
  CompanionTurn,
  ConfirmedCompanionAction,
} from '../domain/CompanionTypes';

export interface CompanionServiceDeps {
  readonly model: CompanionModelPort;
  readonly preferences: PreferenceRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

// Intents that may carry a persisted, confirmable proposal. `operate` is
// deliberately excluded: it is only a routing hint and never persisted here.
const PROPOSAL_INTENTS = new Set(['preference', 'errand']);

export class CompanionService {
  private readonly pending = new Map<string, CompanionProposal>();

  constructor(private readonly deps: CompanionServiceDeps) {}

  async submit(submission: CompanionSubmission): Promise<CompanionTurn> {
    const confirmed = await this.deps.preferences.list();
    const request = projectCompanionRequest({
      conversationId: submission.conversationId,
      text: submission.text,
      recentReplies: submission.recentReplies,
      confirmedPreferenceSummaries: confirmed.map(item => item.summary),
    });

    const output = await this.deps.model.complete(request);
    this.assertValidOutput(output);

    const turn: CompanionTurn = {
      id: this.deps.ids.next(),
      conversationId: submission.conversationId,
      intent: output.intent,
      reply: output.reply,
      createdAtEpochMs: this.deps.clock.now(),
      proposal: this.buildProposal(output),
    };

    if (turn.proposal) {
      this.pending.set(turn.proposal.id, turn.proposal);
    }
    return turn;
  }

  // Consumes a pending proposal exactly once, returning its confirmed action.
  // Persistence/routing is the caller's (Facade's) responsibility.
  async confirm(proposalId: string): Promise<ConfirmedCompanionAction> {
    const proposal = this.pending.get(proposalId);
    if (!proposal) {
      throw new CapabilityError('proposal_not_found');
    }
    this.pending.delete(proposalId);
    return proposal.action;
  }

  dismiss(proposalId: string): void {
    this.pending.delete(proposalId);
  }

  private buildProposal(
    output: CompanionModelOutput,
  ): CompanionProposal | undefined {
    if (!output.proposal || !PROPOSAL_INTENTS.has(output.intent)) {
      return undefined;
    }
    return {id: this.deps.ids.next(), action: output.proposal};
  }

  private assertValidOutput(output: CompanionModelOutput): void {
    if (typeof output.reply !== 'string') {
      throw new Error('companion_model_invalid');
    }
    if (output.proposal) {
      const intentMatches =
        output.intent === output.proposal.kind &&
        PROPOSAL_INTENTS.has(output.intent);
      if (!intentMatches) {
        throw new Error('companion_model_invalid');
      }
    }
    if (PROPOSAL_INTENTS.has(output.intent) && !output.proposal) {
      throw new Error('companion_model_invalid');
    }
  }
}
