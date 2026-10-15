import {
  AgentConfigV2,
  EligibilityReport,
  ModelConnection,
} from '../../../../../core/engine/agentRuntime/domain/AgentTypes';
import {createAgentConfigController} from '../../../../../core/engine/agentRuntime/config/AgentConfigController';

const config = (
  activeMode: AgentConfigV2['activeMode'] = 'cloud_direct',
): AgentConfigV2 => ({
  version: 2,
  activeMode,
  modeDrafts: {
    cloudDirect: {modelConnectionId: 'direct'},
    cloudSplit: {visionConnectionId: 'vision', plannerConnectionId: 'planner'},
    localVisionCloudPlanner: {
      localModelId: 'minicpm-v-4.6-q4',
      plannerConnectionId: 'planner',
    },
  },
  maxSteps: 99,
});

const connection = (
  id: string,
  capabilities: ModelConnection['capabilities'],
): ModelConnection => ({
  id,
  providerId: 'openai',
  baseUrl: 'https://api.example.com',
  modelName: `${id}-model`,
  secretRef: `model:${id}`,
  capabilities,
});

const connections = (): ModelConnection[] => [
  connection('direct', {
    vision: true,
    jsonOutput: true,
    toolCalls: true,
    thinking: false,
  }),
  connection('vision', {
    vision: true,
    jsonOutput: true,
    toolCalls: false,
    thinking: false,
  }),
  connection('planner', {
    vision: false,
    jsonOutput: true,
    toolCalls: true,
    thinking: false,
  }),
];

const ready: EligibilityReport = {
  state: 'ready',
  reasons: [],
  checkedAtEpochMs: 1,
};

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
};

