import type {
  VisualAgentCapabilitySet,
  VisualAgentProfileV1,
  VisualAgentTaskEnvelopeV1,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import type {
  VisualAgentBindingPort,
  VisualAgentUpstreamPort,
  VisualAgentUpstreamSession,
} from '../../../../connectorBridge/visualAgent/ports/VisualAgentUpstreamPort';
import {defineVisualAgentAdapterConformance} from '../../../../connectorBridge/visualAgent/conformance/VisualAgentAdapterConformance';
import {HermesAdapter} from '../../../../connectorBridge/visualAgent/adapters/hermes/HermesAdapter';
import type {HermesBindingV1} from '../../../../connectorBridge/visualAgent/adapters/hermes/HermesBinding';
import {
  hermesConformanceFixture,
  hermesRequiredConformance,
} from '../../../../connectorBridge/visualAgent/adapters/hermes/conformanceFixture';

const ALL_TRUE: VisualAgentCapabilitySet = {
  imageInput: true,
  structuredAction: true,
  stream: true,
  cancel: true,
  approval: true,
  resume: true,
  steer: true,
  preferences: true,
};

const HERMES_PROTOCOLS = [
  'acp_json_rpc_stdio',
  'gateway_json_rpc_stdio',
  'gateway_json_rpc_ws',
  'runs_http_sse',
] as const;

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

function makeBindings(binding: unknown): VisualAgentBindingPort {
  return {read: jest.fn(async () => binding)};
}

const hermesBinding = (
  protocol: HermesBindingV1['protocol'],
): HermesBindingV1 => ({
  schemaVersion: 1,
  toolId: 'hermes',
  protocol,
  endpointOrExecutable:
    protocol === 'runs_http_sse' || protocol === 'gateway_json_rpc_ws'
      ? 'wss://hermes.example/runs'
      : '/usr/local/bin/hermes',
  cwd: null,
  args: [],
  secretRef: null,
});

const hermesProfile: VisualAgentProfileV1 = {
  schemaVersion: 1,
  profileId: 'p-hermes',
  toolId: 'hermes',
  enabled: true,
  connector: {
    kind: 'connector_bridge',
    bridgeUrl: 'https://bridge.example',
    bindingId: 'b-hermes',
    secretRef: null,
  },
  requestedCapabilities: ALL_TRUE,
};

const envelope: VisualAgentTaskEnvelopeV1 = {
  protocolVersion: 1,
  taskId: 't1',
  sessionRevision: 1,
  profileId: 'p-hermes',
  instruction: 'do the thing',
  idempotencyKey: 'k1',
  requiredCapabilities: ALL_TRUE,
};

const signal = new AbortController().signal;

describe('HermesAdapter', () => {
  it.each(HERMES_PROTOCOLS)('maps one Hermes mode: %s', async protocol => {
    const session = makeSession(ALL_TRUE);
    const upstream: VisualAgentUpstreamPort = {open: jest.fn(async () => session)};
    const adapter = new HermesAdapter(makeBindings(hermesBinding(protocol)), upstream);
    const execution = adapter.create(hermesProfile);
    await execution.connect(hermesProfile, signal);
    await execution.execute(envelope, signal);
    expect(upstream.open).toHaveBeenCalledWith(expect.objectContaining({protocol}));
  });

  it('maps run approval, steer/cancel, resume, and inline images only when negotiated', async () => {
    const session = makeSession(ALL_TRUE);
    const upstream: VisualAgentUpstreamPort = {open: jest.fn(async () => session)};
    const adapter = new HermesAdapter(
      makeBindings(hermesBinding('runs_http_sse')),
      upstream,
    );
    const execution = adapter.create(hermesProfile);
    const negotiated = await execution.connect(hermesProfile, signal);
    expect(negotiated).toEqual(
      expect.objectContaining({imageInput: true, approval: true, resume: true}),
    );
  });

  it('rejects hermes mcp serve as an unsupported mode', () => {
    const adapter = new HermesAdapter(
      makeBindings(hermesBinding('runs_http_sse')),
      {open: jest.fn(async () => makeSession(ALL_TRUE))},
    );
    expect(() =>
      adapter.validateBinding({
        schemaVersion: 1,
        toolId: 'hermes',
        protocol: 'mcp',
        endpointOrExecutable: '/usr/local/bin/hermes',
      }),
    ).toThrow('visual_agent_invalid_profile');
  });

  it('refuses to connect when a requested capability is not negotiated', async () => {
    const session = makeSession({...ALL_TRUE, imageInput: false});
    const upstream: VisualAgentUpstreamPort = {open: jest.fn(async () => session)};
    const adapter = new HermesAdapter(
      makeBindings(hermesBinding('runs_http_sse')),
      upstream,
    );
    const execution = adapter.create(hermesProfile);
    await expect(execution.connect(hermesProfile, signal)).rejects.toThrow(
      'visual_agent_capability_unsupported',
    );
  });

  it('passes the shared visual agent adapter conformance suite', async () => {
    await defineVisualAgentAdapterConformance(
      hermesConformanceFixture,
      hermesRequiredConformance,
    );
  });
});
