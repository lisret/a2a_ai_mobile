import type {
  CredentialResolver,
  DirectActionDecision,
  DirectAgentProvider,
  StepInput,
} from '../contracts/AgentContracts';
import {AgentProviderError} from '../contracts/AgentContracts';
import type {ModelConnection} from '../domain/AgentTypes';
import {
  parseActionDecisionResponse,
  resolveCredential,
  type OpenAICompatibleTransport,
} from './OpenAICompatibleTransport';

const SYSTEM_PROMPT =
  'Inspect the mobile screenshot and choose exactly one next action. ' +
  'Return one JSON ActionDecision and do not return an action sequence. ' +
  'A tap or input must contain normalized 0..1000 coordinates; targetId alone is invalid. ' +
  'Swipe is unsupported in direct mode.';

const hasNormalizedCoordinates = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every(
    coordinate =>
      typeof coordinate === 'number' &&
      Number.isFinite(coordinate) &&
      coordinate >= 0 &&
      coordinate <= 1000,
  );

export class OpenAICompatibleDirectProvider implements DirectAgentProvider {
  constructor(
    private readonly connection: ModelConnection,
    private readonly credentialResolver: CredentialResolver,
    private readonly transport: OpenAICompatibleTransport,
  ) {}

  async decide(input: StepInput): Promise<DirectActionDecision> {
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
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  instruction: input.instruction,
                  history: input.history,
                }),
              },
              {type: 'image_url', image_url: {url: input.screenshotUri}},
            ],
          },
        ],
        temperature: 0,
        ...(this.connection.capabilities.jsonOutput
          ? {response_format: {type: 'json_object'}}
          : {}),
      },
    });
    const decision = parseActionDecisionResponse(response);
    if (
      decision.action === 'swipe' ||
      ((decision.action === 'tap' || decision.action === 'input') &&
        !hasNormalizedCoordinates(decision.coordinates))
    ) {
      throw new AgentProviderError(
        'invalid_structured_response',
        'Provider returned invalid structured output',
      );
    }
    return decision as DirectActionDecision;
  }
}
