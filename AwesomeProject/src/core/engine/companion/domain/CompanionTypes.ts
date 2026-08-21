// Companion is a text-only dialogue domain. It never captures screenshots,
// reads credentials, executes device actions, or imports the Visual Agent /
// task runner. `operate` is only an intent hint; it never becomes a persisted
// proposal here.
export type CompanionIntent =
  | 'companion'
  | 'operate'
  | 'preference'
  | 'errand'
  | 'ambiguous';

// An action the user has explicitly confirmed. Preference actions route to the
// preference repository; errand actions route to the errand domain via a port.
export type ConfirmedCompanionAction =
  | {readonly kind: 'preference'; readonly title: string; readonly summary: string}
  | {readonly kind: 'errand'; readonly title: string; readonly dueText: string};

// A pending, in-memory proposal awaiting one-time confirmation. Only preference
// and errand intents yield a proposal.
export interface CompanionProposal {
  readonly id: string;
  readonly action: ConfirmedCompanionAction;
}

export interface CompanionTurn {
  readonly id: string;
  readonly conversationId: string;
  readonly intent: CompanionIntent;
  readonly reply: string;
  readonly createdAtEpochMs: number;
  readonly proposal?: CompanionProposal;
}

export interface CompanionSubmission {
  readonly conversationId: string;
  readonly text: string;
  readonly recentReplies: readonly string[];
}
