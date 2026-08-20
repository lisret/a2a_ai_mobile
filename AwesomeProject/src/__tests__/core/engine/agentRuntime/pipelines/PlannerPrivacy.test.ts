import {OpenAICompatiblePlannerProvider} from '../../../../../core/engine/agentRuntime/providers/OpenAICompatiblePlannerProvider';
import type {OpenAICompatibleTransport} from '../../../../../core/engine/agentRuntime/providers/OpenAICompatibleTransport';
import type {
  CredentialResolver,
  Observation,
  RuntimeHistoryEntry,
} from '../../../../../core/engine/agentRuntime/contracts/AgentContracts';
import type {ModelConnection} from '../../../../../core/engine/agentRuntime/domain';

const connection: ModelConnection = {
  id: 'planner',
  providerId: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  modelName: 'deepseek-chat',
  secretRef: 'credential://planner',
  capabilities: {
    vision: false,
    jsonOutput: true,
    toolCalls: false,
    thinking: false,
  },
};
const observation: Observation = {
  schemaVersion: 1,
  stateSummary: 'Home screen',
  visibleText: ['Settings'],
  elements: [
    {
      id: 'settings',
      role: 'button',
      text: 'Settings',
      bbox: [800, 50, 100, 100],
      enabled: true,
      confidence: 0.98,
    },
  ],
  uncertainties: [],
};
const response = (subtaskId: string) => ({
  choices: [
    {
      message: {
        content: JSON.stringify({
          schemaVersion: 1,
          subtaskId,
          action: 'wait',
          expectedState: subtaskId,
          risk: 'low',
        }),
      },
    },
  ],
});

describe('OpenAICompatiblePlannerProvider privacy', () => {
  it('sends only observation, instruction, and history to the planner', async () => {
    const screenshotUri = 'data:image/png;base64,private-screen';
    const taintedObservation = {
      ...observation,
      screenshotUri,
      image_url: {url: screenshotUri},
    } as unknown as Observation;
    const history = [
      {
        step: 1,
        outcome: 'Home screen unchanged',
        screenshotUri,
        observation: {
          ...observation,
          image_url: {url: screenshotUri},
        },
        decision: {
          schemaVersion: 1,
          subtaskId: 'previous',
          action: 'wait',
          expectedState: 'unchanged',
          risk: 'low',
          screenshotUri,
        },
      },
    ] as unknown as RuntimeHistoryEntry[];
    const transport: OpenAICompatibleTransport = {
      post: jest.fn().mockResolvedValue(response('tap-settings')),
    };
    const resolver: CredentialResolver = {
      resolve: jest.fn().mockResolvedValue('secret-value'),
    };
    const provider = new OpenAICompatiblePlannerProvider(
      connection,
      resolver,
      transport,
    );

    await provider.plan({
      observation: taintedObservation,
      instruction: 'Open settings',
      history,
      signal: new AbortController().signal,
    });

    const request = (transport.post as jest.Mock).mock.calls[0][0];
    const serialized = JSON.stringify(request.body);
    expect(serialized).not.toContain('image_url');
    expect(serialized).not.toContain('screenshotUri');
    expect(serialized).not.toContain(screenshotUri);
    expect(serialized).toContain('Open settings');
    expect(serialized).toContain('Home screen');
    expect(serialized).toContain('Home screen unchanged');
  });

  it('fails closed before transport when whitelisted planner data contains a data URI', async () => {
    const transport: OpenAICompatibleTransport = {post: jest.fn()};
    const provider = new OpenAICompatiblePlannerProvider(
      connection,
      {resolve: jest.fn().mockResolvedValue('secret-value')},
      transport,
    );

    await expect(
      provider.plan({
        observation,
        instruction: 'Open settings',
        history: [
          {
            step: 1,
            outcome: 'data:image/png;base64,private-screen',
          },
        ],
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: 'invalid_structured_response',
      message: 'Provider returned invalid structured output',
    });
    expect(transport.post).not.toHaveBeenCalled();
  });

  it('fails closed when nested history observation schema is invalid', async () => {
    const transport: OpenAICompatibleTransport = {post: jest.fn()};
    const provider = new OpenAICompatiblePlannerProvider(
      connection,
      {resolve: jest.fn().mockResolvedValue('secret-value')},
      transport,
    );
    const history = [
      {
        step: 1,
        observation: {...observation, stateSummary: 7},
      },
    ] as unknown as RuntimeHistoryEntry[];

    await expect(
      provider.plan({
        observation,
        instruction: 'Open settings',
        history,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({code: 'invalid_structured_response'});
    expect(transport.post).not.toHaveBeenCalled();
  });

  it('resolves the credential for every request instead of caching plaintext', async () => {
    const transport: OpenAICompatibleTransport = {
      post: jest
        .fn()
        .mockResolvedValueOnce(response('one'))
        .mockResolvedValueOnce(response('two')),
    };
    const resolver: CredentialResolver = {
      resolve: jest
        .fn()
        .mockResolvedValueOnce('rotated-secret-1')
        .mockResolvedValueOnce('rotated-secret-2'),
    };
    const provider = new OpenAICompatiblePlannerProvider(
      connection,
      resolver,
      transport,
    );
    const input = {
      observation,
      instruction: 'Wait',
      history: [],
      signal: new AbortController().signal,
    };

    await provider.plan(input);
    await provider.plan(input);

    expect(resolver.resolve).toHaveBeenCalledTimes(2);
    expect((transport.post as jest.Mock).mock.calls[0][0].apiKey).toBe(
      'rotated-secret-1',
    );
    expect((transport.post as jest.Mock).mock.calls[1][0].apiKey).toBe(
      'rotated-secret-2',
    );
  });
});
