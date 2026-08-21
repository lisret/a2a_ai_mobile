// Wave 2B Worker B: Cursor adapter unit + conformance suite. Exercises the three
// frozen Cursor upstream modes, the CLI cancel-claim guard, and the shared
// adapter conformance contract against the Cursor fixture.
import type {
  VisualAgentCapabilitySet,
  VisualAgentProfileV1,
  VisualAgentTaskEnvelopeV1,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import {defineVisualAgentAdapterConformance} from '../../../../connectorBridge/visualAgent/conformance/VisualAgentAdapterConformance';
import {CursorAdapter} from '../../../../connectorBridge/visualAgent/adapters/cursor/CursorAdapter';
import type {CursorBindingV1} from '../../../../connectorBridge/visualAgent/adapters/cursor/CursorBinding';
import {createCursorConformanceFixture} from '../../../../connectorBridge/visualAgent/adapters/cursor/conformanceFixture';

const cap = (
  partial: Partial<VisualAgentCapabilitySet> = {},
): VisualAgentCapabilitySet => ({
  imageInput: false,
  structuredAction: false,
  stream: false,
  cancel: false,
  approval: false,
  resume: false,
  steer: false,
  preferences: false,
  ...partial,
});

function createMockSession() {
  const listeners = new Set<(message: unknown) => void>();
  return {
    negotiate: jest.fn(async (requested: VisualAgentCapabilitySet) => requested),
    send: jest.fn(async () => undefined),
    subscribe: (listener: (message: unknown) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: jest.fn(async () => undefined),
    emit: (message: unknown) => listeners.forEach(listener => listener(message)),
  };
}

function createCursor(
  protocol: CursorBindingV1['protocol'],
  requested: VisualAgentCapabilitySet = cap({
    imageInput: true,
    structuredAction: true,
    stream: true,
  }),
) {
  const binding: CursorBindingV1 = {
    schemaVersion: 1,
    toolId: 'cursor',
    protocol,
    endpointOrExecutable:
      protocol === 'cloud_agents_http' ? 'https://cursor.example/agents' : 'cursor-agent',
    cwd: protocol === 'cloud_agents_http' ? null : '/tmp/cursor',
    args: [],
    secretRef: null,
  };
  const session = createMockSession();
  const upstream = {open: jest.fn(async () => session)};
  const bindings = {read: jest.fn(async () => binding)};
  const profile: VisualAgentProfileV1 = {
    schemaVersion: 1,
    profileId: 'p-cursor',
    toolId: 'cursor',
    enabled: true,
    connector: {
      kind: 'connector_bridge',
      bridgeUrl: 'https://bridge.example',
      bindingId: 'b-cursor',
      secretRef: null,
    },
    requestedCapabilities: requested,
  };
  const adapter = new CursorAdapter(bindings, upstream);
  const port = adapter.create(profile);
  return {adapter, port, profile, upstream, bindings, session, signal: new AbortController().signal};
}

const envelope: VisualAgentTaskEnvelopeV1 = {
  protocolVersion: 1,
  taskId: 't-cursor',
  sessionRevision: 1,
  profileId: 'p-cursor',
  instruction: 'inspect the screen',
  idempotencyKey: 'k-cursor',
  requiredCapabilities: cap({imageInput: true, structuredAction: true, stream: true}),
};

describe('CursorAdapter', () => {
  it.each(['agent_cli_ndjson', 'acp_json_rpc_stdio', 'cloud_agents_http'] as const)(
    'maps the configured Cursor mode: %s',
    async protocol => {
      const h = createCursor(protocol);
      await h.port.connect(h.profile, h.signal);
      await h.port.execute(envelope, h.signal);
      expect(h.upstream.open).toHaveBeenCalledWith(expect.objectContaining({protocol}));
      expect(h.upstream.open).toHaveBeenCalledTimes(1);
    },
  );

  it('does not claim cancel for a CLI profile that cannot acknowledge it', async () => {
    const h = createCursor(
      'agent_cli_ndjson',
      cap({imageInput: true, structuredAction: true, stream: true, cancel: true}),
    );
    await expect(h.port.connect(h.profile, h.signal)).rejects.toThrow(
      'visual_agent_capability_unsupported',
    );
    expect(h.upstream.open).not.toHaveBeenCalled();
  });

  it('passes the shared Visual Agent adapter conformance contract', async () => {
    await defineVisualAgentAdapterConformance(createCursorConformanceFixture(), {
      requiredStatuses: ['queued', 'running', 'waiting_approval', 'completed'],
      negotiatedCapabilities: ['imageInput', 'structuredAction', 'stream', 'cancel', 'approval'],
    });
  });
});
