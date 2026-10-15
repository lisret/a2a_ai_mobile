import fs from 'node:fs';
import path from 'node:path';

import {
  RegistryModelChatAdapter,
  executionTargetFromModelSnapshot,
} from '@core/engine/operateRuntime/runner/OperateTaskPorts';
import {SnapshotAgentRuntimeAdapter} from '@core/engine/operateRuntime/runner/SnapshotAgentRuntimeAdapter';
import type {
  ModelProviderRegistry,
  ProviderTransportAdapter,
} from '@core/engine/operateRuntime/model/ModelProviderContracts';
import type {ResolvedModelBindingSnapshotV1} from '@core/engine/operateRuntime/contracts/OperateSessionContracts';
import type {RuntimeStepInput} from '@core/engine/agentRuntime/runtime/AgentRuntime';

function baseSnapshot(
  role: ResolvedModelBindingSnapshotV1['role'],
  overrides: Partial<ResolvedModelBindingSnapshotV1> = {},
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
    maxSteps: 12,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    capabilities: {
      chat: true,
      vision: true,
      toolCalls: false,
      reasoning: 'unknown',
    },
    capabilityTrust: 'verified_signed',
    ...overrides,
  };
}

function jsonEnvelopeResult(payload: Record<string, unknown>) {
  return {
    text: JSON.stringify(payload),
    finishReason: 'stop',
    usage: {inputTokens: null, outputTokens: null},
  };
}

const finishDecision = (subtaskId: string) => ({
  schemaVersion: 1,
  subtaskId,
  action: 'finish',
  expectedState: 'done',
  risk: 'low',
});

const observationPayload = {
  schemaVersion: 1,
  stateSummary: 'home screen',
  visibleText: [],
  elements: [],
  uncertainties: [],
};

function createRuntimeInput(
  overrides: Partial<RuntimeStepInput> = {},
): RuntimeStepInput {
  const controller = new AbortController();
  return {
    screenshotUri: 'data:image/jpeg;base64,fake',
    instruction: 'open settings',
    history: [],
    signal: controller.signal,
    ...overrides,
  };
}

describe('RegistryModelChatAdapter', () => {
  function createTransport(
    id: ProviderTransportAdapter['id'],
  ): ProviderTransportAdapter {
    return {
      id,
      sendChat: jest
        .fn()
        .mockResolvedValue(jsonEnvelopeResult(finishDecision('s1'))),
    };
  }

  it('reconstructs target/binding from the snapshot and dispatches through the resolved transport', async () => {
    const transport = createTransport('openai');
    const registry: ModelProviderRegistry = {
      listPresets: jest.fn(),
      resolveExecutionTarget: jest.fn(),
      resolveTransport: jest.fn().mockReturnValue(transport),
      resolveCatalog: jest.fn(),
    };
    const snapshot = baseSnapshot('direct');
    const signal = new AbortController().signal;
    const adapter = new RegistryModelChatAdapter(registry);

    await adapter.send(snapshot, [{role: 'user', text: 'hi'}], signal);

    expect(registry.resolveTransport).toHaveBeenCalledWith(
      executionTargetFromModelSnapshot(snapshot),
    );
    expect(transport.sendChat).toHaveBeenCalledWith({
      target: executionTargetFromModelSnapshot(snapshot),
      binding: {
        id: snapshot.bindingId,
        role: snapshot.role,
        profileId: snapshot.profileId,
        modelId: snapshot.modelId,
        maxSteps: snapshot.maxSteps,
      },
      messages: [{role: 'user', text: 'hi'}],
      signal,
      timeoutMs: 30_000,
    });
    expect(registry.resolveExecutionTarget).not.toHaveBeenCalled();
  });

  it.each(['anthropic', 'gemini', 'custom'] as const)(
    'dispatches the immutable %s snapshot through its exact registry transport',
    async transportId => {
      const transport = createTransport(transportId);
      const registry: ModelProviderRegistry = {
        listPresets: jest.fn(),
        resolveExecutionTarget: jest.fn(),
        resolveTransport: jest.fn().mockReturnValue(transport),
        resolveCatalog: jest.fn(),
      };
      const snapshot = baseSnapshot('direct', {
        transportAdapterId: transportId,
        provider: transportId === 'custom' ? 'custom' : transportId,
      });
      const adapter = new RegistryModelChatAdapter(registry);

      await adapter.send(
        snapshot,
        [{role: 'user', text: 'safe prompt'}],
        new AbortController().signal,
      );

      expect(transport.sendChat).toHaveBeenCalledTimes(1);
    },
  );

  it('fails closed when registry transport identity differs from the immutable snapshot', async () => {
    const geminiTransport = createTransport('gemini');
    const registry: ModelProviderRegistry = {
      listPresets: jest.fn(),
      resolveExecutionTarget: jest.fn(),
      resolveTransport: jest.fn().mockReturnValue(geminiTransport),
      resolveCatalog: jest.fn(),
    };
    const snapshot = baseSnapshot('direct', {transportAdapterId: 'anthropic'});
    const adapter = new RegistryModelChatAdapter(registry);

    await expect(
      adapter.send(
        snapshot,
        [{role: 'user', text: 'safe prompt'}],
        new AbortController().signal,
      ),
    ).rejects.toThrow('model_transport_snapshot_mismatch');
    expect(geminiTransport.sendChat).not.toHaveBeenCalled();
  });
});

