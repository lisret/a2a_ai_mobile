import type {
  PerceptionInput,
  PerceptionProvider,
  RuntimeHistoryEntry,
} from '../../../../../core/engine/agentRuntime/contracts/AgentContracts';
import {AgentConfigState} from '../../../../../core/engine/agentRuntime/domain/AgentConfigState';
import type {
  AgentConfigV2,
  ModelConnection,
  Observation,
} from '../../../../../core/engine/agentRuntime/domain/AgentTypes';
import {
  createAgentRuntime,
  LocalPerceptionUnavailableError,
} from '../../../../../core/engine/agentRuntime';
import type {OpenAICompatibleTransport} from '../../../../../core/engine/agentRuntime/providers/OpenAICompatibleTransport';

const plannerConnection: ModelConnection = {
  id: 'planner',
  providerId: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  modelName: 'deepseek-chat',
  secretRef: 'secret://planner',
  capabilities: {
    vision: false,
    jsonOutput: true,
    toolCalls: false,
    thinking: false,
  },
};

const localConfig: AgentConfigV2 = {
  version: 2,
  activeMode: 'local_vision_cloud_planner',
  modeDrafts: {
    cloudDirect: {},
    cloudSplit: {},
    localVisionCloudPlanner: {
      localModelId: 'minicpm-v-4.6-q4',
      plannerConnectionId: 'planner',
    },
  },
  maxSteps: 99,
};

const observation: Observation = {
  schemaVersion: 1,
  stateSummary: 'home screen',
  visibleText: ['Settings'],
  elements: [
    {
      id: 'settings',
      role: 'button',
      text: 'Settings',
      bbox: [400, 200, 200, 100],
      enabled: true,
      confidence: 0.99,
    },
  ],
  uncertainties: [],
};

const plannerResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          schemaVersion: 1,
          subtaskId: 'open-settings',
          action: 'tap',
          targetId: 'settings',
          expectedState: 'settings opens',
          risk: 'low',
        }),
      },
    },
  ],
};

const runtimeDependencies = (
  localPerceptionProvider: PerceptionProvider,
  transport: OpenAICompatibleTransport,
  invalidateLocalEligibility = jest.fn().mockResolvedValue(undefined),
) => ({
  configSource: new AgentConfigState(localConfig, [plannerConnection], {
    state: 'ready' as const,
  }),
  credentialResolver: {resolve: jest.fn().mockResolvedValue('planner-secret')},
  transport,
  localPerceptionProviderFactory: jest
    .fn()
    .mockReturnValue(localPerceptionProvider),
  viewportAdapter: {
    getDimensions: jest.fn().mockReturnValue({width: 1000, height: 2000}),
  },
  invalidateLocalEligibility,
  now: jest.fn().mockReturnValueOnce(10).mockReturnValueOnce(15),
});

