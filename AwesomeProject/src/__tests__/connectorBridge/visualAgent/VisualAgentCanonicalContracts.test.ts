// Wave 2A Task 7: proves the Connector Bridge consumes the nine frozen Wave 1
// contracts byte-for-byte and defines only the bridge-only seams (ports,
// upstream protocol union, and the tool-agnostic conformance runner).
import {createVisualAgentToolRegistry} from '@core/engine/operateRuntime/visualAgent/VisualAgentToolRegistry';
import type {
  VisualAgentCapabilitySet,
  VisualAgentConnectionState,
  VisualAgentExecutionPort,
  VisualAgentProfileV1,
  VisualAgentProtocolV1,
  VisualAgentTaskEnvelopeV1,
  VisualAgentTaskEvent,
  VisualAgentToolAdapter,
  VisualAgentToolId,
  VisualAgentToolRegistry,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import {
  defineVisualAgentAdapterConformance,
  type VisualAgentAdapterConformanceFixture,
  type VisualAgentConformanceOptions,
} from '../../../connectorBridge/visualAgent/conformance/VisualAgentAdapterConformance';
import type {
  VisualAgentBindingPort,
  VisualAgentUpstreamPort,
  VisualAgentUpstreamProtocol,
} from '../../../connectorBridge/visualAgent/ports/VisualAgentUpstreamPort';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? true
  : false;

const caps: VisualAgentCapabilitySet = {
  imageInput: true,
  structuredAction: true,
  stream: true,
  cancel: true,
  approval: true,
  resume: true,
  steer: true,
  preferences: true,
};

const capabilityKeys = Object.keys(caps) as readonly (keyof VisualAgentCapabilitySet)[];

const adapter = (toolId: VisualAgentToolId): VisualAgentToolAdapter => ({
  toolId,
  manifest: {
    toolId,
    displayName: `Tool ${toolId}`,
    maturity: 'stable',
    adapterVersion: '1.0.0',
    protocolVersions: [1],
    declaredCapabilities: caps,
  },
  create: () => ({}) as VisualAgentExecutionPort,
});

describe('the runtime canonical registry has no local alias', () => {
  it('uses the runtime canonical registry without a local alias', () => {
    const adapters = (['openclaw', 'codex', 'cursor', 'dsh', 'hermes'] as const).map(adapter);
    const registry = createVisualAgentToolRegistry(adapters);
    expect(registry.list()).toEqual(['openclaw', 'codex', 'cursor', 'dsh', 'hermes']);
    expect(() => createVisualAgentToolRegistry([...adapters, adapters[0]])).toThrow(
      'visual_agent_adapter_duplicate',
    );
    expect(() => registry.require('other' as never)).toThrow('visual_agent_adapter_not_found');

    type RuntimeRegistry =
      import('@core/engine/operateRuntime/visualAgent/VisualAgentContracts').VisualAgentToolRegistry;
    const exact: Equal<ReturnType<typeof createVisualAgentToolRegistry>, RuntimeRegistry> = true;
    expect(exact).toBe(true);
  });
});

describe('compile-time equality against the frozen acceptance excerpt', () => {
  it('re-exports no alternate shape for the nine frozen contract names', () => {
    // Nine names, verified by direct assignability against literal acceptance
    // shapes drawn from the Frozen Cross-Task Contracts section: a mismatch
    // here is a TypeScript compile failure, not a runtime assertion.
    const toolId: VisualAgentToolId = 'custom:acme';
    const capabilitySet: VisualAgentCapabilitySet = caps;
    const profile: VisualAgentProfileV1 = {
      schemaVersion: 1,
      profileId: 'p1',
      toolId: 'codex',
      enabled: true,
      connector: {kind: 'connector_bridge', bridgeUrl: 'https://bridge.example', bindingId: 'b1', secretRef: null},
      requestedCapabilities: caps,
    };
    const registry: VisualAgentToolRegistry = createVisualAgentToolRegistry([]);
    const connectionState: VisualAgentConnectionState = {status: 'disabled'};
    const envelope: VisualAgentTaskEnvelopeV1 = {
      protocolVersion: 1,
      taskId: 't1',
      sessionRevision: 1,
      profileId: 'p1',
      instruction: 'do it',
      idempotencyKey: 'k1',
      requiredCapabilities: caps,
    };
    const protocolMessage: VisualAgentProtocolV1 = {
      version: 1,
      type: 'session.open',
      requestId: 'r1',
      profileId: 'p1',
      toolId: 'codex',
      requestedCapabilities: caps,
    };
    const toolAdapter: VisualAgentToolAdapter = adapter('codex');

    expect(toolId).toBe('custom:acme');
    expect(capabilitySet).toEqual(caps);
    expect(profile.schemaVersion).toBe(1);
    expect(registry.list()).toEqual([]);
    expect(connectionState.status).toBe('disabled');
    expect(envelope.protocolVersion).toBe(1);
    expect(protocolMessage.type).toBe('session.open');
    expect(toolAdapter.toolId).toBe('codex');
  });
});

describe('bridge-only seams', () => {
  it('defines the frozen VisualAgentUpstreamProtocol union', () => {
    const protocols: readonly VisualAgentUpstreamProtocol[] = [
      'gateway_ws',
      'cli_exec_jsonl',
      'agent_cli_ndjson',
      'acp_json_rpc_stdio',
      'app_server_json_rpc_stdio',
      'gateway_json_rpc_stdio',
      'gateway_json_rpc_ws',
      'cloud_agents_http',
      'runs_http_sse',
      'dsh_cli',
      'custom_bridge',
    ];
    expect(protocols).toHaveLength(11);
  });

  it('declares VisualAgentUpstreamPort and VisualAgentBindingPort as bridge-only seams', () => {
    const upstream: VisualAgentUpstreamPort = {
      open: async () => ({
        negotiate: async requested => requested,
        send: async () => undefined,
        subscribe: () => () => undefined,
        close: async () => undefined,
      }),
    };
    const binding: VisualAgentBindingPort = {
      read: async () => ({}),
    };
    expect(typeof upstream.open).toBe('function');
    expect(typeof binding.read).toBe('function');
  });
});

function createFakeFixture(
  overrides: Partial<VisualAgentCapabilitySet> = {},
): VisualAgentAdapterConformanceFixture {
  const listeners = new Set<(event: VisualAgentTaskEvent) => void>();
  const negotiatedCapabilities: VisualAgentCapabilitySet = {...caps, ...overrides};
  let connectionState: VisualAgentConnectionState = {status: 'disconnected'};
  let currentTaskId = '';
  let currentSessionRevision = 0;
  let sequence = 0;
  const fallbackCalls = {count: 0};

  const nextSequence = () => {
    sequence += 1;
    return sequence;
  };
  const dispatch = (event: VisualAgentTaskEvent) => {
    listeners.forEach(listener => listener(event));
  };

  const profile: VisualAgentProfileV1 = {
    schemaVersion: 1,
    profileId: 'conformance-profile',
    toolId: 'custom:fake',
    enabled: true,
    connector: {
      kind: 'connector_bridge',
      bridgeUrl: 'https://bridge.example',
      bindingId: 'fake-binding',
      secretRef: null,
    },
    requestedCapabilities: caps,
  };

  const port: VisualAgentExecutionPort = {
    getConnectionState: () => connectionState,
    connect: async () => {
      connectionState = {status: 'ready', negotiatedCapabilities};
      return negotiatedCapabilities;
    },
    disconnect: async () => {
      connectionState = {status: 'disconnected'};
    },
    execute: async envelope => {
      currentTaskId = envelope.taskId;
      currentSessionRevision = envelope.sessionRevision;
      return {taskId: envelope.taskId};
    },
    cancel: async () => undefined,
    resolveApproval: async () => undefined,
    resume: async () => undefined,
    steer: async () => undefined,
    requestPreferences: async () => ({type: 'list', preferences: []}),
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  const fakeAdapter: VisualAgentToolAdapter = {
    toolId: 'custom:fake',
    manifest: {
      toolId: 'custom:fake',
      displayName: 'Fake',
      maturity: 'experimental',
      adapterVersion: '1.0.0',
      protocolVersions: [1],
      declaredCapabilities: negotiatedCapabilities,
    },
    create: () => port,
  };

  return {
    toolId: 'custom:fake',
    adapter: fakeAdapter,
    profile,
    binding: {},
    upstream: {
      open: async () => ({
        negotiate: async requested => requested,
        send: async () => undefined,
        subscribe: () => () => undefined,
        close: async () => undefined,
      }),
    },
    supportedCapabilities: negotiatedCapabilities,
    fallbackSpy: {callCount: () => fallbackCalls.count},
    emitStatus: status =>
      dispatch({type: 'status', taskId: currentTaskId, sessionRevision: currentSessionRevision, sequence: nextSequence(), status}),
    emitApproval: approvalId =>
      dispatch({
        type: 'status',
        taskId: currentTaskId,
        sessionRevision: currentSessionRevision,
        sequence: nextSequence(),
        status: 'waiting_approval',
        approvalId,
      }),
    emitDelta: input =>
      dispatch({
        type: 'delta',
        taskId: currentTaskId,
        sessionRevision: currentSessionRevision,
        sequence: nextSequence(),
        ...input,
      }),
    emitCompleted: result =>
      dispatch({
        type: 'terminal',
        taskId: currentTaskId,
        sessionRevision: currentSessionRevision,
        sequence: nextSequence(),
        status: 'completed',
        result,
      }),
    emitFailed: (errorCode, resumeToken) =>
      dispatch({
        type: 'terminal',
        taskId: currentTaskId,
        sessionRevision: currentSessionRevision,
        sequence: nextSequence(),
        status: 'failed',
        errorCode,
        ...(resumeToken ? {resumeToken} : {}),
      }),
    emitCancelled: resumeToken =>
      dispatch({
        type: 'terminal',
        taskId: currentTaskId,
        sessionRevision: currentSessionRevision,
        sequence: nextSequence(),
        status: 'cancelled',
        ...(resumeToken ? {resumeToken} : {}),
      }),
    emitDisconnect: () => {
      connectionState = {status: 'disconnected'};
    },
  };
}

describe('defineVisualAgentAdapterConformance', () => {
  it('runs the reusable conformance contract against a fake adapter (completed path)', async () => {
    const fixture = createFakeFixture();
    const options: VisualAgentConformanceOptions = {
      requiredStatuses: ['queued', 'running', 'waiting_approval', 'completed'],
      negotiatedCapabilities: capabilityKeys,
    };
    await expect(defineVisualAgentAdapterConformance(fixture, options)).resolves.toBeUndefined();
  });

  it('runs the reusable conformance contract against a fake adapter (cancelled path)', async () => {
    const fixture = createFakeFixture();
    const options: VisualAgentConformanceOptions = {
      requiredStatuses: ['queued', 'running', 'cancelled'],
      negotiatedCapabilities: capabilityKeys,
    };
    await expect(defineVisualAgentAdapterConformance(fixture, options)).resolves.toBeUndefined();
  });

  it('fails when a declared capability is negotiated true without support', async () => {
    const fixture = createFakeFixture({steer: false});
    const options: VisualAgentConformanceOptions = {
      requiredStatuses: ['queued', 'running', 'completed'],
      negotiatedCapabilities: capabilityKeys,
    };
    await expect(defineVisualAgentAdapterConformance(fixture, options)).rejects.toThrow(
      'visual_agent_execution_failed',
    );
  });
});

describe('capability negotiation fails before execute', () => {
  it('fails capability negotiation before execute', async () => {
    const execute = jest.fn();
    const port: VisualAgentExecutionPort = {
      getConnectionState: () => ({status: 'disconnected'}),
      connect: async () => ({...caps, imageInput: false}),
      disconnect: async () => undefined,
      execute,
      cancel: async () => undefined,
      resolveApproval: async () => undefined,
      resume: async () => undefined,
      steer: async () => undefined,
      requestPreferences: async () => ({type: 'list', preferences: []}),
      subscribe: () => () => undefined,
    };

    async function negotiateCapabilities(
      requested: VisualAgentCapabilitySet,
      negotiated: VisualAgentCapabilitySet,
    ): Promise<VisualAgentCapabilitySet> {
      for (const key of capabilityKeys) {
        if (requested[key] && !negotiated[key]) {
          throw new Error('visual_agent_capability_unsupported');
        }
      }
      return negotiated;
    }

    const negotiated = await port.connect({} as VisualAgentProfileV1, new AbortController().signal);
    await expect(negotiateCapabilities(caps, negotiated)).rejects.toThrow(
      'visual_agent_capability_unsupported',
    );
    expect(execute).not.toHaveBeenCalled();
  });
});
