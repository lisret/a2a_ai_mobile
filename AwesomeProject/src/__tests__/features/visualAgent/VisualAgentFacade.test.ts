// Task 12 UI-narrow Visual Agent facade. It delegates to the frozen profile
// controller and execution port without a second execution contract or any
// fallback, and its view state exposes only generic tool/profile/capability
// data — never bridge URLs, secret refs, upstream protocol, raw frames, or
// stacks.
import {VisualAgentFacade} from '@features/visualAgent/application/VisualAgentFacade';
import type {VisualAgentProfileController} from '@features/visualAgent/application/VisualAgentProfileController';
import type {
  VisualAgentCapabilitySet,
  VisualAgentConnectionState,
  VisualAgentExecutionPort,
  VisualAgentProfileV1,
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

const activeProfileFull: VisualAgentProfileV1 = {
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

function makeController(): jest.Mocked<
  Pick<
    VisualAgentProfileController,
    'readActiveProjection' | 'list' | 'setEnabled' | 'setActive'
  >
> {
  return {
    readActiveProjection: jest.fn().mockResolvedValue({
      profileId: 'codex-main',
      toolId: 'codex',
      connectorRef: {kind: 'connector_bridge', bindingId: 'b-1'},
    }),
    list: jest.fn().mockResolvedValue([activeProfileFull]),
    setEnabled: jest.fn().mockResolvedValue(undefined),
    setActive: jest.fn().mockResolvedValue(undefined),
  };
}

function makeExecution(): {
  port: VisualAgentExecutionPort;
  connect: jest.Mock;
  execute: jest.Mock;
  steer: jest.Mock;
} {
  let connection: VisualAgentConnectionState = {status: 'disconnected'};
  const connect = jest.fn(async () => {
    connection = {status: 'ready', negotiatedCapabilities: allCapabilities};
    return allCapabilities;
  });
  const execute = jest.fn(async () => ({taskId: 't-1'}));
  const steer = jest.fn(async () => undefined);
  const port: VisualAgentExecutionPort = {
    getConnectionState: () => connection,
    connect,
    disconnect: jest.fn(async () => {
      connection = {status: 'disconnected'};
    }),
    execute,
    cancel: jest.fn(async () => undefined),
    resolveApproval: jest.fn(async () => undefined),
    resume: jest.fn(async () => undefined),
    steer,
    requestPreferences: jest.fn(async () => undefined),
    subscribe: jest.fn(() => () => undefined),
  };
  return {port, connect, execute, steer};
}

describe('VisualAgentFacade', () => {
  it('exposes generic state without upstream details or credentials', async () => {
    const controller = makeController();
    const {port} = makeExecution();
    const facade = new VisualAgentFacade(
      controller as unknown as VisualAgentProfileController,
      port,
    );

    const state = await facade.read();
    expect(state).toEqual(
      expect.objectContaining({
        activeToolId: 'codex',
        activeProfile: expect.objectContaining({profileId: 'codex-main', toolId: 'codex'}),
        canExecute: false,
      }),
    );
    expect(JSON.stringify(state)).not.toMatch(
      /secretRef|token|command|args|gatewayUrl|raw|stack/i,
    );
  });

  it('connects through the execution port with the active profile and reflects readiness', async () => {
    const controller = makeController();
    const execution = makeExecution();
    const facade = new VisualAgentFacade(
      controller as unknown as VisualAgentProfileController,
      execution.port,
    );

    const signal = new AbortController().signal;
    const state = await facade.connect(signal);

    expect(execution.connect).toHaveBeenCalledWith(activeProfileFull, signal);
    expect(state.connection).toBe('ready');
    expect(state.canExecute).toBe(true);
    expect(state.negotiatedCapabilities).toEqual(allCapabilities);
  });

  it('delegates mutations and task actions without a second execution path', async () => {
    const controller = makeController();
    const execution = makeExecution();
    const facade = new VisualAgentFacade(
      controller as unknown as VisualAgentProfileController,
      execution.port,
    );
    const signal = new AbortController().signal;

    await facade.setEnabled(false, 3);
    expect(controller.setEnabled).toHaveBeenCalledWith(false, 3);

    await facade.connect(signal);
    const result = await facade.execute(
      {
        protocolVersion: 1,
        taskId: 't-1',
        sessionRevision: 1,
        profileId: 'codex-main',
        instruction: 'go',
        idempotencyKey: 'k-1',
        requiredCapabilities: allCapabilities,
      },
      signal,
    );
    expect(result).toEqual({taskId: 't-1'});
    expect(execution.execute).toHaveBeenCalled();

    await facade.steer({taskId: 't-1', sessionRevision: 1, instruction: 'nudge'}, signal);
    expect(execution.steer).toHaveBeenCalled();
  });
});
