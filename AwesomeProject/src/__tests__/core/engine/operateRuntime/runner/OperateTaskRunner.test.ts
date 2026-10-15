import {OperateTaskRunner} from '@core/engine/operateRuntime/runner/OperateTaskRunner';
import type {
  OperateTaskEvent,
  OperateTaskRunnerPorts,
} from '@core/engine/operateRuntime/runner/OperateTaskPorts';
import type {TaskAction} from '@core/engine/taskEngine/types/Task';
import type {RuntimeStepResult} from '@core/engine/agentRuntime/runtime/AgentRuntime';
import type {
  OperateSessionLease,
  ResolvedModelBindingSnapshotV1,
  ResolvedOperateSessionV1,
} from '@core/engine/operateRuntime/contracts/OperateSessionContracts';
import type {
  VisualAgentCapabilitySet,
  VisualAgentExecutionPort,
  VisualAgentTaskEvent,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

function modelBinding(
  role: ResolvedModelBindingSnapshotV1['role'],
  maxSteps = 5,
): ResolvedModelBindingSnapshotV1 {
  return {
    role,
    bindingId: `binding:${role}`,
    profileId: `profile:${role}`,
    provider: 'openai',
    transportAdapterId: 'openai',
    protocol: 'openai_chat_completions',
    baseURL: 'https://api.example.com/v1',
    auth: {kind: 'bearer'},
    chatPath: '/chat/completions',
    region: null,
    channel: null,
    secretRef: `model:${role}`,
    modelId: `model-${role}`,
    maxSteps,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    capabilities: {
      chat: true,
      vision: true,
      toolCalls: false,
      reasoning: 'unknown',
    },
    capabilityTrust: 'verified_signed',
  };
}

const visualAgentSnapshot = {
  profileId: 'profile:visual-agent',
  toolId: 'dsh' as const,
  connector: {
    kind: 'connector_bridge' as const,
    bridgeUrl: 'wss://bridge.example.com',
    bindingId: 'bind-1',
    secretRef: null,
  },
  negotiatedCapabilities: {
    imageInput: true,
    structuredAction: true,
    stream: false,
    cancel: true,
    approval: true,
    resume: false,
    steer: false,
    preferences: false,
  } satisfies VisualAgentCapabilitySet,
};

function createSession(
  channel: ResolvedOperateSessionV1['channel'],
  overrides: {maxSteps?: number} = {},
): ResolvedOperateSessionV1 {
  const base = {
    schemaVersion: 1 as const,
    taskId: 'task-1',
    sessionRevision: 7,
    configRevision: 1,
    createdAtMs: 1,
  };
  switch (channel) {
    case 'cloud_direct':
      return {
        ...base,
        channel,
        modelBindings: {direct: modelBinding('direct', overrides.maxSteps)},
      };
    case 'cloud_split':
      return {
        ...base,
        channel,
        modelBindings: {
          vision: modelBinding('vision', overrides.maxSteps),
          planner: modelBinding('split_planner', overrides.maxSteps),
        },
      };
    case 'local_vision_cloud_planner':
      return {
        ...base,
        channel,
        modelBindings: {
          planner: modelBinding('local_planner', overrides.maxSteps),
        },
        localModelId: 'minicpm-v-4.6-q4',
      };
    case 'visual_agent':
      return {
        ...base,
        channel,
        modelBindings: {},
        visualAgent: visualAgentSnapshot,
      };
  }
}

function createLease(
  channel: ResolvedOperateSessionV1['channel'] = 'cloud_direct',
  overrides: {maxSteps?: number} = {},
): OperateSessionLease {
  const controller = new AbortController();
  return {
    session: createSession(channel, overrides),
    owner: 'foreground',
    signal: controller.signal,
    cancel: jest.fn((_reason?: string) => {
      if (controller.signal.aborted) {
        return false;
      }
      controller.abort();
      return true;
    }),
    markTerminal: jest.fn().mockResolvedValue(true),
    release: jest.fn().mockResolvedValue(undefined),
  };
}

function stepResult(
  action: TaskAction,
  overrides: Partial<RuntimeStepResult> = {},
): RuntimeStepResult {
  return {
    decision: {
      schemaVersion: 1,
      subtaskId: 'subtask-1',
      action: action.type === 'complete' ? 'finish' : 'tap',
      expectedState: 'state',
      risk: 'low',
      requiresConfirmation: Boolean(action.requiresConfirmation),
    } as unknown as RuntimeStepResult['decision'],
    taskAction: action,
    diagnostics: {mode: 'cloud_direct', durationMs: 1},
    ...overrides,
  };
}

function createPorts(): {
  ports: OperateTaskRunnerPorts;
  events: OperateTaskEvent[];
} {
  const events: OperateTaskEvent[] = [];
  let counter = 1_000;
  const ports: OperateTaskRunnerPorts = {
    instruction: {load: jest.fn().mockResolvedValue('stored instruction')},
    screenshot: {
      capture: jest.fn().mockResolvedValue('data:image/jpeg;base64,fake'),
    },
    snapshotAgentRuntime: {decideStep: jest.fn()},
    visualAgentRegistry: {require: jest.fn(), list: jest.fn()},
    visualAgentImage: {
      capture: jest.fn().mockResolvedValue({
        mimeType: 'image/jpeg',
        base64: 'fake',
        sharingConfirmed: true,
      }),
    },
    visualAgentApproval: {decide: jest.fn().mockResolvedValue('approve')},
    action: {execute: jest.fn().mockResolvedValue(undefined)},
    confirmation: {confirm: jest.fn().mockResolvedValue(true)},
    history: {
      saveTask: jest.fn().mockResolvedValue(undefined),
      getTaskById: jest.fn().mockResolvedValue(null),
    },
    events: {
      emit: jest.fn((event: OperateTaskEvent) => {
        events.push(event);
      }),
    },
    now: jest.fn(() => counter++),
    delay: jest.fn().mockResolvedValue(undefined),
  };
  return {ports, events};
}

function deferredController() {
  let resolveStarted!: () => void;
  const started = new Promise<void>(resolve => {
    resolveStarted = resolve;
  });
  return {started, resolveStarted};
}

describe('OperateTaskRunner', () => {
  it('complete stops after one inference and calls terminal exactly once', async () => {
    const {ports, events} = createPorts();
    (ports.snapshotAgentRuntime.decideStep as jest.Mock).mockResolvedValue(
      stepResult({type: 'complete', message: 'done'}),
    );
    const runner = new OperateTaskRunner(ports);
    const lease = createLease();

    const outcome = await runner.run(lease);

    expect(outcome).toEqual({kind: 'success'});
    expect(ports.snapshotAgentRuntime.decideStep).toHaveBeenCalledTimes(1);
    expect(ports.action.execute).not.toHaveBeenCalled();
    expect(lease.markTerminal).toHaveBeenCalledTimes(1);
    expect(lease.markTerminal).toHaveBeenCalledWith('success');
    expect(lease.release).toHaveBeenCalledTimes(1);
    expect(events.some(event => event.type === 'taskCompleted')).toBe(true);
  });

  it('persists initial running, action running, and terminal steps in order', async () => {
    const {ports} = createPorts();
    (ports.snapshotAgentRuntime.decideStep as jest.Mock)
      .mockResolvedValueOnce(stepResult({type: 'click', x: 10, y: 20}))
      .mockResolvedValueOnce(stepResult({type: 'complete', message: 'done'}));
    const runner = new OperateTaskRunner(ports);

    const outcome = await runner.run(createLease());

    expect(outcome.kind).toBe('success');
    const persistedStatuses = (
      ports.history.saveTask as jest.Mock
    ).mock.calls.map(([task]) => task.status);
    expect(persistedStatuses).toEqual(['running', 'running', 'success']);
    expect(ports.action.execute).toHaveBeenCalledTimes(1);
  });

  it('increments the consecutive error count on action failures and fails at the threshold', async () => {
    const {ports, events} = createPorts();
    (ports.snapshotAgentRuntime.decideStep as jest.Mock).mockResolvedValue(
      stepResult({type: 'click', x: 1, y: 2}),
    );
    (ports.action.execute as jest.Mock).mockRejectedValue(
      new Error('tap failed'),
    );
    const runner = new OperateTaskRunner(ports);

    const outcome = await runner.run(
      createLease('cloud_direct', {maxSteps: 10}),
    );

    expect(outcome.kind).toBe('failed');
    const stepErrors = events.filter(event => event.type === 'stepError');
    expect(stepErrors).toHaveLength(3);
  });

  it('a successful action resets the consecutive error count', async () => {
    const {ports} = createPorts();
    (ports.snapshotAgentRuntime.decideStep as jest.Mock)
      .mockResolvedValueOnce(stepResult({type: 'click', x: 1, y: 2}))
      .mockResolvedValueOnce(stepResult({type: 'click', x: 3, y: 4}))
      .mockResolvedValueOnce(stepResult({type: 'click', x: 5, y: 6}))
      .mockResolvedValueOnce(stepResult({type: 'complete', message: 'done'}));
    (ports.action.execute as jest.Mock)
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('third failure'));
    const runner = new OperateTaskRunner(ports);

    const outcome = await runner.run(
      createLease('cloud_direct', {maxSteps: 10}),
    );

    expect(outcome.kind).toBe('success');
  });

  it('confirmation rejection fails immediately without executing the action', async () => {
    const {ports} = createPorts();
    (ports.snapshotAgentRuntime.decideStep as jest.Mock).mockResolvedValue(
      stepResult({type: 'click', x: 1, y: 2, requiresConfirmation: true}),
    );
    (ports.confirmation.confirm as jest.Mock).mockResolvedValue(false);
    const runner = new OperateTaskRunner(ports);

    const outcome = await runner.run(createLease());

    expect(outcome.kind).toBe('failed');
    expect(ports.action.execute).not.toHaveBeenCalled();
  });

  it('maximum steps returns a failed outcome', async () => {
    const {ports} = createPorts();
    (ports.snapshotAgentRuntime.decideStep as jest.Mock).mockResolvedValue(
      stepResult({type: 'click', x: 1, y: 2}),
    );
    const runner = new OperateTaskRunner(ports);

    const outcome = await runner.run(
      createLease('cloud_direct', {maxSteps: 2}),
    );

    expect(outcome.kind).toBe('failed');
    expect(ports.action.execute).toHaveBeenCalledTimes(2);
  });

  it('cancel during screenshot capture returns cancelled', async () => {
    const {ports} = createPorts();
    const lease = createLease();
    const gate = deferredController();
    (ports.screenshot.capture as jest.Mock).mockImplementation(
      (signal: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          gate.resolveStarted();
          signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    const runner = new OperateTaskRunner(ports);

    const outcomePromise = runner.run(lease);
    await gate.started;
    lease.cancel();
    const outcome = await outcomePromise;

    expect(outcome.kind).toBe('cancelled');
  });

  it('cancel during inference returns cancelled', async () => {
    const {ports} = createPorts();
    const lease = createLease();
    const gate = deferredController();
    (ports.snapshotAgentRuntime.decideStep as jest.Mock).mockImplementation(
      (_session: unknown, input: {signal: AbortSignal}) =>
        new Promise<RuntimeStepResult>((_resolve, reject) => {
          gate.resolveStarted();
          input.signal.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            {once: true},
          );
        }),
    );
    const runner = new OperateTaskRunner(ports);

    const outcomePromise = runner.run(lease);
    await gate.started;
    lease.cancel();
    const outcome = await outcomePromise;

    expect(outcome.kind).toBe('cancelled');
  });

  it('cancel during confirmation returns cancelled', async () => {
    const {ports} = createPorts();
    const lease = createLease();
    (ports.snapshotAgentRuntime.decideStep as jest.Mock).mockResolvedValue(
      stepResult({type: 'click', x: 1, y: 2, requiresConfirmation: true}),
    );
    const gate = deferredController();
    (ports.confirmation.confirm as jest.Mock).mockImplementation(
      (_action: TaskAction, signal: AbortSignal) =>
        new Promise<boolean>((_resolve, reject) => {
          gate.resolveStarted();
          signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    const runner = new OperateTaskRunner(ports);

    const outcomePromise = runner.run(lease);
    await gate.started;
    lease.cancel();
    const outcome = await outcomePromise;

    expect(outcome.kind).toBe('cancelled');
    expect(ports.action.execute).not.toHaveBeenCalled();
  });

  it('cancel during action execution returns cancelled', async () => {
    const {ports} = createPorts();
    const lease = createLease();
    (ports.snapshotAgentRuntime.decideStep as jest.Mock).mockResolvedValue(
      stepResult({type: 'click', x: 1, y: 2}),
    );
    const gate = deferredController();
    (ports.action.execute as jest.Mock).mockImplementation(
      (_action: TaskAction, signal: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          gate.resolveStarted();
          signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    const runner = new OperateTaskRunner(ports);

    const outcomePromise = runner.run(lease);
    await gate.started;
    lease.cancel();
    const outcome = await outcomePromise;

    expect(outcome.kind).toBe('cancelled');
  });

  it('cancel during delay returns cancelled without another screenshot', async () => {
    const {ports} = createPorts();
    const lease = createLease();
    (ports.snapshotAgentRuntime.decideStep as jest.Mock).mockResolvedValue(
      stepResult({type: 'click', x: 1, y: 2}),
    );
    const gate = deferredController();
    (ports.delay as jest.Mock).mockImplementation(
      (_ms: number, signal: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          gate.resolveStarted();
          signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    const runner = new OperateTaskRunner(ports);

    const outcomePromise = runner.run(lease);
    await gate.started;
    lease.cancel();
    const outcome = await outcomePromise;

    expect(outcome.kind).toBe('cancelled');
    expect(ports.screenshot.capture).toHaveBeenCalledTimes(1);
  });

  it('terminal persistence failure never emits a success outcome', async () => {
    const {ports, events} = createPorts();
    (ports.snapshotAgentRuntime.decideStep as jest.Mock).mockResolvedValue(
      stepResult({type: 'complete', message: 'done'}),
    );
    (ports.history.saveTask as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('storage unavailable'));
    const runner = new OperateTaskRunner(ports);

    const outcome = await runner.run(createLease());

    expect(outcome.kind).toBe('failed');
    expect(events.some(event => event.type === 'taskCompleted')).toBe(false);
  });

  it('retained history contains no image payload', async () => {
    const {ports} = createPorts();
    (ports.snapshotAgentRuntime.decideStep as jest.Mock)
      .mockResolvedValueOnce(stepResult({type: 'click', x: 10, y: 20}))
      .mockResolvedValueOnce(stepResult({type: 'complete', message: 'done'}));
    const runner = new OperateTaskRunner(ports);

    await runner.run(createLease());

    const secondCallInput = (ports.snapshotAgentRuntime.decideStep as jest.Mock)
      .mock.calls[1][1];
    expect(JSON.stringify(secondCallInput.history)).not.toContain('data:image');
  });

  it('emits strictly increasing sequence numbers scoped to the task/session', async () => {
    const {ports, events} = createPorts();
    (ports.snapshotAgentRuntime.decideStep as jest.Mock)
      .mockResolvedValueOnce(stepResult({type: 'click', x: 10, y: 20}))
      .mockResolvedValueOnce(stepResult({type: 'complete', message: 'done'}));
    const runner = new OperateTaskRunner(ports);
    const lease = createLease();

    await runner.run(lease);

    expect(events.length).toBeGreaterThan(1);
    for (const event of events) {
      expect(event.taskId).toBe(lease.session.taskId);
      expect(event.sessionRevision).toBe(lease.session.sessionRevision);
    }
    for (let index = 1; index < events.length; index += 1) {
      expect(events[index].sequence).toBeGreaterThan(
        events[index - 1].sequence,
      );
    }
  });

  it.each([
    'cloud_direct',
    'cloud_split',
    'local_vision_cloud_planner',
  ] as const)(
    'runs %s through the snapshot-bound adapter and the same action port',
    async channel => {
      const {ports} = createPorts();
      (ports.snapshotAgentRuntime.decideStep as jest.Mock).mockResolvedValue(
        stepResult({type: 'complete', message: 'done'}),
      );
      const runner = new OperateTaskRunner(ports);
      const lease = createLease(channel);

      await runner.run(lease);

      expect(ports.snapshotAgentRuntime.decideStep).toHaveBeenCalledWith(
        lease.session,
        expect.objectContaining({signal: lease.signal}),
      );
    },
  );

  it('loads instruction only from TaskInstructionPort', async () => {
    const {ports} = createPorts();
    (ports.snapshotAgentRuntime.decideStep as jest.Mock).mockResolvedValue(
      stepResult({type: 'complete', message: 'done'}),
    );
    const runner = new OperateTaskRunner(ports);

    await runner.run(createLease());

    expect(ports.instruction.load).toHaveBeenCalledWith('task-1');
    expect(ports.snapshotAgentRuntime.decideStep).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({instruction: 'stored instruction'}),
    );
  });

  it('executes visual_agent through the frozen task envelope contract', async () => {
    const {ports, events} = createPorts();
    const lease = createLease('visual_agent');
    let subscriber: ((event: VisualAgentTaskEvent) => void) | undefined;
    const execution: VisualAgentExecutionPort = {
      getConnectionState: jest.fn(),
      connect: jest
        .fn()
        .mockResolvedValue(visualAgentSnapshot.negotiatedCapabilities),
      disconnect: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockImplementation(async () => {
        subscriber?.({
          type: 'terminal',
          taskId: 'task-1',
          sessionRevision: 7,
          sequence: 1,
          status: 'completed',
          result: {summary: 'done'},
        });
        return {taskId: 'task-1'};
      }),
      cancel: jest.fn().mockResolvedValue(undefined),
      resolveApproval: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined),
      steer: jest.fn().mockResolvedValue(undefined),
      requestPreferences: jest.fn(),
      subscribe: jest.fn((listener: (event: VisualAgentTaskEvent) => void) => {
        subscriber = listener;
        return jest.fn();
      }),
    };
    (ports.visualAgentRegistry.require as jest.Mock).mockReturnValue({
      toolId: 'dsh',
      manifest: {},
      create: jest.fn().mockReturnValue(execution),
    });
    const runner = new OperateTaskRunner(ports);

    const outcome = await runner.run(lease);

    expect(outcome).toEqual({kind: 'success'});
    expect(ports.visualAgentRegistry.require).toHaveBeenCalledWith('dsh');
    expect(execution.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'profile:visual-agent',
        toolId: 'dsh',
      }),
      lease.signal,
    );
    expect(execution.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        protocolVersion: 1,
        taskId: 'task-1',
        sessionRevision: 7,
        profileId: 'profile:visual-agent',
        instruction: 'stored instruction',
        idempotencyKey: 'task-1:7',
        requiredCapabilities: visualAgentSnapshot.negotiatedCapabilities,
        image: expect.objectContaining({sharingConfirmed: true}),
      }),
      lease.signal,
    );
    expect(ports.snapshotAgentRuntime.decideStep).not.toHaveBeenCalled();
    expect(ports.screenshot.capture).not.toHaveBeenCalled();
    expect(ports.visualAgentImage.capture).toHaveBeenCalledWith(lease.signal);
    expect(lease.markTerminal).toHaveBeenCalledWith('success');
    expect(events.some(event => event.type === 'taskCompleted')).toBe(true);
  });
});