const makeDependencies = () => {
  const credentialStore = {
    put: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue('stored-secret'),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const repository = {
    load: jest.fn().mockResolvedValue({
      config: config(),
      connections: connections(),
      eligibility: ready,
    }),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const releaseLease = jest.fn();
  const taskState = {
    isTaskRunning: jest.fn().mockReturnValue(false),
    tryAcquireActivationLease: jest.fn().mockReturnValue(releaseLease),
  };
  return {
    credentialStore,
    repository,
    taskState,
    releaseLease,
    connectionTester: {test: jest.fn().mockResolvedValue(undefined)},
    eligibilityChecker: {check: jest.fn().mockResolvedValue(ready)},
    idGenerator: {
      nextConnectionId: jest.fn().mockReturnValue('generated-connection'),
      nextSecretRef: jest
        .fn()
        .mockImplementation(connectionId => `model:${connectionId}:next`),
    },
  };
};

describe('AgentConfigController', () => {
  it('writes transient plaintext immediately and never exposes it in snapshots', async () => {
    const deps = makeDependencies();
    const controller = await createAgentConfigController(deps);

    await controller.patchConnection('planner', {apiKey: 'sk-sensitive-1234'});

    expect(deps.credentialStore.put).toHaveBeenCalledWith(
      'model:planner:next',
      'sk-sensitive-1234',
    );
    const snapshot = controller.getSnapshot();
    expect(JSON.stringify(snapshot)).not.toContain('sk-sensitive-1234');
    expect(
      snapshot.connections.find(item => item.id === 'planner')
        ?.credentialDisplay,
    ).toEqual({masked: '••••••••1234', lastFour: '1234'});
  });

  it('blocks activation while a task is running', async () => {
    const deps = makeDependencies();
    deps.taskState.isTaskRunning.mockReturnValue(true);
    deps.taskState.tryAcquireActivationLease.mockReturnValue(null);
    const controller = await createAgentConfigController(deps);

    await expect(controller.saveAndActivate()).rejects.toThrow(
      'agent_config_task_running',
    );
    expect(deps.taskState.tryAcquireActivationLease).toHaveBeenCalledTimes(1);
    expect(deps.repository.save).not.toHaveBeenCalled();
  });

  it('never persists when the shared activation lease is unavailable', async () => {
    const deps = makeDependencies();
    deps.taskState.tryAcquireActivationLease.mockReturnValue(null);
    const controller = await createAgentConfigController(deps);

    await expect(controller.saveAndActivate()).rejects.toThrow(
      'agent_config_activation_busy',
    );

    expect(deps.repository.save).not.toHaveBeenCalled();
  });

  it('releases the activation lease when candidate validation fails', async () => {
    const deps = makeDependencies();
    const controller = await createAgentConfigController(deps);
    await controller.patchConnection('direct', {
      capabilities: {
        vision: false,
        jsonOutput: true,
        toolCalls: true,
        thinking: false,
      },
    });

    await expect(controller.saveAndActivate()).rejects.toThrow(
      'agent_config_invalid',
    );

    expect(deps.repository.save).not.toHaveBeenCalled();
    expect(deps.releaseLease).toHaveBeenCalledTimes(1);
  });

  it('passes a secret resolver to the tester without resolving plaintext itself', async () => {
    const deps = makeDependencies();
    const controller = await createAgentConfigController(deps);
    deps.credentialStore.get.mockClear();
    deps.connectionTester.test.mockImplementation(
      async (_connection, resolveSecret) => {
        expect(deps.credentialStore.get).not.toHaveBeenCalled();
        await resolveSecret();
      },
    );

    await controller.testConnection('planner');

    expect(deps.credentialStore.get).toHaveBeenCalledWith('model:planner');
  });

  it('keeps isRunnable based on the active configuration while a draft is dirty', async () => {
    const deps = makeDependencies();
    const controller = await createAgentConfigController(deps);
    expect(controller.getSnapshot().isRunnable).toBe(true);

    await controller.patchConnection('direct', {
      capabilities: {
        vision: false,
        jsonOutput: true,
        toolCalls: true,
        thinking: false,
      },
    });

    expect(controller.getSnapshot().saveState).toBe('dirty');
    expect(controller.getSnapshot().isRunnable).toBe(true);
  });

  it('recomputes isRunnable only after a successful activation and emits detached snapshots', async () => {
    const deps = makeDependencies();
    const controller = await createAgentConfigController(deps);
    const snapshots: ReturnType<typeof controller.getSnapshot>[] = [];
    const unsubscribe = controller.subscribe(snapshot =>
      snapshots.push(snapshot),
    );

    await controller.patchConnection('direct', {
      capabilities: {
        vision: false,
        jsonOutput: true,
        toolCalls: true,
        thinking: false,
      },
    });
    await expect(controller.saveAndActivate()).rejects.toThrow(
      'agent_config_invalid',
    );

    expect(controller.getSnapshot().isRunnable).toBe(true);
    expect(snapshots.some(snapshot => snapshot.saveState === 'saving')).toBe(
      true,
    );
    expect(snapshots.at(-1)?.saveState).toBe('error');
    expect(Object.isFrozen(snapshots[0].connections)).toBe(true);
    unsubscribe();
  });

  it('updates isRunnable after a successful activation of the dirty draft', async () => {
    const deps = makeDependencies();
    const initialConnections = connections();
    initialConnections[0] = {
      ...initialConnections[0],
      capabilities: {...initialConnections[0].capabilities, vision: false},
    };
    deps.repository.load.mockResolvedValue({
      config: config(),
      connections: initialConnections,
      eligibility: ready,
    });
    const controller = await createAgentConfigController(deps);
    expect(controller.getSnapshot().isRunnable).toBe(false);

    await controller.patchConnection('direct', {
      capabilities: {
        vision: true,
        jsonOutput: true,
        toolCalls: true,
        thinking: false,
      },
    });
    expect(controller.getSnapshot().isRunnable).toBe(false);
    await controller.saveAndActivate();

    expect(deps.repository.save).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      saveState: 'saved',
      isRunnable: true,
    });
  });

  it('marks an activated configuration not runnable when its required secret cannot be resolved', async () => {
    const deps = makeDependencies();
    deps.credentialStore.get.mockResolvedValue(null);

    const controller = await createAgentConfigController(deps);

    expect(controller.getSnapshot().isRunnable).toBe(false);
  });

  it('reports an unresolvable secret with a dedicated, redacted save error', async () => {
    const deps = makeDependencies();
    const controller = await createAgentConfigController(deps);
    deps.credentialStore.get.mockResolvedValue(null);

    await expect(controller.saveAndActivate()).rejects.toThrow(
      'agent_config_secret_unresolvable',
    );

    expect(controller.getSnapshot().fieldErrors).toEqual({
      credential: 'connection_secret_unavailable',
    });
    expect(JSON.stringify(controller.getSnapshot())).not.toContain(
      'stored-secret',
    );
  });

  it('captures one immutable save candidate while retaining edits made during persistence', async () => {
    const deps = makeDependencies();
    const saveFinished = deferred<void>();
    const saveStarted = deferred<void>();
    deps.repository.save.mockImplementation(async () => {
      saveStarted.resolve();
      await saveFinished.promise;
    });
    const controller = await createAgentConfigController(deps);

    const saving = controller.saveAndActivate();
    await saveStarted.promise;
    await controller.patchConnection('direct', {
      modelName: 'edited-during-save',
      capabilities: {
        vision: false,
        jsonOutput: true,
        toolCalls: true,
        thinking: false,
      },
    });
    saveFinished.resolve();
    await saving;

    const [savedConfig, savedConnections, savedEligibility] =
      deps.repository.save.mock.calls[0];
    expect(savedConfig.activeMode).toBe('cloud_direct');
    expect(
      savedConnections.find((item: ModelConnection) => item.id === 'direct')
        ?.modelName,
    ).toBe('direct-model');
    expect(Object.isFrozen(savedConfig)).toBe(true);
    expect(Object.isFrozen(savedConnections)).toBe(true);
    expect(savedEligibility).toEqual(ready);
    expect(Object.isFrozen(savedEligibility)).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({
      saveState: 'dirty',
      isRunnable: true,
    });
    expect(
      controller.getSnapshot().connections.find(item => item.id === 'direct'),
    ).toMatchObject({
      modelName: 'edited-during-save',
      capabilities: {vision: false},
    });
    expect(deps.releaseLease).toHaveBeenCalledTimes(1);
  });

  it('rejects a concurrent save while the first save owns the activation lease', async () => {
    const deps = makeDependencies();
    const saveFinished = deferred<void>();
    const saveStarted = deferred<void>();
    let saveCalls = 0;
    deps.repository.save.mockImplementation(async () => {
      saveCalls += 1;
      if (saveCalls === 1) {
        saveStarted.resolve();
        await saveFinished.promise;
      }
    });
    const controller = await createAgentConfigController(deps);

    const firstSave = controller.saveAndActivate();
    await saveStarted.promise;
    await expect(controller.saveAndActivate()).rejects.toThrow(
      'agent_config_save_in_progress',
    );
    expect(deps.repository.save).toHaveBeenCalledTimes(1);
    expect(deps.taskState.tryAcquireActivationLease).toHaveBeenCalledTimes(1);
    saveFinished.resolve();
    await firstSave;
  });

  it('keeps active eligibility and runnability unchanged until the checked draft is activated', async () => {
    const deps = makeDependencies();
    deps.repository.load.mockResolvedValue({
      config: config('local_vision_cloud_planner'),
      connections: connections(),
      eligibility: ready,
    });
    deps.eligibilityChecker.check.mockResolvedValue({
      state: 'needs_test',
      reasons: ['self_test_required'],
      checkedAtEpochMs: 2,
    });
    const controller = await createAgentConfigController(deps);
    expect(controller.getSnapshot().isRunnable).toBe(true);

    await controller.runEligibilityCheck();

    expect(controller.getSnapshot()).toMatchObject({
      eligibility: {state: 'needs_test'},
      isRunnable: true,
      saveState: 'dirty',
    });
  });

  it('does not apply an eligibility result after a newer draft edit', async () => {
    const deps = makeDependencies();
    const check = deferred<EligibilityReport>();
    deps.eligibilityChecker.check.mockReturnValue(check.promise);
    const controller = await createAgentConfigController(deps);

    const checking = controller.runEligibilityCheck();
    controller.selectMode('cloud_split');
    check.resolve({
      state: 'needs_test',
      reasons: ['stale'],
      checkedAtEpochMs: 2,
    });
    await checking;

    expect(controller.getSnapshot().eligibility).toEqual(ready);
    expect(controller.getSnapshot().saveState).toBe('dirty');
  });

  it('applies only the last-started eligibility check', async () => {
    const deps = makeDependencies();
    const first = deferred<EligibilityReport>();
    const second = deferred<EligibilityReport>();
    deps.eligibilityChecker.check
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const controller = await createAgentConfigController(deps);

    const firstCheck = controller.runEligibilityCheck();
    const secondCheck = controller.runEligibilityCheck();
    second.resolve({state: 'failed', reasons: ['latest'], checkedAtEpochMs: 3});
    await secondCheck;
    first.resolve({state: 'ready', reasons: ['stale'], checkedAtEpochMs: 2});
    await firstCheck;

    expect(controller.getSnapshot().eligibility).toEqual({
      state: 'failed',
      reasons: ['latest'],
      checkedAtEpochMs: 3,
    });
  });

  it('does not let an eligibility check overwrite save state after activation starts', async () => {
    const deps = makeDependencies();
    const check = deferred<EligibilityReport>();
    const saveFinished = deferred<void>();
    const saveStarted = deferred<void>();
    deps.eligibilityChecker.check.mockReturnValue(check.promise);
    deps.repository.save.mockImplementation(async () => {
      saveStarted.resolve();
      await saveFinished.promise;
    });
    const controller = await createAgentConfigController(deps);

    const checking = controller.runEligibilityCheck();
    const saving = controller.saveAndActivate();
    await saveStarted.promise;
    check.resolve({state: 'failed', reasons: ['stale'], checkedAtEpochMs: 2});
    await checking;
    expect(controller.getSnapshot().saveState).toBe('saving');
    expect(controller.getSnapshot().eligibility).toEqual(ready);
    saveFinished.resolve();
    await saving;
    expect(controller.getSnapshot().saveState).toBe('saved');
  });

  it('never reveals a secret of four or fewer characters in credential display', async () => {
    const deps = makeDependencies();
    const controller = await createAgentConfigController(deps);

    await controller.patchConnection('planner', {apiKey: '  tiny  '});

    const display = controller
      .getSnapshot()
      .connections.find(item => item.id === 'planner')?.credentialDisplay;
    expect(display).toEqual({masked: '••••••••', lastFour: ''});
    expect(deps.credentialStore.put).toHaveBeenCalledWith(
      'model:planner:next',
      'tiny',
    );
    expect(JSON.stringify(controller.getSnapshot())).not.toContain('tiny');
  });

  it('deep-clones patched capabilities before retaining them in draft state', async () => {
    const deps = makeDependencies();
    const controller = await createAgentConfigController(deps);
    const capabilities = {
      vision: true,
      jsonOutput: true,
      toolCalls: false,
      thinking: false,
    };

    await controller.patchConnection('planner', {capabilities});
    capabilities.jsonOutput = false;

    expect(
      controller.getSnapshot().connections.find(item => item.id === 'planner')
        ?.capabilities.jsonOutput,
    ).toBe(true);
  });

  it('isolates listener failures so later listeners and state transitions still run', async () => {
    const deps = makeDependencies();
    const controller = await createAgentConfigController(deps);
    let throwingCalls = 0;
    controller.subscribe(() => {
      throwingCalls += 1;
      if (throwingCalls > 1) {
        throw new Error('listener_failed');
      }
    });
    const observedStates: string[] = [];
    controller.subscribe(snapshot => observedStates.push(snapshot.saveState));

    await expect(
      controller.patchConnection('direct', {modelName: 'updated'}),
    ).resolves.toBeUndefined();

    expect(observedStates).toContain('dirty');
  });

  it('removes a listener whose initial subscription callback throws', async () => {
    const deps = makeDependencies();
    const controller = await createAgentConfigController(deps);
    const listener = jest.fn(() => {
      throw new Error('initial_listener_failed');
    });

    expect(() => controller.subscribe(listener)).not.toThrow();
    await controller.patchConnection('direct', {modelName: 'updated'});

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('owns maxSteps validation and exposes a dirty draft without changing active runnability', async () => {
    const deps = makeDependencies();
    const controller = await createAgentConfigController(deps);

    controller.setMaxSteps(1.5);

    expect(controller.getSnapshot()).toMatchObject({
      draft: {maxSteps: 1.5},
      saveState: 'dirty',
      isRunnable: true,
      fieldErrors: {maxSteps: 'max_steps_invalid'},
    });
    await expect(controller.saveAndActivate()).rejects.toThrow(
      'agent_config_invalid',
    );
    expect(deps.repository.save).not.toHaveBeenCalled();
  });

  it('captures maxSteps in the immutable save candidate while retaining a concurrent edit', async () => {
    const deps = makeDependencies();
    const saveStarted = deferred<void>();
    const saveFinished = deferred<void>();
    deps.repository.save.mockImplementation(async () => {
      saveStarted.resolve();
      await saveFinished.promise;
    });
    const controller = await createAgentConfigController(deps);

    const saving = controller.saveAndActivate();
    await saveStarted.promise;
    controller.setMaxSteps(42);
    saveFinished.resolve();
    await saving;

    expect(deps.repository.save.mock.calls[0][0].maxSteps).toBe(99);
    expect(controller.getSnapshot()).toMatchObject({
      draft: {maxSteps: 42},
      saveState: 'dirty',
    });
  });

  it('creates a connection through a controller-owned editor contract without retaining plaintext', async () => {
    const deps = makeDependencies();
    const controller = await createAgentConfigController(deps);

    const id = await controller.upsertConnection({
      providerId: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      modelName: 'deepseek-chat',
      capabilities: {
        vision: false,
        jsonOutput: true,
        toolCalls: true,
        thinking: false,
      },
      apiKey: 'new-secret-9876',
    });

    expect(id).toBe('generated-connection');
    expect(deps.idGenerator.nextConnectionId).toHaveBeenCalledTimes(1);
    expect(deps.idGenerator.nextSecretRef).toHaveBeenCalledWith(
      'generated-connection',
    );
    expect(deps.credentialStore.put).toHaveBeenCalledWith(
      'model:generated-connection:next',
      'new-secret-9876',
    );
    expect(controller.getSnapshot().connectionStatuses[id]).toBe('untested');
    expect(controller.getSnapshot().connections).toContainEqual({
      id,
      providerId: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      modelName: 'deepseek-chat',
      secretRef: 'model:generated-connection:next',
      credentialDisplay: {masked: '••••••••9876', lastFour: '9876'},
      capabilities: {
        vision: false,
        jsonOutput: true,
        toolCalls: true,
        thinking: false,
      },
    });
    expect(JSON.stringify(controller.getSnapshot())).not.toContain(
      'new-secret-9876',
    );
  });

  it('edits through the controller-owned editor contract while preserving id and rotating secretRef', async () => {
    const deps = makeDependencies();
    const controller = await createAgentConfigController(deps);

    await controller.upsertConnection({
      id: 'planner',
      providerId: 'deepseek',
      baseUrl: 'https://new.example.com',
      modelName: 'deepseek-reasoner',
      capabilities: {
        vision: false,
        jsonOutput: true,
        toolCalls: true,
        thinking: true,
      },
      apiKey: 'replacement-key-4321',
    });

    expect(deps.idGenerator.nextConnectionId).not.toHaveBeenCalled();
    expect(deps.credentialStore.put).toHaveBeenCalledWith(
      'model:planner:next',
      'replacement-key-4321',
    );
    expect(
      controller.getSnapshot().connections.find(item => item.id === 'planner'),
    ).toMatchObject({
      providerId: 'deepseek',
      modelName: 'deepseek-reasoner',
      secretRef: 'model:planner:next',
      credentialDisplay: {lastFour: '4321'},
    });
  });

  it('deletes only from the draft, clears every mode reference, and defers secret cleanup', async () => {
    const deps = makeDependencies();
    deps.taskState.isTaskRunning.mockReturnValue(true);
    deps.taskState.tryAcquireActivationLease.mockReturnValue(null);
    const controller = await createAgentConfigController(deps);

    controller.deleteConnection('planner');

    expect(controller.getSnapshot()).toMatchObject({
      draft: {
        modeDrafts: {
          cloudSplit: {plannerConnectionId: undefined},
          localVisionCloudPlanner: {plannerConnectionId: undefined},
        },
      },
      saveState: 'dirty',
      isRunnable: true,
    });
    expect(
      controller.getSnapshot().connections.some(item => item.id === 'planner'),
    ).toBe(false);
    expect(controller.getSnapshot().connectionStatuses.planner).toBeUndefined();
    expect(deps.credentialStore.delete).not.toHaveBeenCalled();
    await expect(controller.saveAndActivate()).rejects.toThrow(
      'agent_config_task_running',
    );
    expect(deps.credentialStore.delete).not.toHaveBeenCalled();
  });

  it('cleans orphaned credentials only after persistence and retries cleanup failures without rollback', async () => {
    const deps = makeDependencies();
    const saveStarted = deferred<void>();
    const saveFinished = deferred<void>();
    deps.repository.save
      .mockImplementationOnce(async () => {
        saveStarted.resolve();
        await saveFinished.promise;
      })
      .mockResolvedValueOnce(undefined);
    deps.credentialStore.delete
      .mockRejectedValueOnce(new Error('keystore_busy'))
      .mockResolvedValueOnce(undefined);
    const controller = await createAgentConfigController(deps);
    controller.deleteConnection('planner');

    const saving = controller.saveAndActivate();
    await saveStarted.promise;
    expect(deps.credentialStore.delete).not.toHaveBeenCalled();
    saveFinished.resolve();
    await expect(saving).resolves.toBeUndefined();

    expect(deps.repository.save).toHaveBeenCalledTimes(1);
    expect(deps.credentialStore.delete).toHaveBeenCalledWith('model:planner');
    expect(controller.getSnapshot()).toMatchObject({
      saveState: 'saved',
      isRunnable: true,
    });

    await expect(controller.saveAndActivate()).resolves.toBeUndefined();
    expect(deps.repository.save).toHaveBeenCalledTimes(2);
    expect(deps.credentialStore.delete).toHaveBeenCalledTimes(2);
  });

  it('rejects a generated secretRef that could alias active or pending credentials', async () => {
    const deps = makeDependencies();
    const saveStarted = deferred<void>();
    const saveFinished = deferred<void>();
    deps.repository.save.mockImplementation(async () => {
      saveStarted.resolve();
      await saveFinished.promise;
    });
    deps.idGenerator.nextSecretRef.mockReturnValue('model:planner');
    const controller = await createAgentConfigController(deps);
    controller.deleteConnection('planner');

    const saving = controller.saveAndActivate();
    await saveStarted.promise;
    await expect(
      controller.upsertConnection({
        providerId: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        modelName: 'replacement-planner',
        capabilities: {
          vision: false,
          jsonOutput: true,
          toolCalls: true,
          thinking: false,
        },
        apiKey: 'replacement-secret',
      }),
    ).rejects.toThrow('agent_config_secret_ref_conflict');
    saveFinished.resolve();
    await saving;

    expect(deps.credentialStore.put).not.toHaveBeenCalled();
    expect(deps.credentialStore.delete).toHaveBeenCalledWith('model:planner');
  });

  it('drives connection test status and invalidates it after an edit', async () => {
    const deps = makeDependencies();
    const test = deferred<void>();
    deps.connectionTester.test.mockReturnValue(test.promise);
    const controller = await createAgentConfigController(deps);
    expect(controller.getSnapshot().connectionStatuses.planner).toBe(
      'untested',
    );

    const testing = controller.testConnection('planner');
    expect(controller.getSnapshot().connectionStatuses.planner).toBe('testing');
    test.resolve();
    await testing;
    expect(controller.getSnapshot().connectionStatuses.planner).toBe('ready');

    await controller.patchConnection('planner', {modelName: 'edited'});
    expect(controller.getSnapshot().connectionStatuses.planner).toBe(
      'untested',
    );
  });

  it('reports a stable connection test failure without leaking provider error or secret', async () => {
    const deps = makeDependencies();
    const maliciousDetail = 'provider-secret-detail sk-live-should-not-leak';
    deps.connectionTester.test.mockRejectedValue(new Error(maliciousDetail));
    const controller = await createAgentConfigController(deps);

    await expect(controller.testConnection('planner')).rejects.toThrow(
      'agent_config_connection_test_failed',
    );

    expect(controller.getSnapshot().connectionStatuses.planner).toBe('error');
    expect(JSON.stringify(controller.getSnapshot())).not.toContain(
      maliciousDetail,
    );
  });

  it('ignores stale test completion after editing or starting a newer test', async () => {
    const deps = makeDependencies();
    const first = deferred<void>();
    const second = deferred<void>();
    deps.connectionTester.test
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const controller = await createAgentConfigController(deps);

    const firstTesting = controller.testConnection('planner');
    await controller.patchConnection('planner', {modelName: 'new-revision'});
    const secondTesting = controller.testConnection('planner');
    first.resolve();
    await firstTesting;
    expect(controller.getSnapshot().connectionStatuses.planner).toBe('testing');
    second.resolve();
    await secondTesting;
    expect(controller.getSnapshot().connectionStatuses.planner).toBe('ready');
  });

  it('rotates secretRef so a dirty key edit cannot mutate the active credential', async () => {
    const deps = makeDependencies();
    const controller = await createAgentConfigController(deps);
    deps.credentialStore.get.mockClear();

    await controller.patchConnection('direct', {apiKey: 'rotated-key-7654'});

    expect(deps.credentialStore.put).toHaveBeenCalledWith(
      'model:direct:next',
      'rotated-key-7654',
    );
    expect(
      controller.getSnapshot().connections.find(item => item.id === 'direct'),
    ).toMatchObject({
      secretRef: 'model:direct:next',
      credentialDisplay: {lastFour: '7654'},
    });
    expect(controller.getSnapshot()).toMatchObject({
      saveState: 'dirty',
      isRunnable: true,
    });
    expect(deps.credentialStore.get).not.toHaveBeenCalled();
    expect(deps.credentialStore.delete).not.toHaveBeenCalled();
  });

  it('isolates a versioned key edit made while an older activation candidate is saving', async () => {
    const deps = makeDependencies();
    const saveStarted = deferred<void>();
    const saveFinished = deferred<void>();
    deps.repository.save.mockImplementationOnce(async () => {
      saveStarted.resolve();
      await saveFinished.promise;
    });
    const controller = await createAgentConfigController(deps);

    const saving = controller.saveAndActivate();
    await saveStarted.promise;
    await controller.patchConnection('direct', {
      apiKey: 'concurrent-rotated-key',
    });
    saveFinished.resolve();
    await saving;

    const persistedConnections = deps.repository.save.mock.calls[0][1];
    expect(
      persistedConnections.find((item: ModelConnection) => item.id === 'direct')
        ?.secretRef,
    ).toBe('model:direct');
    expect(
      controller.getSnapshot().connections.find(item => item.id === 'direct')
        ?.secretRef,
    ).toBe('model:direct:next');
    expect(controller.getSnapshot()).toMatchObject({
      saveState: 'dirty',
      isRunnable: true,
    });
    expect(deps.credentialStore.delete).not.toHaveBeenCalled();

    await controller.saveAndActivate();

    const activatedConnections = deps.repository.save.mock.calls[1][1];
    expect(
      activatedConnections.find((item: ModelConnection) => item.id === 'direct')
        ?.secretRef,
    ).toBe('model:direct:next');
    expect(deps.credentialStore.delete).toHaveBeenCalledWith('model:direct');
  });

  it('binds and clears typed mode connection slots without exposing a draft deep patch', async () => {
    const deps = makeDependencies();
    const controller = await createAgentConfigController(deps);

    controller.setModeConnection(
      {mode: 'cloud_split', slot: 'planner'},
      'direct',
    );
    controller.setModeConnection(
      {mode: 'local_vision_cloud_planner', slot: 'planner'},
      undefined,
    );

    expect(controller.getSnapshot()).toMatchObject({
      draft: {
        modeDrafts: {
          cloudSplit: {plannerConnectionId: 'direct'},
          localVisionCloudPlanner: {plannerConnectionId: undefined},
        },
      },
      saveState: 'dirty',
    });
    expect(() =>
      controller.setModeConnection(
        {mode: 'cloud_direct', slot: 'direct'},
        'missing',
      ),
    ).toThrow('agent_config_connection_not_found');
  });

  it('lets the latest key rotation win and safely cleans the invalidated write', async () => {
    const deps = makeDependencies();
    const firstPut = deferred<void>();
    const secondPut = deferred<void>();
    deps.idGenerator.nextSecretRef
      .mockReturnValueOnce('model:direct:v1')
      .mockReturnValueOnce('model:direct:v2');
    deps.credentialStore.put.mockImplementation(secretRef =>
      secretRef === 'model:direct:v1' ? firstPut.promise : secondPut.promise,
    );
    const controller = await createAgentConfigController(deps);

    const firstRotation = controller.patchConnection('direct', {
      apiKey: 'first-rotation',
    });
    const secondRotation = controller.patchConnection('direct', {
      apiKey: 'second-rotation',
    });
    secondPut.resolve();
    await secondRotation;
    firstPut.resolve();
    await expect(firstRotation).rejects.toThrow(
      'agent_config_connection_changed',
    );

    expect(
      controller.getSnapshot().connections.find(item => item.id === 'direct'),
    ).toMatchObject({
      secretRef: 'model:direct:v2',
      credentialDisplay: {lastFour: 'tion'},
    });
    expect(controller.getSnapshot().connectionStatuses.direct).toBe('untested');
    expect(deps.credentialStore.delete).toHaveBeenCalledWith('model:direct:v1');
  });

  it('does not resurrect a connection or status when key rotation loses to delete', async () => {
    const deps = makeDependencies();
    const put = deferred<void>();
    deps.idGenerator.nextSecretRef.mockReturnValue('model:direct:v1');
    deps.credentialStore.put.mockReturnValue(put.promise);
    const controller = await createAgentConfigController(deps);

    const rotating = controller.patchConnection('direct', {
      apiKey: 'soon-orphaned',
    });
    controller.deleteConnection('direct');
    put.resolve();
    await expect(rotating).rejects.toThrow('agent_config_connection_changed');

    expect(
      controller.getSnapshot().connections.some(item => item.id === 'direct'),
    ).toBe(false);
    expect(controller.getSnapshot().connectionStatuses.direct).toBeUndefined();
    expect(deps.credentialStore.delete).toHaveBeenCalledWith('model:direct:v1');
  });

  it('keeps field errors derived from the latest draft across edits and older save completion', async () => {
    const deps = makeDependencies();
    const saveStarted = deferred<void>();
    const saveFinished = deferred<void>();
    deps.repository.save.mockImplementation(async () => {
      saveStarted.resolve();
      await saveFinished.promise;
    });
    const controller = await createAgentConfigController(deps);

    const saving = controller.saveAndActivate();
    await saveStarted.promise;
    controller.setMaxSteps(1.5);
    await controller.patchConnection('planner', {modelName: 'still-invalid'});
    expect(controller.getSnapshot().fieldErrors).toEqual({
      maxSteps: 'max_steps_invalid',
    });
    saveFinished.resolve();
    await saving;

    expect(controller.getSnapshot()).toMatchObject({
      saveState: 'dirty',
      fieldErrors: {maxSteps: 'max_steps_invalid'},
    });
  });

  it('deletes a shared secretRef only after its final connection reference is removed', async () => {
    const deps = makeDependencies();
    deps.repository.load.mockResolvedValue({
      config: config(),
      connections: [
        ...connections(),
        {
          ...connection('shared-a', connections()[2].capabilities),
          secretRef: 'model:shared',
        },
        {
          ...connection('shared-b', connections()[2].capabilities),
          secretRef: 'model:shared',
        },
      ],
      eligibility: ready,
    });
    const controller = await createAgentConfigController(deps);

    controller.deleteConnection('shared-a');
    await controller.saveAndActivate();
    expect(deps.credentialStore.delete).not.toHaveBeenCalledWith(
      'model:shared',
    );

    controller.deleteConnection('shared-b');
    await controller.saveAndActivate();
    expect(deps.credentialStore.delete).toHaveBeenCalledTimes(1);
    expect(deps.credentialStore.delete).toHaveBeenCalledWith('model:shared');
  });
});
