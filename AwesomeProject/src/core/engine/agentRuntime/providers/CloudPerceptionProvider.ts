import type {
  CredentialResolver,
  Observation,
  PerceptionInput,
  PerceptionProvider,
} from '../contracts/AgentContracts';
import type {ModelConnection} from '../domain/AgentTypes';
import {
  parseObservationResponse,
  resolveCredential,
  type OpenAICompatibleTransport,
} from './OpenAICompatibleTransport';

const SYSTEM_PROMPT =
  'Describe the current mobile screen as one JSON Observation object. ' +
  'Use normalized 0..1000 bounding boxes and stable element ids.';

export class CloudPerceptionProvider implements PerceptionProvider {
  constructor(
    private readonly connection: ModelConnection,
    private readonly credentialResolver: CredentialResolver,
    private readonly transport: OpenAICompatibleTransport,
  ) {}

  async observe(input: PerceptionInput): Promise<Observation> {
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
                text: JSON.stringify({instruction: input.instruction}),
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
    return parseObservationResponse(response);
  }
}
