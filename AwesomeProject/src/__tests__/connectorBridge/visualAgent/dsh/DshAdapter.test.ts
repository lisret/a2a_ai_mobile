import type {
  VisualAgentCapabilitySet,
  VisualAgentProfileV1,
  VisualAgentTaskEnvelopeV1,
  VisualAgentTaskEvent,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import type {
  VisualAgentBindingPort,
  VisualAgentUpstreamPort,
  VisualAgentUpstreamSession,
} from '../../../../connectorBridge/visualAgent/ports/VisualAgentUpstreamPort';
import {defineVisualAgentAdapterConformance} from '../../../../connectorBridge/visualAgent/conformance/VisualAgentAdapterConformance';
import {DshAdapter} from '../../../../connectorBridge/visualAgent/adapters/dsh/DshAdapter';
import type {DshBindingV1} from '../../../../connectorBridge/visualAgent/adapters/dsh/DshBinding';
import {
  dshConformanceFixture,
  dshRequiredConformance,
} from '../../../../connectorBridge/visualAgent/adapters/dsh/conformanceFixture';

const ALL_FALSE: VisualAgentCapabilitySet = {
  imageInput: false,
  structuredAction: false,
  stream: false,
  cancel: false,
  approval: false,
  resume: false,
  steer: false,
  preferences: false,
};

const caps = (
  overrides: Partial<VisualAgentCapabilitySet>,
): VisualAgentCapabilitySet => ({...ALL_FALSE, ...overrides});

function makeSession(
  negotiated: VisualAgentCapabilitySet,
): VisualAgentUpstreamSession {
  return {
    negotiate: async () => negotiated,
    send: async () => undefined,
    subscribe: () => () => undefined,
    close: async () => undefined,
  };
}

function makeUpstream(session: VisualAgentUpstreamSession): VisualAgentUpstreamPort {
  return {open: jest.fn(async () => session)};
}

function makeCapturingSession(negotiated: VisualAgentCapabilitySet): {
  session: VisualAgentUpstreamSession;
  emit: (message: unknown) => void;
} {
  const captured: Array<(message: unknown) => void> = [];
  const session: VisualAgentUpstreamSession = {
    negotiate: async () => negotiated,
    send: async () => undefined,
    subscribe: listener => {
      captured.push(listener);
      return () => undefined;
    },
    close: async () => undefined,
  };
  return {
    session,
    emit: message => captured.forEach(listener => listener(message)),
  };
}

function makeBindings(binding: unknown): VisualAgentBindingPort {
  return {read: jest.fn(async () => binding)};
}

const enabledBinding: DshBindingV1 = {
  schemaVersion: 1,
  toolId: 'dsh',
  product: 'deepseek-harness',
  protocol: 'custom_bridge',
  version: '1.0.0',
  endpointOrExecutable: 'bridge://dsh',
  cwd: null,
  args: [],
  secretRef: null,
  enabled: true,
  declaredCapabilities: caps({structuredAction: true, stream: true, cancel: true}),
};

const profileRequiringStream: VisualAgentProfileV1 = {
  schemaVersion: 1,
  profileId: 'p-dsh',
  toolId: 'dsh',
  enabled: true,
  connector: {
    kind: 'connector_bridge',
    bridgeUrl: 'https://bridge.example',
    bindingId: 'b-dsh',
    secretRef: null,
  },
  requestedCapabilities: caps({stream: true}),
};

const streamEnvelope: VisualAgentTaskEnvelopeV1 = {
  protocolVersion: 1,
  taskId: 't1',
  sessionRevision: 1,
  profileId: 'p-dsh',
  instruction: 'do the thing',
  idempotencyKey: 'k1',
  requiredCapabilities: caps({stream: true}),
};

const signal = new AbortController().signal;

describe('DshAdapter', () => {
  it('binds dsh only to an explicit DeepSeek Harness binding and remains disabled by default', () => {
    const adapter = new DshAdapter(
      makeBindings(enabledBinding),
      makeUpstream(makeSession(caps({}))),
    );
    expect(() =>
      adapter.validateBinding({product: 'dify', protocol: 'custom_bridge'}),
    ).toThrow('visual_agent_invalid_profile');
    expect(
      adapter.validateBinding({
        product: 'deepseek-harness',
        protocol: 'dsh_cli',
        enabled: false,
      }),
    ).toEqual(expect.objectContaining({enabled: false}));
  });

  it('does not infer unsupported capabilities from unstructured CLI text', async () => {
    const noCapabilities = caps({});
    const adapter = new DshAdapter(
      makeBindings(enabledBinding),
      makeUpstream(makeSession(noCapabilities)),
    );
    const execution = adapter.create(profileRequiringStream);
    await expect(
      execution.connect(profileRequiringStream, new AbortController().signal),
    ).rejects.toThrow('visual_agent_capability_unsupported');
  });

  it('treats declaredCapabilities as a hard ceiling above negotiation', async () => {
    // Upstream negotiates `cancel`, but the binding does not declare it.
    const cappedBinding: DshBindingV1 = {
      ...enabledBinding,
      declaredCapabilities: caps({stream: true}),
    };
    const profileRequiringCancel: VisualAgentProfileV1 = {
      ...profileRequiringStream,
      requestedCapabilities: caps({stream: true, cancel: true}),
    };
    const adapter = new DshAdapter(
      makeBindings(cappedBinding),
      makeUpstream(makeSession(caps({stream: true, cancel: true}))),
    );
    const execution = adapter.create(profileRequiringCancel);
    await expect(
      execution.connect(profileRequiringCancel, signal),
    ).rejects.toThrow('visual_agent_capability_unsupported');
  });

  it('does not throw out of the subscribe listener on a malformed upstream frame', async () => {
    const {session, emit} = makeCapturingSession(
      caps({structuredAction: true, stream: true, cancel: true}),
    );
    const adapter = new DshAdapter(makeBindings(enabledBinding), {
      open: jest.fn(async () => session),
    });
    const execution = adapter.create(profileRequiringStream);
    await execution.connect(profileRequiringStream, signal);
    const events: VisualAgentTaskEvent[] = [];
    execution.subscribe(event => events.push(event));
    await execution.execute(streamEnvelope, signal);

    expect(() => emit('this is not a valid frame')).not.toThrow();

    expect(execution.getConnectionState()).toEqual({
      status: 'failed',
      errorCode: 'visual_agent_protocol_error',
    });
    const terminals = events.filter(event => event.type === 'terminal');
    expect(terminals).toHaveLength(1);
    expect(terminals[0]).toMatchObject({
      status: 'failed',
      errorCode: 'visual_agent_protocol_error',
      taskId: 't1',
      sessionRevision: 1,
    });
  });

  it('passes the shared visual agent adapter conformance suite', async () => {
    await defineVisualAgentAdapterConformance(
      dshConformanceFixture,
      dshRequiredConformance,
    );
  });
});
