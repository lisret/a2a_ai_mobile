import type {CredentialResolver} from '../../../../../core/engine/agentRuntime/contracts/AgentContracts';
import type {ModelConnection} from '../../../../../core/engine/agentRuntime/domain';
import {CloudPerceptionProvider} from '../../../../../core/engine/agentRuntime/providers/CloudPerceptionProvider';
import {OpenAICompatibleDirectProvider} from '../../../../../core/engine/agentRuntime/providers/OpenAICompatibleDirectProvider';
import {
  FetchOpenAICompatibleTransport,
  type OpenAICompatibleTransport,
} from '../../../../../core/engine/agentRuntime/providers/OpenAICompatibleTransport';

const visionConnection: ModelConnection = {
  id: 'vision',
  providerId: 'openai-compatible',
  baseUrl: 'https://models.example/v1/',
  modelName: 'vision-model',
  secretRef: 'credential://vision',
  capabilities: {
    vision: true,
    jsonOutput: true,
    toolCalls: false,
    thinking: false,
  },
};
const resolver = (
  secret: string | null = 'ephemeral-key',
): CredentialResolver => ({resolve: jest.fn().mockResolvedValue(secret)});
const directResponse = (decision: Record<string, unknown>) => ({
  choices: [{message: {content: JSON.stringify(decision)}}],
});
const directDecision = (patch: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  subtaskId: 'direct-action',
  action: 'tap',
  coordinates: [500, 500],
  expectedState: 'Next screen',
  risk: 'low',
  ...patch,
});

