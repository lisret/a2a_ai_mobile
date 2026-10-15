import type {
  ActionDecision,
  CredentialResolver,
  PlannerInput,
  PlannerProvider,
} from '../contracts/AgentContracts';
import {sanitizePlannerInput} from '../contracts/PlannerPayload';
import type {ModelConnection} from '../domain/AgentTypes';
import {
  parseActionDecisionResponse,
  resolveCredential,
  type OpenAICompatibleTransport,
} from './OpenAICompatibleTransport';

const SYSTEM_PROMPT =
  'Choose exactly one next mobile action and return one JSON ActionDecision. ' +
  'Use targetId when the observation provides a stable element id.';

export class OpenAICompatiblePlannerProvider implements PlannerProvider {
  constructor(
    private readonly connection: ModelConnection,
    private readonly credentialResolver: CredentialResolver,
    private readonly transport: OpenAICompatibleTransport,
  ) {}

  async plan(input: PlannerInput): Promise<ActionDecision> {
    const sanitized = sanitizePlannerInput(input);
    const apiKey = await resolveCredential(
      this.credentialResolver,
      this.connection.secretRef,
    );
    const response = await this.transport.post({
      baseUrl: this.connection.baseUrl,
      apiKey,
      signal: input.signal,
      body: {
        model: this.connection.modelName,
        messages: [
          {role: 'system', content: SYSTEM_PROMPT},
          {
            role: 'user',
            content: JSON.stringify({
              observation: sanitized.observation,
              instruction: sanitized.instruction,
              history: sanitized.history,
            }),
          },
        ],
        temperature: 0,
        ...(this.connection.capabilities.jsonOutput
          ? {response_format: {type: 'json_object'}}
          : {}),
      },
    });
    return parseActionDecisionResponse(response);
  }
}
