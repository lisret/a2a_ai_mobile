// Wave 4A Task 11 scaffold (acceptance channel gate). RED by design: no
// production composition wires OperateRuntime + OperateTaskRunner + the model
///visual-agent registries into one reusable end-to-end harness yet, so
// `createRuntimeHarness` below is an intentionally-unimplemented placeholder.
// A later wave's testing agent replaces its body with real injected fakes
// (deterministic native ports, in-memory config/session repositories) without
// touching the assertions in this file. Do not add production backdoors here.

type ChannelMode = 'cloud_direct' | 'cloud_split' | 'local_vision_cloud_planner';
type FrozenProvider = 'openai-compatible' | 'anthropic' | 'gemini' | 'custom';
type VisualAgentToolId = 'openclaw' | 'codex' | 'cursor' | 'dsh' | 'hermes';
type VisualAgentReadiness = 'disconnected' | 'ready';

interface RuntimeHarnessOptions {
  readonly mode?: ChannelMode;
  readonly provider?: FrozenProvider;
  readonly visualAgent?: {
    readonly toolId: VisualAgentToolId;
    readonly readiness: VisualAgentReadiness;
    readonly imageInput: boolean;
    readonly structuredAction: boolean;
    readonly profileId?: string;
    readonly sourceConfigRevision?: number;
  };
}

interface StartedTask {
  readonly kind: 'started';
  readonly taskId: string;
}

interface BlockedTask {
  readonly kind: 'blocked';
  readonly reason?: string;
}

type StartOutcome = StartedTask | BlockedTask;

interface CompletedOutcome {
  readonly status: 'success' | 'failed' | 'cancelled';
}

interface ResolveTransportCall {
  readonly mode: 'preset' | 'custom';
}

interface RuntimeHarness {
  readonly direct: jest.Mock;
  readonly perception: jest.Mock;
  readonly planner: jest.Mock;
  readonly local: jest.Mock;
  readonly registry: {readonly resolveTransport: jest.Mock<unknown, [ResolveTransportCall]>};
  readonly transports: Record<string, {readonly sendChat: jest.Mock}>;
  start(instruction: string): Promise<StartOutcome>;
  startAndComplete(instruction: string): Promise<CompletedOutcome>;
  otherTransportCallCount(transportId: string): number;
  liveConfigReadCountDuringRun(): number;
  allPipelineCalls(): number;
  saveAndActivateProfile(input: {toolId: VisualAgentToolId; profileId: string}): Promise<void>;
  readTaskProfileSnapshot(taskId: string): Promise<{
    toolId: VisualAgentToolId;
    profileId: string;
    sourceConfigRevision: number;
  }>;
}

/**
 * Wave 4A scaffold placeholder. The real harness must compose the frozen
 * `OperateRuntime` + `OperateTaskRunner` + `ModelProviderRegistry` +
 * `VisualAgentToolRegistry` with deterministic fake native ports (never a
 * production backdoor or a real timer) and expose the counters/spies this
 * file asserts against. Building that composition is explicitly out of scope
 * for this scaffold wave; every test below is expected to fail here.
 */
function createRuntimeHarness(_options: RuntimeHarnessOptions): RuntimeHarness {
  throw new Error(
    'createRuntimeHarness is not implemented yet (Wave 4A acceptance scaffold placeholder)',
  );
}

describe.each([
  ['cloud_direct', {direct: 1, perception: 0, planner: 0, local: 0}],
  ['cloud_split', {direct: 0, perception: 1, planner: 1, local: 0}],
  ['local_vision_cloud_planner', {direct: 0, perception: 0, planner: 1, local: 1}],
] as const)('%s channel', (mode, calls) => {
  it('uses only the resolved session channel', async () => {
    const harness = createRuntimeHarness({mode});
    const result = await harness.startAndComplete('打开设置');
    expect(result.status).toBe('success');
    expect(harness.direct).toHaveBeenCalledTimes(calls.direct);
    expect(harness.perception).toHaveBeenCalledTimes(calls.perception);
    expect(harness.planner).toHaveBeenCalledTimes(calls.planner);
    expect(harness.local).toHaveBeenCalledTimes(calls.local);
  });
});

it.each([
  ['openai-compatible', 'openai'],
  ['anthropic', 'anthropic'],
  ['gemini', 'gemini'],
  ['custom', 'custom'],
] as const)('dispatches a frozen %s binding only through transport %s', async (provider, transportId) => {
  const harness = createRuntimeHarness({provider});
  await harness.startAndComplete('打开设置');
  expect(harness.registry.resolveTransport).toHaveBeenCalledWith(
    expect.objectContaining({mode: provider === 'custom' ? 'custom' : 'preset'}),
  );
  expect(harness.transports[transportId].sendChat).toHaveBeenCalled();
  expect(harness.otherTransportCallCount(transportId)).toBe(0);
  expect(harness.liveConfigReadCountDuringRun()).toBe(0);
});

describe.each(['openclaw', 'codex', 'cursor', 'dsh', 'hermes'] as const)('%s visual adapter', toolId => {
  it('blocks disconnect and missing mandatory capabilities with zero fallback', async () => {
    const disconnected = createRuntimeHarness({
      visualAgent: {toolId, readiness: 'disconnected', imageInput: true, structuredAction: true},
    });
    await expect(disconnected.start('打开设置')).resolves.toMatchObject({kind: 'blocked'});
    expect(disconnected.allPipelineCalls()).toBe(0);

    const incapable = createRuntimeHarness({
      visualAgent: {toolId, readiness: 'ready', imageInput: true, structuredAction: false},
    });
    await expect(incapable.start('打开设置')).resolves.toMatchObject({kind: 'blocked'});
    expect(incapable.allPipelineCalls()).toBe(0);
  });
});

it('keeps the task-owned visual profile snapshot after active profile changes', async () => {
  const harness = createRuntimeHarness({
    visualAgent: {toolId: 'openclaw', readiness: 'ready', imageInput: true, structuredAction: true, profileId: 'p-1', sourceConfigRevision: 3},
  });
  const task = await harness.start('打开设置');
  if (task.kind !== 'started') throw new Error('expected started task');
  await harness.saveAndActivateProfile({toolId: 'cursor', profileId: 'p-2'});
  expect(await harness.readTaskProfileSnapshot(task.taskId)).toMatchObject({
    toolId: 'openclaw',
    profileId: 'p-1',
    sourceConfigRevision: 3,
  });
});
