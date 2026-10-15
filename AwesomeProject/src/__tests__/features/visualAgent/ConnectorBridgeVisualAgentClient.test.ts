// Task 12 mobile Connector Bridge proxy. The client is the only mobile
// `VisualAgentExecutionPort`; it must open exactly the configured Connector
// Bridge (never a product upstream), negotiate before execute, correlate all
// task messages, enforce a cancel timeout, and reject pending work on disconnect.
import {ConnectorBridgeVisualAgentClient} from '@features/visualAgent/data/ConnectorBridgeVisualAgentClient';
import type {
  ConnectorBridgeSession,
  ConnectorBridgeTransport,
} from '@features/visualAgent/data/ConnectorBridgeTransport';
import {encodeVisualAgentMessage} from '../../../connectorBridge/visualAgent/protocol/VisualAgentProtocolCodec';
import type {
  VisualAgentCapabilitySet,
  VisualAgentProfileV1,
  VisualAgentProtocolV1,
  VisualAgentTaskEnvelopeV1,
  VisualAgentTaskEvent,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

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

const profile: VisualAgentProfileV1 = {
  schemaVersion: 1,
  profileId: 'codex-main',
  toolId: 'codex',
  enabled: true,
  connector: {
    kind: 'connector_bridge',
    bridgeUrl: 'https://bridge.example',
    bindingId: 'b-1',
    secretRef: 'visual-agent:bridge',
  },
  requestedCapabilities: allCapabilities,
};

const envelope: VisualAgentTaskEnvelopeV1 = {
  protocolVersion: 1,
  taskId: 't-1',
  sessionRevision: 1,
  profileId: 'codex-main',
  instruction: 'do the thing',
  idempotencyKey: 'k-1',
  requiredCapabilities: allCapabilities,
};

interface TimerHandle {
  handler: () => void;
  cancelled: boolean;
}

function makeTimer(): {
  schedule: jest.Mock;
  fireAll: () => void;
} {
  const scheduled: TimerHandle[] = [];
  return {
    schedule: jest.fn((handler: () => void) => {
      const entry: TimerHandle = {handler, cancelled: false};
      scheduled.push(entry);
      return () => {
        entry.cancelled = true;
      };
    }),
    fireAll: () => {
      for (const entry of scheduled) {
        if (!entry.cancelled) {
          entry.handler();
        }
      }
    },
  };
}

function makeIds(): {next: () => string} {
  let n = 0;
  return {
    next: () => {
      n += 1;
      return `req-${n}`;
    },
  };
}

function makeBridge(
  negotiated: VisualAgentCapabilitySet,
  options: {autoPreference?: boolean} = {},
): {
  transport: {open: jest.Mock};
  sent: VisualAgentProtocolV1[];
  emit: (raw: string) => void;
  close: jest.Mock;
} {
  const autoPreference = options.autoPreference ?? true;
  let listener: ((raw: string) => void) | undefined;
  const sent: VisualAgentProtocolV1[] = [];
  const close = jest.fn(async () => undefined);
  const session: ConnectorBridgeSession = {
    send: jest.fn(async (message: VisualAgentProtocolV1) => {
      sent.push(message);
      if (message.type === 'session.open') {
        queueMicrotask(() => {
          listener?.(
            encodeVisualAgentMessage({
              version: 1,
              type: 'session.ready',
              requestId: message.requestId,
              negotiatedCapabilities: negotiated,
            }),
          );
        });
      }
      if (message.type === 'preference.request' && autoPreference) {
        queueMicrotask(() => {
          listener?.(
            encodeVisualAgentMessage({
              version: 1,
              type: 'preference.result',
              requestId: message.requestId,
              result: {type: 'list', preferences: []},
            }),
          );
        });
      }
    }),
    subscribe: (l: (raw: string) => void) => {
      listener = l;
      return () => {
        listener = undefined;
      };
    },
    close,
  };
  const transport: ConnectorBridgeTransport = {
    open: jest.fn(async () => session),
  };
  return {
    transport: transport as unknown as {open: jest.Mock},
    sent,
    emit: raw => listener?.(raw),
    close,
  };
}

const emitTaskEvent = (
  bridge: {emit: (raw: string) => void},
  message: VisualAgentProtocolV1,
): void => bridge.emit(encodeVisualAgentMessage(message));

describe('ConnectorBridgeVisualAgentClient', () => {
  it('opens only the configured Connector Bridge and never a product upstream', async () => {
    const bridge = makeBridge(allCapabilities);
    const signal = new AbortController().signal;
    const client = new ConnectorBridgeVisualAgentClient(
      bridge.transport as unknown as ConnectorBridgeTransport,
      makeTimer(),
      makeIds(),
    );

    await client.connect(profile, signal);

    expect(bridge.transport.open).toHaveBeenCalledWith({
      bridgeUrl: 'https://bridge.example',
      secretRef: 'visual-agent:bridge',
      signal,
    });
    expect(JSON.stringify(bridge.transport.open.mock.calls)).not.toMatch(
      /gateway\.example|codex|cursor-agent|dsh|hermes/i,
    );
    expect(client.getConnectionState()).toEqual({
      status: 'ready',
      negotiatedCapabilities: allCapabilities,
    });
  });

  it('negotiates before execute and correlates delivered task events', async () => {
    const bridge = makeBridge(allCapabilities);
    const signal = new AbortController().signal;
    const client = new ConnectorBridgeVisualAgentClient(
      bridge.transport as unknown as ConnectorBridgeTransport,
      makeTimer(),
      makeIds(),
    );
    const events: VisualAgentTaskEvent[] = [];
    client.subscribe(event => events.push(event));

    await client.connect(profile, signal);
    const {taskId} = await client.execute(envelope, signal);
    expect(taskId).toBe('t-1');
    expect(bridge.sent.some(m => m.type === 'task.start')).toBe(true);

    emitTaskEvent(bridge, {
      version: 1,
      type: 'task.status',
      requestId: 's-1',
      event: {type: 'status', taskId: 't-1', sessionRevision: 1, sequence: 0, status: 'queued'},
    });
    emitTaskEvent(bridge, {
      version: 1,
      type: 'task.completed',
      requestId: 's-2',
      event: {
        type: 'terminal',
        taskId: 't-1',
        sessionRevision: 1,
        sequence: 1,
        status: 'completed',
        result: {summary: 'done'},
      },
    });

    expect(events.map(e => e.type)).toEqual(['status', 'terminal']);
    expect(events.every(e => e.taskId === 't-1' && e.sessionRevision === 1)).toBe(true);
  });

  it('rejects cancel with not_ready before connect rather than throwing synchronously', async () => {
    const bridge = makeBridge(allCapabilities);
    const signal = new AbortController().signal;
    const client = new ConnectorBridgeVisualAgentClient(
      bridge.transport as unknown as ConnectorBridgeTransport,
      makeTimer(),
      makeIds(),
    );

    const pending = client.cancel({taskId: 't-1', sessionRevision: 1}, signal);
    expect(pending).toBeInstanceOf(Promise);
    await expect(pending).rejects.toThrow('visual_agent_not_ready');
  });

  it('rejects a pending cancel with a cancel timeout when the bridge is silent', async () => {
    const bridge = makeBridge(allCapabilities);
    const timer = makeTimer();
    const signal = new AbortController().signal;
    const client = new ConnectorBridgeVisualAgentClient(
      bridge.transport as unknown as ConnectorBridgeTransport,
      timer,
      makeIds(),
    );

    await client.connect(profile, signal);
    await client.execute(envelope, signal);
    const cancelPromise = client.cancel({taskId: 't-1', sessionRevision: 1}, signal);
    const assertion = expect(cancelPromise).rejects.toThrow('visual_agent_cancel_timeout');
    timer.fireAll();
    await assertion;
  });

  it('rejects pending preference requests on disconnect', async () => {
    const bridge = makeBridge(allCapabilities, {autoPreference: false});
    const signal = new AbortController().signal;
    const client = new ConnectorBridgeVisualAgentClient(
      bridge.transport as unknown as ConnectorBridgeTransport,
      makeTimer(),
      makeIds(),
    );

    await client.connect(profile, signal);
    await client.execute(envelope, signal);
    const pending = client.requestPreferences({type: 'list'}, signal);
    const assertion = expect(pending).rejects.toThrow('visual_agent_disconnected');
    await client.disconnect();
    await assertion;
    expect(bridge.close).toHaveBeenCalled();
  });

  it('fails closed when a capability was not negotiated and sends nothing upstream', async () => {
    const bridge = makeBridge({...allCapabilities, steer: false});
    const signal = new AbortController().signal;
    const client = new ConnectorBridgeVisualAgentClient(
      bridge.transport as unknown as ConnectorBridgeTransport,
      makeTimer(),
      makeIds(),
    );

    await client.connect(profile, signal);
    await client.execute(envelope, signal);
    const sentBefore = bridge.sent.length;
    await expect(
      client.steer({taskId: 't-1', sessionRevision: 1, instruction: 'nudge'}, signal),
    ).rejects.toThrow('visual_agent_capability_unsupported');
    expect(bridge.sent.length).toBe(sentBefore);
  });
});