describe('AgentRuntime local perception privacy', () => {
  it('sends the screenshot only to local perception and a sanitized observation to the cloud planner', async () => {
    const screenshotUri = 'data:image/png;base64,private-screen';
    const localPerceptionProvider: PerceptionProvider = {
      observe: jest.fn().mockResolvedValue({
        ...observation,
        screenshotUri,
        image_url: {url: screenshotUri},
      } as unknown as Observation),
    };
    const transport: OpenAICompatibleTransport = {
      post: jest.fn().mockResolvedValue(plannerResponse),
    };
    const dependencies = runtimeDependencies(
      localPerceptionProvider,
      transport,
    );
    const runtime = createAgentRuntime(dependencies);
    const snapshot = await runtime.createTaskSnapshot();
    const signal = new AbortController().signal;
    const history = [
      {
        step: 1,
        outcome: 'screen unchanged',
        screenshotUri,
      },
    ] as unknown as RuntimeHistoryEntry[];

    const result = await runtime.decideStep(snapshot, {
      screenshotUri,
      instruction: 'Open settings',
      history,
      signal,
    });

    expect(dependencies.localPerceptionProviderFactory).toHaveBeenCalledWith(
      'minicpm-v-4.6-q4',
    );
    expect(localPerceptionProvider.observe).toHaveBeenCalledWith({
      screenshotUri,
      instruction: 'Open settings',
      signal,
    } satisfies PerceptionInput);
    const plannerRequest = (transport.post as jest.Mock).mock.calls[0][0];
    const serializedPlannerRequest = JSON.stringify(plannerRequest.body);
    expect(serializedPlannerRequest).not.toContain(screenshotUri);
    expect(serializedPlannerRequest).not.toContain('screenshotUri');
    expect(serializedPlannerRequest).not.toContain('image_url');
    expect(serializedPlannerRequest).toContain('home screen');
    expect(serializedPlannerRequest).toContain('screen unchanged');
    expect(plannerRequest.signal).toBe(signal);
    expect(result.taskAction).toEqual({
      type: 'click',
      x: 500,
      y: 500,
      requiresConfirmation: false,
    });
  });

  it('invalidates eligibility and fails closed when local perception fails', async () => {
    const localFailure = new Error('native inference OOM');
    const localPerceptionProvider: PerceptionProvider = {
      observe: jest.fn().mockRejectedValue(localFailure),
    };
    const transport: OpenAICompatibleTransport = {post: jest.fn()};
    const invalidateLocalEligibility = jest
      .fn()
      .mockRejectedValue(new Error('native invalidation unavailable'));
    const dependencies = runtimeDependencies(
      localPerceptionProvider,
      transport,
      invalidateLocalEligibility,
    );
    const runtime = createAgentRuntime(dependencies);
    const snapshot = await runtime.createTaskSnapshot();

    const rejection = runtime.decideStep(snapshot, {
      screenshotUri: 'file:///private/screen.png',
      instruction: 'Open settings',
      history: [],
      signal: new AbortController().signal,
    });

    await expect(rejection).rejects.toBeInstanceOf(
      LocalPerceptionUnavailableError,
    );
    await expect(rejection).rejects.toMatchObject({
      name: 'LocalPerceptionUnavailableError',
      code: 'local_perception_unavailable',
    });
    await expect(rejection).rejects.not.toHaveProperty('originalError');
    expect(invalidateLocalEligibility).toHaveBeenCalledWith(
      'local_perception_unavailable',
    );
    expect(transport.post).not.toHaveBeenCalled();
  });

  it('treats local provider construction failures as local unavailability', async () => {
    const bridgeFailure = new Error('native bridge unavailable');
    const transport: OpenAICompatibleTransport = {post: jest.fn()};
    const invalidateLocalEligibility = jest.fn().mockResolvedValue(undefined);
    const dependencies = runtimeDependencies(
      {observe: jest.fn()},
      transport,
      invalidateLocalEligibility,
    );
    dependencies.localPerceptionProviderFactory.mockImplementation(() => {
      throw bridgeFailure;
    });
    const runtime = createAgentRuntime(dependencies);
    const snapshot = await runtime.createTaskSnapshot();

    await expect(
      runtime.decideStep(snapshot, {
        screenshotUri: 'file:///private/screen.png',
        instruction: 'Open settings',
        history: [],
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: 'local_perception_unavailable',
    });
    expect(invalidateLocalEligibility).toHaveBeenCalledWith(
      'local_perception_unavailable',
    );
    expect(transport.post).not.toHaveBeenCalled();
  });

  it('invalidates eligibility when local perception returns a malformed observation', async () => {
    const localPerceptionProvider: PerceptionProvider = {
      observe: jest.fn().mockResolvedValue({
        ...observation,
        stateSummary: 42,
      } as unknown as Observation),
    };
    const transport: OpenAICompatibleTransport = {post: jest.fn()};
    const invalidateLocalEligibility = jest.fn().mockResolvedValue(undefined);
    const dependencies = runtimeDependencies(
      localPerceptionProvider,
      transport,
      invalidateLocalEligibility,
    );
    const runtime = createAgentRuntime(dependencies);
    const snapshot = await runtime.createTaskSnapshot();

    await expect(
      runtime.decideStep(snapshot, {
        screenshotUri: 'file:///private/screen.png',
        instruction: 'Open settings',
        history: [],
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({code: 'local_perception_unavailable'});
    expect(invalidateLocalEligibility).toHaveBeenCalledWith(
      'local_perception_unavailable',
    );
    expect(transport.post).not.toHaveBeenCalled();
  });

  it('preserves in-flight cancellation without invalidating local eligibility', async () => {
    let rejectLocal!: (reason: unknown) => void;
    const pendingLocal = new Promise<Observation>((_resolve, reject) => {
      rejectLocal = reject;
    });
    const localPerceptionProvider: PerceptionProvider = {
      observe: jest.fn().mockReturnValue(pendingLocal),
    };
    const transport: OpenAICompatibleTransport = {post: jest.fn()};
    const invalidateLocalEligibility = jest.fn().mockResolvedValue(undefined);
    const dependencies = runtimeDependencies(
      localPerceptionProvider,
      transport,
      invalidateLocalEligibility,
    );
    const runtime = createAgentRuntime(dependencies);
    const snapshot = await runtime.createTaskSnapshot();
    const controller = new AbortController();
    const operation = runtime.decideStep(snapshot, {
      screenshotUri: 'file:///private/screen.png',
      instruction: 'Open settings',
      history: [],
      signal: controller.signal,
    });

    expect(localPerceptionProvider.observe).toHaveBeenCalledTimes(1);
    controller.abort();
    rejectLocal(new Error('native cancellation'));

    await expect(operation).rejects.toMatchObject({
      name: 'AbortError',
      code: 'agent_runtime_aborted',
    });
    expect(invalidateLocalEligibility).not.toHaveBeenCalled();
    expect(transport.post).not.toHaveBeenCalled();
  });

  it('does not invoke the cloud planner when local perception resolves after abort', async () => {
    let resolveLocal!: (value: Observation) => void;
    const pendingLocal = new Promise<Observation>(resolve => {
      resolveLocal = resolve;
    });
    const localPerceptionProvider: PerceptionProvider = {
      observe: jest.fn().mockReturnValue(pendingLocal),
    };
    const transport: OpenAICompatibleTransport = {post: jest.fn()};
    const invalidateLocalEligibility = jest.fn().mockResolvedValue(undefined);
    const dependencies = runtimeDependencies(
      localPerceptionProvider,
      transport,
      invalidateLocalEligibility,
    );
    const runtime = createAgentRuntime(dependencies);
    const snapshot = await runtime.createTaskSnapshot();
    const controller = new AbortController();
    const operation = runtime.decideStep(snapshot, {
      screenshotUri: 'file:///private/screen.png',
      instruction: 'Open settings',
      history: [],
      signal: controller.signal,
    });

    expect(localPerceptionProvider.observe).toHaveBeenCalledTimes(1);
    controller.abort();
    resolveLocal(observation);

    await expect(operation).rejects.toMatchObject({
      name: 'AbortError',
      code: 'agent_runtime_aborted',
    });
    expect(invalidateLocalEligibility).not.toHaveBeenCalled();
    expect(transport.post).not.toHaveBeenCalled();
  });
});