describe('OpenAI-compatible provider adapters', () => {
  it('parses a structured cloud observation response', async () => {
    const transport: OpenAICompatibleTransport = {
      post: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    schemaVersion: 1,
                    stateSummary: 'Login page',
                    visibleText: ['Sign in'],
                    elements: [],
                    uncertainties: [],
                  }),
                },
              ],
            },
          },
        ],
      }),
    };
    const provider = new CloudPerceptionProvider(
      visionConnection,
      resolver(),
      transport,
    );

    await expect(
      provider.observe({
        screenshotUri: 'data:image/png;base64,screen',
        instruction: 'Sign in',
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual(
      expect.objectContaining({schemaVersion: 1, stateSummary: 'Login page'}),
    );
  });

  it('whitelist-rebuilds a cloud observation response before returning it', async () => {
    const screenshotUri = 'data:image/png;base64,private';
    const transport: OpenAICompatibleTransport = {
      post: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                schemaVersion: 1,
                stateSummary: 'Login page',
                visibleText: ['Sign in'],
                elements: [],
                uncertainties: [],
                screenshotUri,
                image_url: {url: screenshotUri},
              }),
            },
          },
        ],
      }),
    };
    const provider = new CloudPerceptionProvider(
      visionConnection,
      resolver(),
      transport,
    );

    const result = await provider.observe({
      screenshotUri: 'data:image/png;base64,current-screen',
      instruction: 'Sign in',
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      schemaVersion: 1,
      stateSummary: 'Login page',
      visibleText: ['Sign in'],
      elements: [],
      uncertainties: [],
    });
    expect(JSON.stringify(result)).not.toContain('image_url');
    expect(JSON.stringify(result)).not.toContain('screenshotUri');
    expect(JSON.stringify(result)).not.toContain(screenshotUri);
  });

  it.each([
    ['malformed element', [{id: 'missing-fields'}], ['Sign in']],
    ['non-string visible text', [], [42]],
  ])(
    'fails closed for a cloud observation with %s',
    async (_label, elements, visibleText) => {
      const provider = new CloudPerceptionProvider(
        visionConnection,
        resolver(),
        {
          post: jest.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    schemaVersion: 1,
                    stateSummary: 'Login page',
                    visibleText,
                    elements,
                    uncertainties: [],
                  }),
                },
              },
            ],
          }),
        },
      );

      await expect(
        provider.observe({
          screenshotUri: 'data:image/png;base64,current-screen',
          instruction: 'Sign in',
          signal: new AbortController().signal,
        }),
      ).rejects.toMatchObject({
        code: 'invalid_structured_response',
        message: 'Provider returned invalid structured output',
      });
    },
  );

  it('parses fenced JSON from a direct model response', async () => {
    const transport: OpenAICompatibleTransport = {
      post: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content:
                '```json\n{"schemaVersion":1,"subtaskId":"wait","action":"wait","expectedState":"loaded","risk":"low"}\n```',
            },
          },
        ],
      }),
    };
    const provider = new OpenAICompatibleDirectProvider(
      visionConnection,
      resolver(),
      transport,
    );

    await expect(
      provider.decide({
        screenshotUri: 'data:image/png;base64,screen',
        instruction: 'Wait for loading',
        history: [],
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual(expect.objectContaining({action: 'wait'}));
  });

  it('rejects a direct tap that has only targetId because no observation can resolve it', async () => {
    const transport: OpenAICompatibleTransport = {
      post: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                schemaVersion: 1,
                subtaskId: 'tap-settings',
                action: 'tap',
                targetId: 'settings',
                expectedState: 'Settings page',
                risk: 'low',
              }),
            },
          },
        ],
      }),
    };
    const provider = new OpenAICompatibleDirectProvider(
      visionConnection,
      resolver(),
      transport,
    );

    await expect(
      provider.decide({
        screenshotUri: 'data:image/png;base64,screen',
        instruction: 'Open settings',
        history: [],
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: 'invalid_structured_response',
      message: 'Provider returned invalid structured output',
    });
  });

  it.each([
    ['wrong length', [500]],
    ['non-number', ['500', 500]],
    ['not finite', [Number.POSITIVE_INFINITY, 500]],
    ['below range', [-1, 500]],
    ['above range', [500, 1001]],
  ])('rejects direct coordinates that are %s', async (_label, coordinates) => {
    const provider = new OpenAICompatibleDirectProvider(
      visionConnection,
      resolver(),
      {
        post: jest
          .fn()
          .mockResolvedValue(directResponse(directDecision({coordinates}))),
      },
    );

    await expect(
      provider.decide({
        screenshotUri: 'data:image/png;base64,screen',
        instruction: 'Open settings',
        history: [],
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: 'invalid_structured_response',
      message: 'Provider returned invalid structured output',
    });
  });

  it('rejects direct swipe because direct mode has no Observation-backed swipe schema', async () => {
    const provider = new OpenAICompatibleDirectProvider(
      visionConnection,
      resolver(),
      {
        post: jest
          .fn()
          .mockResolvedValue(
            directResponse(
              directDecision({action: 'swipe', coordinates: [500, 500]}),
            ),
          ),
      },
    );

    await expect(
      provider.decide({
        screenshotUri: 'data:image/png;base64,screen',
        instruction: 'Scroll down',
        history: [],
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: 'invalid_structured_response',
      message: 'Provider returned invalid structured output',
    });
  });

  it('throws stable redacted errors for missing credentials and malformed output', async () => {
    const transport: OpenAICompatibleTransport = {post: jest.fn()};
    const missingCredentialProvider = new CloudPerceptionProvider(
      visionConnection,
      resolver(null),
      transport,
    );
    const missingCredential = missingCredentialProvider.observe({
      screenshotUri: 'data:image/png;base64,screen',
      instruction: 'Observe',
      signal: new AbortController().signal,
    });

    await expect(missingCredential).rejects.toMatchObject({
      name: 'AgentProviderError',
      code: 'credential_unavailable',
      message: 'Provider credential is unavailable',
    });
    await expect(missingCredential).rejects.not.toThrow(
      visionConnection.secretRef,
    );
    expect(transport.post).not.toHaveBeenCalled();

    const malformedProvider = new OpenAICompatibleDirectProvider(
      visionConnection,
      resolver(),
      {
        post: jest
          .fn()
          .mockResolvedValue({choices: [{message: {content: 'not-json'}}]}),
      },
    );
    await expect(
      malformedProvider.decide({
        screenshotUri: 'data:image/png;base64,screen',
        instruction: 'Wait',
        history: [],
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: 'invalid_structured_response',
      message: 'Provider returned invalid structured output',
    });
  });
});

describe('FetchOpenAICompatibleTransport', () => {
  it('posts JSON to the normalized endpoint with AbortSignal', async () => {
    const signal = new AbortController().signal;
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({choices: []}),
    });
    const transport = new FetchOpenAICompatibleTransport(fetchFn);

    await transport.post({
      baseUrl: 'https://models.example/v1/',
      apiKey: 'ephemeral-key',
      body: {model: 'vision-model', messages: []},
      signal,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      'https://models.example/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        signal,
        headers: {
          Authorization: 'Bearer ephemeral-key',
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('normalizes network and HTTP failures to stable errors', async () => {
    const request = {
      baseUrl: 'https://models.example/v1',
      apiKey: 'ephemeral-key',
      body: {model: 'vision-model', messages: []},
      signal: new AbortController().signal,
    };
    const networkTransport = new FetchOpenAICompatibleTransport(
      jest.fn().mockRejectedValue(new Error('host contains secret')),
    );
    await expect(networkTransport.post(request)).rejects.toMatchObject({
      code: 'transport_failed',
      message: 'Provider request failed',
    });
    const httpTransport = new FetchOpenAICompatibleTransport(
      jest.fn().mockResolvedValue({ok: false, status: 429}),
    );
    await expect(httpTransport.post(request)).rejects.toMatchObject({
      code: 'http_error',
      message: 'Provider request failed with HTTP 429',
    });
  });

  it.each([
    [
      'https://models.example/v1?tenant=alpha#client-fragment',
      'https://models.example/v1/chat/completions?tenant=alpha#client-fragment',
    ],
    [
      'https://models.example/v1/chat/completions?tenant=alpha#client-fragment',
      'https://models.example/v1/chat/completions?tenant=alpha#client-fragment',
    ],
  ])(
    'normalizes URL path without losing query or hash',
    async (baseUrl, expected) => {
      const fetchFn = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({choices: []}),
      });
      const transport = new FetchOpenAICompatibleTransport(fetchFn);

      await transport.post({
        baseUrl,
        apiKey: 'ephemeral-key',
        body: {model: 'vision-model', messages: []},
        signal: new AbortController().signal,
      });

      expect(fetchFn).toHaveBeenCalledWith(expected, expect.any(Object));
    },
  );

  it('rejects an invalid base URL with a stable redacted configuration error', async () => {
    const invalidBaseUrl = 'not a URL containing private-value';
    const fetchFn = jest.fn();
    const transport = new FetchOpenAICompatibleTransport(fetchFn);

    const result = transport.post({
      baseUrl: invalidBaseUrl,
      apiKey: 'ephemeral-key',
      body: {model: 'vision-model', messages: []},
      signal: new AbortController().signal,
    });

    await expect(result).rejects.toMatchObject({
      code: 'invalid_configuration',
      message: 'Provider configuration is invalid',
    });
    await expect(result).rejects.not.toThrow(invalidBaseUrl);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
