import type {
  ActionCoordinates,
  ActionDecision,
  Observation,
} from '../domain/AgentTypes';

export type {ActionDecision, Observation};

export interface RuntimeHistoryEntry {
  readonly step: number;
  readonly observation?: Observation;
  readonly decision?: ActionDecision;
  readonly outcome?: string;
}

export interface StepInput {
  readonly screenshotUri: string;
  readonly instruction: string;
  readonly history: readonly RuntimeHistoryEntry[];
  readonly signal: AbortSignal;
}

export interface PerceptionInput {
  readonly screenshotUri: string;
  readonly instruction: string;
  readonly signal: AbortSignal;
}

export interface PlannerInput {
  readonly observation: Observation;
  readonly instruction: string;
  readonly history: readonly RuntimeHistoryEntry[];
  readonly signal: AbortSignal;
}

export interface PipelineStepResult {
  readonly observation?: Observation;
  readonly decision: ActionDecision;
}

export interface PerceptionProvider {
  observe(input: PerceptionInput): Promise<Observation>;
}

export interface PlannerProvider {
  plan(input: PlannerInput): Promise<ActionDecision>;
}

export interface DirectAgentProvider {
  /** Direct mode has no Observation, so tap/input decisions require coordinates. */
  decide(input: StepInput): Promise<DirectActionDecision>;
}

export type DirectActionDecision =
  | (Extract<ActionDecision, {action: 'tap' | 'input'}> & {
      readonly coordinates: ActionCoordinates;
    })
  | Exclude<
      ActionDecision,
      {action: 'tap'} | {action: 'input'} | {action: 'swipe'}
    >;

export interface AgentPipeline {
  decide(input: StepInput): Promise<PipelineStepResult>;
}

export interface CredentialResolver {
  resolve(secretRef: string): Promise<string | null | undefined>;
}

export type AgentProviderErrorCode =
  | 'credential_unavailable'
  | 'invalid_configuration'
  | 'transport_failed'
  | 'http_error'
  | 'invalid_response'
  | 'invalid_structured_response';

export class AgentProviderError extends Error {
  readonly name = 'AgentProviderError';

  constructor(readonly code: AgentProviderErrorCode, message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
