import {defineVisualAgentAdapterConformance} from '../../../../connectorBridge/visualAgent/conformance/VisualAgentAdapterConformance';
import {OpenClawAdapter} from '../../../../connectorBridge/visualAgent/adapters/openclaw/OpenClawAdapter';
import {createOpenClawConformanceFixture} from '../../../../connectorBridge/visualAgent/adapters/openclaw/conformanceFixture';
import type {
  VisualAgentBindingPort,
  VisualAgentUpstreamPort,
  VisualAgentUpstreamSession,
} from '../../../../connectorBridge/visualAgent/ports/VisualAgentUpstreamPort';
import type {
  VisualAgentCapabilitySet,
  VisualAgentProfileV1,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import type {TimerPort} from '@core/engine/capabilities/shared/CapabilityPorts';

const allCapabilities: VisualAgentCapabilitySet = {
  imageInput: true,
  structuredAction: true,
  stream: true,
  cancel: true,
  approval: true,
  resume: true,
  steer: true,
  preferences: true,
};

const rawBinding = {
  schemaVersion: 1,
  toolId: 'openclaw',
  protocol: 'gateway_ws',
  gatewayUrl: 'wss://gateway.example.com/ws',
  deviceId: 'device-1',
  cluster: 'us-1',
  secretRef: 'secret-ref-1',
};

function makeProfile(requestedCapabilities: VisualAgentCapabilitySet): VisualAgentProfileV1 {
  return {
    schemaVersion: 1,
    profileId: 'profile-1',
    toolId: 'openclaw',
    enabled: true,
    connector: {
      kind: 'connector_bridge',
      bridgeUrl: 'https://bridge.example.com',
      bindingId: 'binding-1',
      secretRef: null,
    },
    requestedCapabilities,
  };
}

function makeSession(overrides: Partial<jest.Mocked<VisualAgentUpstreamSession>> = {}): jest.Mocked<VisualAgentUpstreamSession> {
  return {
    negotiate: jest.fn().mockResolvedValue(allCapabilities),
    send: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(() => {}),
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<VisualAgentUpstreamSession>;
}

function makeUpstream(session: jest.Mocked<VisualAgentUpstreamSession>): jest.Mocked<VisualAgentUpstreamPort> {
  return {
    open: jest.fn().mockResolvedValue(session),
  } as jest.Mocked<VisualAgentUpstreamPort>;
}

function makeBindings(): jest.Mocked<VisualAgentBindingPort> {
  return {
    read: jest.fn().mockResolvedValue(rawBinding),
  } as jest.Mocked<VisualAgentBindingPort>;
}

function makeTimer(): TimerPort {
  return {
    schedule: jest.fn().mockReturnValue(() => {}),
  };
}

describe('OpenClawAdapter', () => {
  it('maps one normalized task to one Gateway task and correlates cancellation', async () => {
    const session = makeSession();
    const upstream = makeUpstream(session);
    const bindings = makeBindings();
    const adapter = new OpenClawAdapter(bindings, upstream, makeTimer());
    const profile = makeProfile(allCapabilities);
    const execution = adapter.create(profile);
    const controller = new AbortController();

    await execution.connect(profile, controller.signal);
    await execution.execute(
      {
        protocolVersion: 1,
        taskId: 't1',
        sessionRevision: 3,
        profileId: profile.profileId,
        instruction: 'do the thing',
        idempotencyKey: 'key-1',
        requiredCapabilities: allCapabilities,
      },
      controller.signal,
    );
    expect(session.send).toHaveBeenCalledWith(
      expect.objectContaining({type: 'task.start', taskId: 't1', sessionRevision: 3}),
    );

    await execution.cancel({taskId: 't1', sessionRevision: 3}, controller.signal);
    expect(session.send).toHaveBeenCalledWith(
      expect.objectContaining({type: 'task.cancel', taskId: 't1', sessionRevision: 3}),
    );
  });

  it('never connects when Gateway capabilities omit requested image input', async () => {
    const session = makeSession({
      negotiate: jest.fn().mockResolvedValue({...allCapabilities, imageInput: false}),
    });
    const upstream = makeUpstream(session);
    const bindings = makeBindings();
    const adapter = new OpenClawAdapter(bindings, upstream, makeTimer());
    const profile = makeProfile(allCapabilities);
    const execution = adapter.create(profile);
    const controller = new AbortController();

    await expect(execution.connect(profile, controller.signal)).rejects.toThrow(
      'visual_agent_capability_unsupported',
    );
    expect(execution.getConnectionState().status).not.toBe('ready');
  });

  it('rejects a binding whose gatewayUrl is not wss', async () => {
    const session = makeSession();
    const upstream = makeUpstream(session);
    const bindings = makeBindings();
    (bindings.read as jest.Mock).mockResolvedValue({...rawBinding, gatewayUrl: 'ws://insecure.example.com'});
    const adapter = new OpenClawAdapter(bindings, upstream, makeTimer());
    const profile = makeProfile(allCapabilities);
    const execution = adapter.create(profile);
    const controller = new AbortController();

    await expect(execution.connect(profile, controller.signal)).rejects.toThrow(
      'visual_agent_invalid_profile',
    );
    expect(upstream.open).not.toHaveBeenCalled();
  });

  it('maps a Gateway auth failure to the generic auth error code without leaking details', async () => {
    const session = makeSession();
    const upstream = makeUpstream(session);
    (upstream.open as jest.Mock).mockRejectedValue(new Error('secret token abc123 rejected by wss://gateway.internal'));
    const bindings = makeBindings();
    const adapter = new OpenClawAdapter(bindings, upstream, makeTimer());
    const profile = makeProfile(allCapabilities);
    const execution = adapter.create(profile);
    const controller = new AbortController();

    await expect(execution.connect(profile, controller.signal)).rejects.toThrow(
      'visual_agent_auth_failed',
    );
  });

  it('fails steer before sending when Gateway negotiation omits steer', async () => {
    const session = makeSession({
      negotiate: jest.fn().mockResolvedValue({...allCapabilities, steer: false}),
    });
    const upstream = makeUpstream(session);
    const bindings = makeBindings();
    const adapter = new OpenClawAdapter(bindings, upstream, makeTimer());
    const profile = makeProfile({...allCapabilities, steer: false});
    const execution = adapter.create(profile);
    const controller = new AbortController();

    await execution.connect(profile, controller.signal);
    session.send.mockClear();
    await expect(
      execution.steer({taskId: 't1', sessionRevision: 1, instruction: 'go left'}, controller.signal),
    ).rejects.toThrow('visual_agent_capability_unsupported');
    expect(session.send).not.toHaveBeenCalled();
  });

  it('fails preferences before sending when Gateway negotiation omits preferences', async () => {
    const session = makeSession({
      negotiate: jest.fn().mockResolvedValue({...allCapabilities, preferences: false}),
    });
    const upstream = makeUpstream(session);
    const bindings = makeBindings();
    const adapter = new OpenClawAdapter(bindings, upstream, makeTimer());
    const profile = makeProfile({...allCapabilities, preferences: false});
    const execution = adapter.create(profile);
    const controller = new AbortController();

    await execution.connect(profile, controller.signal);
    session.send.mockClear();
    await expect(execution.requestPreferences({type: 'list'}, controller.signal)).rejects.toThrow(
      'visual_agent_capability_unsupported',
    );
    expect(session.send).not.toHaveBeenCalled();
  });

  it('resolves requestPreferences with the correlated preference.result payload', async () => {
    const session = makeSession();
    const upstream = makeUpstream(session);
    const bindings = makeBindings();
    const adapter = new OpenClawAdapter(bindings, upstream, makeTimer());
    const profile = makeProfile(allCapabilities);
    const execution = adapter.create(profile);
    const controller = new AbortController();

    await execution.connect(profile, controller.signal);
    const subscribeListener = session.subscribe.mock.calls[0][0] as (message: unknown) => void;

    const resultPromise = execution.requestPreferences({type: 'list'}, controller.signal);
    const sentMessage = session.send.mock.calls[session.send.mock.calls.length - 1][0] as {
      type: string;
      requestId: string;
    };
    expect(sentMessage.type).toBe('preference.request');
    subscribeListener({
      type: 'preference.result',
      requestId: sentMessage.requestId,
      result: {type: 'list', preferences: []},
    });

    await expect(resultPromise).resolves.toEqual({type: 'list', preferences: []});
  });

  it('acknowledges Gateway heartbeats', async () => {
    const session = makeSession();
    const upstream = makeUpstream(session);
    const bindings = makeBindings();
    const adapter = new OpenClawAdapter(bindings, upstream, makeTimer());
    const profile = makeProfile(allCapabilities);
    const execution = adapter.create(profile);
    const controller = new AbortController();

    await execution.connect(profile, controller.signal);
    const subscribeListener = session.subscribe.mock.calls[0][0] as (message: unknown) => void;
    session.send.mockClear();
    subscribeListener({type: 'gateway.heartbeat'});

    expect(session.send).toHaveBeenCalledWith(expect.objectContaining({type: 'gateway.heartbeat.ack'}));
  });

  it('rejects a pending preferences request when the Gateway disconnects', async () => {
    const session = makeSession();
    const upstream = makeUpstream(session);
    const bindings = makeBindings();
    const adapter = new OpenClawAdapter(bindings, upstream, makeTimer());
    const profile = makeProfile(allCapabilities);
    const execution = adapter.create(profile);
    const controller = new AbortController();

    await execution.connect(profile, controller.signal);
    const subscribeListener = session.subscribe.mock.calls[0][0] as (message: unknown) => void;

    const resultPromise = execution.requestPreferences({type: 'list'}, controller.signal);
    subscribeListener({type: 'gateway.disconnected'});

    await expect(resultPromise).rejects.toThrow('visual_agent_disconnected');
    expect(execution.getConnectionState().status).toBe('disconnected');
  });

  const fixture = createOpenClawConformanceFixture();
  it('satisfies the shared Visual Agent adapter conformance suite', async () => {
    await defineVisualAgentAdapterConformance(fixture, {
      requiredStatuses: ['queued', 'running', 'waiting_approval'],
      negotiatedCapabilities: [
        'imageInput',
        'structuredAction',
        'stream',
        'cancel',
        'approval',
        'resume',
        'steer',
        'preferences',
      ],
    });
    expect(fixture.fallbackSpy.callCount()).toBe(0);
  });
});
