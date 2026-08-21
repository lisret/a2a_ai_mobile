// Wave 2B Worker B: Codex adapter unit + conformance suite. Exercises the two
// frozen Codex upstream modes, App Server approval mapping (never auto-approved),
// and the shared adapter conformance contract against the Codex fixture.
import type {
  VisualAgentCapabilitySet,
  VisualAgentProfileV1,
  VisualAgentTaskEnvelopeV1,
  VisualAgentTaskEvent,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import {defineVisualAgentAdapterConformance} from '../../../../connectorBridge/visualAgent/conformance/VisualAgentAdapterConformance';
import {CodexAdapter} from '../../../../connectorBridge/visualAgent/adapters/codex/CodexAdapter';
import type {CodexBindingV1} from '../../../../connectorBridge/visualAgent/adapters/codex/CodexBinding';
import {createCodexConformanceFixture} from '../../../../connectorBridge/visualAgent/adapters/codex/conformanceFixture';

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

function createCodex(
  protocol: CodexBindingV1['protocol'],
  requested: VisualAgentCapabilitySet = cap({
    imageInput: true,
    structuredAction: true,
    stream: true,
  }),
) {
  const binding: CodexBindingV1 = {
    schemaVersion: 1,
    toolId: 'codex',
    protocol,
    executable: 'codex',
    cwd: '/tmp/codex',
    args: [],
    secretRef: null,
  };
  const session = createMockSession();
  const upstream = {open: jest.fn(async () => session)};
  const bindings = {read: jest.fn(async () => binding)};
  const profile: VisualAgentProfileV1 = {
    schemaVersion: 1,
    profileId: 'p-codex',
    toolId: 'codex',
    enabled: true,
    connector: {
      kind: 'connector_bridge',
      bridgeUrl: 'https://bridge.example',
      bindingId: 'b-codex',
      secretRef: null,
    },
    requestedCapabilities: requested,
  };
  const adapter = new CodexAdapter(bindings, upstream);
  const port = adapter.create(profile);
  return {adapter, port, profile, upstream, bindings, session, signal: new AbortController().signal};
}

const envelope: VisualAgentTaskEnvelopeV1 = {
  protocolVersion: 1,
  taskId: 't-codex',
  sessionRevision: 1,
  profileId: 'p-codex',
  instruction: 'inspect the screen',
  idempotencyKey: 'k-codex',
  requiredCapabilities: cap({imageInput: true, structuredAction: true, stream: true}),
};

describe('CodexAdapter', () => {
  it.each(['cli_exec_jsonl', 'app_server_json_rpc_stdio'] as const)(
    'uses exactly one configured Codex mode: %s',
    async protocol => {
      const h = createCodex(protocol);
      await h.port.connect(h.profile, h.signal);
      await h.port.execute(envelope, h.signal);
      expect(h.upstream.open).toHaveBeenCalledWith(expect.objectContaining({protocol}));
      expect(h.upstream.open).toHaveBeenCalledTimes(1);
    },
  );

  it('maps App Server approval requests without auto-approving', async () => {
    const h = createCodex(
      'app_server_json_rpc_stdio',
      cap({imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true}),
    );
    await h.port.connect(h.profile, h.signal);
    const events: VisualAgentTaskEvent[] = [];
    h.port.subscribe(event => events.push(event));
    await h.port.execute(envelope, h.signal);

    h.session.emit({method: 'approval/request', params: {id: 'a1'}});

    expect(events.at(-1)).toEqual(
      expect.objectContaining({status: 'waiting_approval', approvalId: 'a1'}),
    );
    expect(h.session.send).not.toHaveBeenCalledWith(
      expect.objectContaining({decision: 'approve'}),
    );
  });

  it('rejects a requested capability the configured mode cannot provide', async () => {
    const h = createCodex('cli_exec_jsonl', cap({stream: true, approval: true}));
    await expect(h.port.connect(h.profile, h.signal)).rejects.toThrow(
      'visual_agent_capability_unsupported',
    );
    expect(h.upstream.open).not.toHaveBeenCalled();
  });

  it('passes the shared Visual Agent adapter conformance contract', async () => {
    await defineVisualAgentAdapterConformance(createCodexConformanceFixture(), {
      requiredStatuses: ['queued', 'running', 'waiting_approval', 'completed'],
      negotiatedCapabilities: ['imageInput', 'structuredAction', 'stream', 'cancel', 'approval'],
    });
  });
});
