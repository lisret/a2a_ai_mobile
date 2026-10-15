import type {AgentPipeline} from '../../../../../core/engine/agentRuntime/contracts/AgentContracts';
import {AgentConfigState} from '../../../../../core/engine/agentRuntime/domain/AgentConfigState';
import type {
  ActionDecision,
  AgentConfigV2,
  AgentMode,
  ModelConnection,
  Observation,
} from '../../../../../core/engine/agentRuntime/domain/AgentTypes';
import {
  AgentRuntime,
  AgentRuntimeConfigurationError,
  type RuntimePipelineFactory,
} from '../../../../../core/engine/agentRuntime';

const connections: readonly ModelConnection[] = [
  {
    id: 'direct',
    providerId: 'openai',
    baseUrl: 'https://direct.example.com/v1',
    modelName: 'direct-original',
    secretRef: 'secret://direct',
    capabilities: {
      vision: true,
      jsonOutput: true,
      toolCalls: false,
      thinking: false,
    },
  },
  {
    id: 'vision',
    providerId: 'openai',
    baseUrl: 'https://vision.example.com/v1',
    modelName: 'vision-original',
    secretRef: 'secret://vision',
    capabilities: {
      vision: true,
      jsonOutput: false,
      toolCalls: false,
      thinking: false,
    },
  },
  {
    id: 'planner',
    providerId: 'deepseek',
    baseUrl: 'https://planner.example.com/v1',
    modelName: 'planner-original',
    secretRef: 'secret://planner',
    capabilities: {
      vision: false,
      jsonOutput: true,
      toolCalls: false,
      thinking: false,
    },
  },
];

const config = (activeMode: AgentMode): AgentConfigV2 => ({
  version: 2,
  activeMode,
  modeDrafts: {
    cloudDirect: {modelConnectionId: 'direct'},
    cloudSplit: {
      visionConnectionId: 'vision',
      plannerConnectionId: 'planner',
    },
    localVisionCloudPlanner: {
      localModelId: 'minicpm-v-4.6-q4',
      plannerConnectionId: 'planner',
    },
  },
  maxSteps: 99,
});

const observation: Observation = {
  schemaVersion: 1,
  stateSummary: 'settings button visible',
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

const directDecision: ActionDecision = {
  schemaVersion: 1,
  subtaskId: 'open-settings',
  action: 'tap',
  coordinates: [200, 250],
  expectedState: 'settings opens',
  risk: 'low',
};

const splitDecision: ActionDecision = {
  ...directDecision,
  targetId: 'settings',
  coordinates: undefined,
};

const stepInput = () => ({
  screenshotUri: 'data:image/png;base64,private-screen',
  instruction: 'Open settings',
  history: [],
  signal: new AbortController().signal,
});

const pipeline = (
  result: Awaited<ReturnType<AgentPipeline['decide']>>,
): AgentPipeline => ({decide: jest.fn().mockResolvedValue(result)});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => {
    resolve = complete;
  });
  return {promise, resolve};
};

const makeHarness = (activeMode: AgentMode) => {
  const direct = pipeline({decision: directDecision});
  const cloudSplit = pipeline({observation, decision: splitDecision});
  const localSplit = pipeline({observation, decision: splitDecision});
  const pipelineFactory: RuntimePipelineFactory = {
    createDirect: jest.fn().mockReturnValue(direct),
    createCloudSplit: jest.fn().mockReturnValue(cloudSplit),
    createLocalSplit: jest.fn().mockReturnValue(localSplit),
  };
  const state = new AgentConfigState(config(activeMode), connections, {
    state: 'ready',
  });
  const credentialResolver = {
    resolve: jest.fn().mockResolvedValue('runtime-secret'),
  };
  const viewportAdapter = {
    getDimensions: jest.fn().mockResolvedValue({width: 1000, height: 2000}),
  };
  const runtime = new AgentRuntime({
    configSource: state,
    credentialResolver,
    pipelineFactory,
    viewportAdapter,
    now: jest.fn().mockReturnValueOnce(100).mockReturnValueOnce(107),
  });
  return {
    runtime,
    state,
    direct,
    cloudSplit,
    localSplit,
    pipelineFactory,
    credentialResolver,
    viewportAdapter,
  };
};

