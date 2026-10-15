import {CredentialReferenceGarbageCollector} from '../../../../../core/engine/operateRuntime/session/CredentialReferenceGarbageCollector';
import type {CredentialStore} from '../../../../../core/engine/operateRuntime/contracts/CredentialStore';
import type {
  CredentialRetirementRecordV1,
  CredentialRetirementRepository,
  RuntimeConfigEnvelopeV1,
  RuntimeRouteConfigV1,
} from '../../../../../core/engine/operateRuntime/contracts/RuntimeConfigContracts';
import type {ResolvedOperateSessionV1} from '../../../../../core/engine/operateRuntime/contracts/OperateSessionContracts';
import type {
  ModelEndpointProfileV1,
  ProviderExecutionTargetV1,
} from '../../../../../core/engine/operateRuntime/model/ModelProviderContracts';
import type {VisualAgentProfileV1} from '../../../../../core/engine/operateRuntime/visualAgent/VisualAgentContracts';

function modelProfile(secretRef: string | null): ModelEndpointProfileV1 {
  return {
    id: `profile:${secretRef ?? 'none'}`,
    label: 'Direct',
    mode: 'preset',
    preset: 'openai',
    baseURLOverride: null,
    region: null,
    channel: null,
    secretRef,
    generation: 1,
  };
}

function visualProfile(secretRef: string | null): VisualAgentProfileV1 {
  return {
    schemaVersion: 1,
    profileId: `visual:${secretRef ?? 'none'}`,
    toolId: 'openclaw',
    enabled: true,
    connector: {
      kind: 'connector_bridge',
      bridgeUrl: 'https://bridge.example',
      bindingId: 'binding-1',
      secretRef,
    },
    requestedCapabilities: {
      imageInput: true,
      structuredAction: true,
      stream: false,
      cancel: false,
      approval: false,
      resume: false,
      steer: false,
      preferences: false,
    },
  };
}

function route(
  overrides: {
    modelSecretRefs?: (string | null)[];
    visualSecretRefs?: (string | null)[];
  } = {},
): RuntimeRouteConfigV1 {
  return {
    capabilities: {phoneOperate: true, errands: false},
    privacy: {
      memoryEnabled: false,
      memoryLocation: 'device',
      memoryProfileId: null,
    },
    modelAPI: {
      agentConfig: {
        version: 2,
        activeMode: 'cloud_direct',
        modeDrafts: {
          cloudDirect: {},
          cloudSplit: {},
          localVisionCloudPlanner: {},
        },
        maxSteps: 20,
      } as RuntimeRouteConfigV1['modelAPI']['agentConfig'],
      profiles: (overrides.modelSecretRefs ?? []).map(modelProfile),
      bindings: [],
    },
    visualAgent: {
      enabled: false,
      activeProfileId: null,
      profiles: (overrides.visualSecretRefs ?? []).map(visualProfile),
    },
  };
}

function envelope(
  active: RuntimeRouteConfigV1,
  draft: RuntimeRouteConfigV1 = route(),
): RuntimeConfigEnvelopeV1 {
  return {schemaVersion: 1, revision: 1, active, draft};
}

function bindingSnapshot(secretRef: string | null) {
  return {
    role: 'direct' as const,
    bindingId: 'binding:direct',
    profileId: 'profile:direct',
    modelId: 'gpt-4o',
    maxSteps: 20,
    provider: 'openai',
    transportAdapterId: 'openai',
    protocol: 'openai_chat_completions',
    baseURL: 'https://api.openai.com',
    auth: {kind: 'bearer'},
    chatPath: '/v1/chat/completions',
    region: null,
    channel: null,
    secretRef,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    capabilities: {
      chat: true,
      vision: true,
      toolCalls: true,
      reasoning: 'unknown',
    },
    capabilityTrust: 'verified_remote',
  } as ProviderExecutionTargetV1 & {
    role: 'direct';
    bindingId: string;
    profileId: string;
    modelId: string;
    maxSteps: number;
  };
}