describe('SnapshotAgentRuntimeAdapter', () => {
  function createAdapter(chatSend: jest.Mock) {
    const chat = {send: chatSend};
    const localPerceptionProviderFactory = jest.fn();
    const invalidateLocalEligibility = jest.fn();
    const viewportAdapter = {
      getDimensions: jest.fn().mockResolvedValue({width: 1000, height: 1000}),
    };
    const adapter = new SnapshotAgentRuntimeAdapter(
      chat,
      localPerceptionProviderFactory,
      viewportAdapter,
      invalidateLocalEligibility,
      () => 1_000,
    );
    return {
      adapter,
      chat,
      localPerceptionProviderFactory,
      invalidateLocalEligibility,
      viewportAdapter,
    };
  }

  it('maps cloud_direct to only its frozen direct binding', async () => {
    const chatSend = jest
      .fn()
      .mockResolvedValue(jsonEnvelopeResult(finishDecision('s1')));
    const {adapter, localPerceptionProviderFactory} = createAdapter(chatSend);
    const directSnapshot = baseSnapshot('direct');
    const session = {
      schemaVersion: 1 as const,
      taskId: 'task-1',
      sessionRevision: 1,
      configRevision: 1,
      channel: 'cloud_direct' as const,
      modelBindings: {direct: directSnapshot},
      createdAtMs: 1,
    };

    const result = await adapter.decideStep(session, createRuntimeInput());

    expect(chatSend).toHaveBeenCalledTimes(1);
    expect(chatSend.mock.calls[0][0]).toBe(directSnapshot);
    expect(result.taskAction).toMatchObject({
      type: 'complete',
      message: 'done',
    });
    expect(localPerceptionProviderFactory).not.toHaveBeenCalled();
  });

  it('maps cloud_split to only its frozen vision and planner bindings', async () => {
    const visionSnapshot = baseSnapshot('vision');
    const plannerSnapshot = baseSnapshot('split_planner');
    const chatSend = jest
      .fn()
      .mockResolvedValueOnce(jsonEnvelopeResult(observationPayload))
      .mockResolvedValueOnce(jsonEnvelopeResult(finishDecision('s2')));
    const {adapter, localPerceptionProviderFactory} = createAdapter(chatSend);
    const session = {
      schemaVersion: 1 as const,
      taskId: 'task-1',
      sessionRevision: 1,
      configRevision: 1,
      channel: 'cloud_split' as const,
      modelBindings: {vision: visionSnapshot, planner: plannerSnapshot},
      createdAtMs: 1,
    };

    const result = await adapter.decideStep(session, createRuntimeInput());

    expect(chatSend).toHaveBeenCalledTimes(2);
    expect(chatSend.mock.calls[0][0]).toBe(visionSnapshot);
    expect(chatSend.mock.calls[1][0]).toBe(plannerSnapshot);
    expect(result.taskAction).toMatchObject({type: 'complete'});
    expect(localPerceptionProviderFactory).not.toHaveBeenCalled();
  });

  it('maps local_vision_cloud_planner to the local perception factory plus only the planner binding', async () => {
    const plannerSnapshot = baseSnapshot('split_planner');
    const chatSend = jest
      .fn()
      .mockResolvedValue(jsonEnvelopeResult(finishDecision('s3')));
    const localObserve = jest.fn().mockResolvedValue(observationPayload);
    const {adapter, localPerceptionProviderFactory} = createAdapter(chatSend);
    localPerceptionProviderFactory.mockReturnValue({observe: localObserve});
    const session = {
      schemaVersion: 1 as const,
      taskId: 'task-1',
      sessionRevision: 1,
      configRevision: 1,
      channel: 'local_vision_cloud_planner' as const,
      modelBindings: {planner: plannerSnapshot},
      localModelId: 'minicpm-v-4.6-q4' as const,
      createdAtMs: 1,
    };

    const result = await adapter.decideStep(session, createRuntimeInput());

    expect(localPerceptionProviderFactory).toHaveBeenCalledTimes(1);
    expect(localPerceptionProviderFactory).toHaveBeenCalledWith(
      'minicpm-v-4.6-q4',
    );
    expect(chatSend).toHaveBeenCalledTimes(1);
    expect(chatSend.mock.calls[0][0]).toBe(plannerSnapshot);
    expect(result.taskAction).toMatchObject({type: 'complete'});
  });

  it('fails closed with local_perception_unavailable and never calls the cloud planner chat', async () => {
    const plannerSnapshot = baseSnapshot('split_planner');
    const chatSend = jest.fn();
    const {
      adapter,
      localPerceptionProviderFactory,
      invalidateLocalEligibility,
    } = createAdapter(chatSend);
    localPerceptionProviderFactory.mockReturnValue({
      observe: jest.fn().mockRejectedValue(new Error('local model crashed')),
    });
    const session = {
      schemaVersion: 1 as const,
      taskId: 'task-1',
      sessionRevision: 1,
      configRevision: 1,
      channel: 'local_vision_cloud_planner' as const,
      modelBindings: {planner: plannerSnapshot},
      localModelId: 'minicpm-v-4.6-q4' as const,
      createdAtMs: 1,
    };

    await expect(
      adapter.decideStep(session, createRuntimeInput()),
    ).rejects.toMatchObject({
      code: 'local_perception_unavailable',
    });
    expect(chatSend).not.toHaveBeenCalled();
    expect(invalidateLocalEligibility).toHaveBeenCalledWith(
      'local_perception_unavailable',
    );
  });

  it('has no live config, profile repository, catalog, or feature-model dependency', () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../../../core/engine/operateRuntime/runner/SnapshotAgentRuntimeAdapter.ts',
      ),
      'utf8',
    );
    expect(source).not.toMatch(
      /RuntimeConfigRepository|ModelEndpointProfileRepository|ProviderModelCatalogPort|ModelService/,
    );
  });
});