describe('AgentRuntime mode routing', () => {
  it.each([
    ['cloud_direct', 'createDirect'],
    ['cloud_split', 'createCloudSplit'],
    ['local_vision_cloud_planner', 'createLocalSplit'],
  ] as const)('routes %s only through %s', async (mode, selectedFactory) => {
    const harness = makeHarness(mode);
    const snapshot = await harness.runtime.createTaskSnapshot();
    const input = stepInput();

    const result = await harness.runtime.decideStep(snapshot, input);

    expect(harness.pipelineFactory[selectedFactory]).toHaveBeenCalledTimes(1);
    const selectedPipeline =
      mode === 'cloud_direct'
        ? harness.direct
        : mode === 'cloud_split'
        ? harness.cloudSplit
        : harness.localSplit;
    expect(selectedPipeline.decide).toHaveBeenCalledWith(input);
    const unselectedFactories = (
      ['createDirect', 'createCloudSplit', 'createLocalSplit'] as const
    ).filter(name => name !== selectedFactory);
    unselectedFactories.forEach(name =>
      expect(harness.pipelineFactory[name]).not.toHaveBeenCalled(),
    );
    expect(result.diagnostics).toEqual({mode, durationMs: 7});
    expect(result.taskAction).toEqual({
      type: 'click',
      x: mode === 'cloud_direct' ? 200 : 500,
      y: 500,
      requiresConfirmation: false,
    });
    expect(result.observation).toEqual(
      mode === 'cloud_direct' ? undefined : observation,
    );
  });

  it('keeps a recursively frozen task snapshot after mutable state changes', async () => {
    const harness = makeHarness('cloud_direct');
    const snapshot = await harness.runtime.createTaskSnapshot();

    harness.state.replaceConfig(config('cloud_split'));
    harness.state.replaceConnections([
      {...connections[0], modelName: 'direct-replaced'},
      ...connections.slice(1),
    ]);
    await harness.runtime.decideStep(snapshot, stepInput());

    expect(snapshot.config.activeMode).toBe('cloud_direct');
    expect(snapshot.connections.direct.modelName).toBe('direct-original');
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.config.modeDrafts.cloudDirect)).toBe(true);
    expect(Object.isFrozen(snapshot.connections.direct.capabilities)).toBe(
      true,
    );
    expect(harness.pipelineFactory.createDirect).toHaveBeenCalledWith(
      expect.objectContaining({modelName: 'direct-original'}),
    );
    expect(harness.pipelineFactory.createCloudSplit).not.toHaveBeenCalled();
  });

  it('validates every pipeline decision before adapting it', async () => {
    const harness = makeHarness('cloud_direct');
    (harness.direct.decide as jest.Mock).mockResolvedValue({
      decision: {...directDecision, expectedState: ''},
    });
    const snapshot = await harness.runtime.createTaskSnapshot();

    await expect(
      harness.runtime.decideStep(snapshot, stepInput()),
    ).rejects.toMatchObject({code: 'missing_expected_state'});
  });

  it('refuses snapshots when a required credential cannot be resolved', async () => {
    const harness = makeHarness('cloud_split');
    harness.credentialResolver.resolve.mockImplementation(
      async (secretRef: string) =>
        secretRef === 'secret://vision' ? 'vision-secret' : null,
    );

    await expect(harness.runtime.createTaskSnapshot()).rejects.toEqual(
      expect.objectContaining({
        name: 'AgentRuntimeConfigurationError',
        code: 'credential_unavailable',
      }),
    );
    expect(harness.credentialResolver.resolve).toHaveBeenCalledWith(
      'secret://planner',
    );
  });

  it('refuses a local snapshot unless the active eligibility is ready', async () => {
    const harness = makeHarness('local_vision_cloud_planner');
    harness.state.replaceEligibility({state: 'needs_test'});

    await expect(harness.runtime.createTaskSnapshot()).rejects.toBeInstanceOf(
      AgentRuntimeConfigurationError,
    );
    await expect(harness.runtime.createTaskSnapshot()).rejects.toMatchObject({
      code: 'invalid_active_configuration',
      validationErrors: ['local_model_not_ready'],
    });
    expect(harness.credentialResolver.resolve).not.toHaveBeenCalled();
  });
});

describe('AgentRuntime cancellation', () => {
  const expectRuntimeAbort = async (operation: Promise<unknown>) => {
    await expect(operation).rejects.toMatchObject({
      name: 'AbortError',
      code: 'agent_runtime_aborted',
      message: 'agent_runtime_aborted',
    });
  };

  it('does not create or invoke a pipeline for a pre-aborted step', async () => {
    const harness = makeHarness('cloud_direct');
    const snapshot = await harness.runtime.createTaskSnapshot();
    const controller = new AbortController();
    controller.abort();

    await expectRuntimeAbort(
      harness.runtime.decideStep(snapshot, {
        ...stepInput(),
        signal: controller.signal,
      }),
    );

    expect(harness.pipelineFactory.createDirect).not.toHaveBeenCalled();
    expect(harness.direct.decide).not.toHaveBeenCalled();
    expect(harness.viewportAdapter.getDimensions).not.toHaveBeenCalled();
  });

  it('stops before validation and viewport resolution when the pipeline resolves after abort', async () => {
    const harness = makeHarness('cloud_direct');
    const pendingPipeline =
      deferred<Awaited<ReturnType<AgentPipeline['decide']>>>();
    (harness.direct.decide as jest.Mock).mockReturnValue(
      pendingPipeline.promise,
    );
    const snapshot = await harness.runtime.createTaskSnapshot();
    const controller = new AbortController();
    const operation = harness.runtime.decideStep(snapshot, {
      ...stepInput(),
      signal: controller.signal,
    });

    expect(harness.direct.decide).toHaveBeenCalledTimes(1);
    controller.abort();
    pendingPipeline.resolve({
      decision: {...directDecision, expectedState: ''},
    });

    await expectRuntimeAbort(operation);
    expect(harness.viewportAdapter.getDimensions).not.toHaveBeenCalled();
  });

  it('does not adapt or return an action when abort occurs during viewport resolution', async () => {
    const harness = makeHarness('cloud_direct');
    const pendingViewport = deferred<{width: number; height: number}>();
    harness.viewportAdapter.getDimensions.mockReturnValue(
      pendingViewport.promise,
    );
    const snapshot = await harness.runtime.createTaskSnapshot();
    const controller = new AbortController();
    const operation = harness.runtime.decideStep(snapshot, {
      ...stepInput(),
      signal: controller.signal,
    });
    await Promise.resolve();

    expect(harness.viewportAdapter.getDimensions).toHaveBeenCalledTimes(1);
    controller.abort();
    pendingViewport.resolve({width: 0, height: 0});

    await expectRuntimeAbort(operation);
  });
});