function sessionUsing(secretRef: string): ResolvedOperateSessionV1 {
  return {
    schemaVersion: 1,
    taskId: `task:${secretRef}`,
    sessionRevision: 1,
    configRevision: 1,
    channel: 'cloud_direct',
    modelBindings: {direct: bindingSnapshot(secretRef)},
    createdAtMs: 0,
  };
}

function committed(
  oldSecretRef: string | null,
  replacementSecretRef: string | null = null,
): CredentialRetirementRecordV1 {
  return {
    schemaVersion: 1,
    retirementId: `ret:${oldSecretRef ?? 'null'}:${
      replacementSecretRef ?? 'null'
    }`,
    state: 'committed',
    oldSecretRef,
    replacementSecretRef,
    createdAtMs: 0,
  };
}

function staged(
  oldSecretRef: string | null,
  replacementSecretRef: string | null,
): CredentialRetirementRecordV1 {
  return {...committed(oldSecretRef, replacementSecretRef), state: 'staged'};
}

interface Harness {
  collector: CredentialReferenceGarbageCollector;
  retirements: jest.Mocked<CredentialRetirementRepository>;
  credentials: jest.Mocked<CredentialStore>;
  sessions: {listNonterminal: jest.Mock};
  configLoad: jest.Mock;
}

function makeHarness(
  configEnvelope: RuntimeConfigEnvelopeV1 = envelope(route()),
): Harness {
  const retirements: jest.Mocked<CredentialRetirementRepository> = {
    stage: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue([]),
    complete: jest.fn().mockResolvedValue(undefined),
  };
  const credentials: jest.Mocked<CredentialStore> = {
    isAvailable: jest.fn().mockResolvedValue(true),
    put: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const sessions = {listNonterminal: jest.fn().mockResolvedValue([])};
  const configLoad = jest.fn().mockResolvedValue(configEnvelope);
  const collector = new CredentialReferenceGarbageCollector(
    {load: configLoad} as never,
    sessions as never,
    retirements,
    credentials,
  );
  return {collector, retirements, credentials, sessions, configLoad};
}

describe('CredentialReferenceGarbageCollector', () => {
  it('deletes and completes a committed retirement whose old ref is unreferenced', async () => {
    const h = makeHarness();
    h.retirements.list.mockResolvedValue([committed('model:old')]);
    await h.collector.reconcileBeforeAcceptingTasks();
    expect(h.credentials.delete).toHaveBeenCalledWith('model:old');
    expect(h.retirements.complete).toHaveBeenCalledWith('ret:model:old:null');
  });

  it('completes a committed create record with a null old ref without deleting', async () => {
    const h = makeHarness();
    h.retirements.list.mockResolvedValue([committed(null, 'model:new')]);
    h.configLoad.mockResolvedValue(
      envelope(route({modelSecretRefs: ['model:new']})),
    );
    await h.collector.reconcileBeforeAcceptingTasks();
    expect(h.credentials.delete).not.toHaveBeenCalled();
    expect(h.retirements.complete).toHaveBeenCalledWith('ret:null:model:new');
  });

  it('keeps a retired ref while a nonterminal session pins it, then collects on a later cold start', async () => {
    const h = makeHarness();
    h.retirements.list.mockResolvedValue([committed('model:old')]);
    h.sessions.listNonterminal.mockResolvedValue([sessionUsing('model:old')]);
    await h.collector.reconcileBeforeAcceptingTasks();
    expect(h.credentials.delete).not.toHaveBeenCalled();
    expect(h.retirements.complete).not.toHaveBeenCalled();

    h.sessions.listNonterminal.mockResolvedValue([]);
    await h.collector.reconcileBeforeAcceptingTasks();
    expect(h.credentials.delete).toHaveBeenCalledWith('model:old');
    expect(h.retirements.complete).toHaveBeenCalledWith('ret:model:old:null');
  });

  it('keeps a committed ref pinned by active or draft config', async () => {
    const h = makeHarness(
      envelope(
        route({modelSecretRefs: ['model:kept']}),
        route({visualSecretRefs: ['visual:kept']}),
      ),
    );
    h.retirements.list.mockResolvedValue([
      committed('model:kept'),
      committed('visual:kept'),
    ]);
    await h.collector.reconcileBeforeAcceptingTasks();
    expect(h.credentials.delete).not.toHaveBeenCalled();
  });

  it('treats a referenced staged replacement as committed and deletes the unreferenced old ref', async () => {
    const h = makeHarness(envelope(route({modelSecretRefs: ['model:new']})));
    h.retirements.list.mockResolvedValue([staged('model:old', 'model:new')]);
    await h.collector.reconcileBeforeAcceptingTasks();
    expect(h.credentials.delete).toHaveBeenCalledWith('model:old');
    expect(h.credentials.delete).not.toHaveBeenCalledWith('model:new');
    expect(h.retirements.complete).toHaveBeenCalledWith(
      'ret:model:old:model:new',
    );
  });

  it('deletes the orphan replacement and rolls back an unreferenced staged replacement', async () => {
    const h = makeHarness();
    h.retirements.list.mockResolvedValue([staged('model:old', 'model:orphan')]);
    await h.collector.reconcileBeforeAcceptingTasks();
    expect(h.credentials.delete).toHaveBeenCalledWith('model:orphan');
    expect(h.credentials.delete).not.toHaveBeenCalledWith('model:old');
    expect(h.retirements.rollback).toHaveBeenCalledWith(
      'ret:model:old:model:orphan',
    );
    expect(h.retirements.complete).not.toHaveBeenCalled();
  });

  it('rolls back a staged removal whose old ref is still live in config', async () => {
    const h = makeHarness(envelope(route({modelSecretRefs: ['model:live']})));
    h.retirements.list.mockResolvedValue([staged('model:live', null)]);
    await h.collector.reconcileBeforeAcceptingTasks();
    expect(h.credentials.delete).not.toHaveBeenCalled();
    expect(h.retirements.rollback).toHaveBeenCalledWith('ret:model:live:null');
  });

  it('commits and waits on a staged removal pinned only by a nonterminal session', async () => {
    const h = makeHarness();
    h.retirements.list.mockResolvedValue([staged('model:pinned', null)]);
    h.sessions.listNonterminal.mockResolvedValue([
      sessionUsing('model:pinned'),
    ]);
    await h.collector.reconcileBeforeAcceptingTasks();
    expect(h.credentials.delete).not.toHaveBeenCalled();
    expect(h.retirements.commit).toHaveBeenCalledWith('ret:model:pinned:null');
    expect(h.retirements.complete).not.toHaveBeenCalled();
  });

  it('deletes and completes an entirely unreferenced staged removal', async () => {
    const h = makeHarness();
    h.retirements.list.mockResolvedValue([staged('model:gone', null)]);
    await h.collector.reconcileBeforeAcceptingTasks();
    expect(h.credentials.delete).toHaveBeenCalledWith('model:gone');
    expect(h.retirements.complete).toHaveBeenCalledWith('ret:model:gone:null');
  });

  it('leaves the record intact and blocks tasks when deletion cannot be verified', async () => {
    const h = makeHarness();
    h.retirements.list.mockResolvedValue([committed('model:stuck')]);
    h.credentials.get.mockResolvedValue('still-here');
    await expect(h.collector.reconcileBeforeAcceptingTasks()).rejects.toThrow(
      'credential_cleanup_required',
    );
    expect(h.retirements.complete).not.toHaveBeenCalled();
  });

  it('does not log any credential ref', async () => {
    const h = makeHarness();
    h.retirements.list.mockResolvedValue([committed('model:secret-ref')]);
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const info = jest
      .spyOn(console, 'info')
      .mockImplementation(() => undefined);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await h.collector.reconcileBeforeAcceptingTasks();
    const emitted = [...warn.mock.calls, ...info.mock.calls, ...log.mock.calls]
      .flat()
      .join(' ');
    expect(emitted).not.toContain('model:secret-ref');
    warn.mockRestore();
    info.mockRestore();
    log.mockRestore();
  });
});
