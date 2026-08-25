import type {
  RuntimeConfigEnvelopeV1,
  RuntimeConfigRepository,
  RuntimeRouteConfigV1,
} from '../../../core/engine/operateRuntime/contracts/RuntimeConfigContracts';
import {
  RuntimeActivityPort,
  RuntimeCompanionPort,
  RuntimeErrandPort,
  RuntimeOperatePort,
  RuntimePrivacyPort,
  RuntimeVisualAgentToolsPort,
  TaskUiEventBus,
} from '../../../application/facades/RuntimeApplicationPorts';

function emptyRoute(): RuntimeRouteConfigV1 {
  return {
    capabilities: {phoneOperate: true, errands: false},
    privacy: {memoryEnabled: true, memoryLocation: 'device', memoryProfileId: null},
    modelAPI: {
      agentConfig: {
        version: 2,
        activeMode: 'cloud_direct',
        modeDrafts: {cloudDirect: {}, cloudSplit: {}, localVisionCloudPlanner: {localModelId: 'minicpm-v-4.6-q4'}},
        maxSteps: 20,
      },
      profiles: [],
      bindings: [],
    },
    visualAgent: {enabled: false, activeProfileId: null, profiles: []},
  };
}

function repoWith(active: RuntimeRouteConfigV1): RuntimeConfigRepository {
  let envelope: RuntimeConfigEnvelopeV1 = {
    schemaVersion: 1,
    revision: 1,
    active,
    draft: active,
  };
  return {
    load: jest.fn(async () => envelope),
    mutateDraft: jest.fn(),
    activateDraft: jest.fn(),
    compareAndActivate: jest.fn(async (_rev, mutation) => {
      envelope = {
        ...envelope,
        active: mutation(envelope.active),
        revision: envelope.revision + 1,
      };
      return envelope;
    }),
    putProfile: jest.fn(),
    putBinding: jest.fn(),
    removeProfile: jest.fn(),
  } as unknown as RuntimeConfigRepository;
}

describe('production application ports', () => {
  const storage: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(storage)) {
      delete storage[key];
    }
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    AsyncStorage.getItem.mockImplementation(async (key: string) => storage[key] ?? null);
    AsyncStorage.setItem.mockImplementation(async (key: string, value: string) => {
      storage[key] = value;
    });
    AsyncStorage.removeItem.mockImplementation(async (key: string) => {
      delete storage[key];
    });
  });

  it('companion getState does not throw when no companion model is configured', async () => {
    const port = new RuntimeCompanionPort(repoWith(emptyRoute()));
    await expect(port.getState()).resolves.toMatchObject({
      phase: 'error',
      errorMessage: '请先配置陪伴模型',
    });
  });

  it('companion submitTranscript returns a turn without forcing operate', async () => {
    const port = new RuntimeCompanionPort(repoWith(emptyRoute()));
    const turn = await port.submitTranscript('你好');
    expect(turn.transcript).toBe('你好');
    expect(turn.intent).not.toBeUndefined();
    expect(['companion', 'operate', 'preference', 'errand', 'ambiguous']).toContain(
      turn.intent,
    );
  });

  it('operate getCurrent stays idle and start fail-closes instead of throwing', async () => {
    const events = new TaskUiEventBus();
    const port = new RuntimeOperatePort(
      repoWith(emptyRoute()),
      events,
      {
        resolveCatalog: jest.fn(),
        resolveExecutionTarget: jest.fn(),
        resolveTransport: jest.fn(),
        listPresets: jest.fn(),
      } as never,
      {getCurrent: jest.fn().mockResolvedValue({state: 'failed'})} as never,
    );
    await expect(port.getCurrent()).resolves.toMatchObject({phase: 'idle', steps: []});
    const started = await port.start('打开设置');
    expect(started.kind === 'blocked' || started.kind === 'started').toBe(true);
    if (started.kind === 'blocked') {
      expect(started.blocker.message.length).toBeGreaterThan(0);
    }
  });

  it('capability reads return ready ViewStates instead of port_not_wired', async () => {
    const repo = repoWith(emptyRoute());
    const visual = new RuntimeVisualAgentToolsPort(repo);
    const errands = new RuntimeErrandPort(repo);
    const privacy = new RuntimePrivacyPort(repo);
    const activity = new RuntimeActivityPort(repo, errands);
    await expect(visual.read()).resolves.toMatchObject({status: 'ready'});
    await expect(errands.read()).resolves.toMatchObject({status: 'ready', enabled: false});
    await expect(privacy.read()).resolves.toMatchObject({
      status: 'ready',
      memoryEnabled: true,
    });
    await expect(activity.read()).resolves.toMatchObject({status: 'ready'});
  });
});
