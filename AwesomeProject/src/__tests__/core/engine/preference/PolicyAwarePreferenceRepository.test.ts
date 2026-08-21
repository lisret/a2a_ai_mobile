import {PolicyAwarePreferenceRepository} from '@features/preference/data/PolicyAwarePreferenceRepository';
import type {CapabilityConfigSnapshot} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {
  ConfirmedPreferenceDraft,
  Preference,
} from '@core/engine/preference/domain/Preference';
import type {PreferenceRepository} from '@core/engine/preference/ports/PreferenceRepository';
import type {VisualAgentProfileV1} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

const fullCaps = () => ({
  imageInput: true,
  structuredAction: true,
  stream: true,
  cancel: true,
  approval: true,
  resume: true,
  steer: true,
  preferences: true,
});

const visualProfile = (id: string, enabled = true): VisualAgentProfileV1 => ({
  schemaVersion: 1,
  profileId: id,
  toolId: 'openclaw',
  enabled,
  connector: {
    kind: 'connector_bridge',
    bridgeUrl: 'wss://bridge.example/socket',
    bindingId: 'binding-1',
    secretRef: null,
  },
  requestedCapabilities: fullCaps(),
});

const makeRepo = (): jest.Mocked<PreferenceRepository> => ({
  list: jest.fn<Promise<readonly Preference[]>, []>(async () => []),
  upsertConfirmed: jest.fn<Promise<Preference>, [ConfirmedPreferenceDraft]>(
    async () => ({
      id: 'p',
      kind: 'preference',
      title: 't',
      summary: 's',
      createdAtEpochMs: 1,
      updatedAtEpochMs: 1,
    }),
  ),
  delete: jest.fn<Promise<void>, [string]>(async () => undefined),
  forgetAll: jest.fn<Promise<void>, []>(async () => undefined),
});

const snapshot = (
  over: Partial<CapabilityConfigSnapshot['privacy']> = {},
  visual: Partial<CapabilityConfigSnapshot['visualAgent']> = {},
): CapabilityConfigSnapshot => ({
  revision: 1,
  capabilities: {errands: true},
  privacy: {
    memoryEnabled: true,
    memoryLocation: 'device',
    memoryProfileId: null,
    ...over,
  },
  visualAgent: {
    enabled: true,
    activeProfileId: 'p1',
    profiles: [visualProfile('p1')],
    ...visual,
  },
});

describe('PolicyAwarePreferenceRepository', () => {
  it('fails closed when selected Visual Agent preferences are unavailable', async () => {
    const local = makeRepo();
    const remote = makeRepo();
    const config = {read: jest.fn(), compareAndSet: jest.fn()};
    remote.list.mockRejectedValueOnce(new Error('visual_agent_disconnected'));
    config.read.mockResolvedValue(
      snapshot({memoryLocation: 'visual_agent', memoryProfileId: 'p1'}),
    );
    const repository = new PolicyAwarePreferenceRepository({local, remote, config});

    await expect(repository.list()).rejects.toThrow('preference_remote_unavailable');
    expect(local.list).not.toHaveBeenCalled();
  });

  it('returns [] for list and rejects mutation when memory disabled', async () => {
    const local = makeRepo();
    const remote = makeRepo();
    const config = {read: jest.fn(), compareAndSet: jest.fn()};
    config.read.mockResolvedValue(snapshot({memoryEnabled: false}));
    const repository = new PolicyAwarePreferenceRepository({local, remote, config});

    await expect(repository.list()).resolves.toEqual([]);
    await expect(
      repository.upsertConfirmed({kind: 'preference', title: 't', summary: 's'}),
    ).rejects.toThrow('privacy_blocked');
    expect(local.list).not.toHaveBeenCalled();
  });

  it('routes device memory to the local repository', async () => {
    const local = makeRepo();
    const remote = makeRepo();
    const config = {read: jest.fn(), compareAndSet: jest.fn()};
    config.read.mockResolvedValue(snapshot({memoryLocation: 'device'}));
    const repository = new PolicyAwarePreferenceRepository({local, remote, config});

    await repository.list();
    expect(local.list).toHaveBeenCalledTimes(1);
    expect(remote.list).not.toHaveBeenCalled();
  });

  it('fails closed when visual_agent selected but profile is missing', async () => {
    const local = makeRepo();
    const remote = makeRepo();
    const config = {read: jest.fn(), compareAndSet: jest.fn()};
    config.read.mockResolvedValue(
      snapshot({memoryLocation: 'visual_agent', memoryProfileId: 'ghost'}),
    );
    const repository = new PolicyAwarePreferenceRepository({local, remote, config});

    await expect(repository.list()).rejects.toThrow('preference_remote_unavailable');
    expect(remote.list).not.toHaveBeenCalled();
    expect(local.list).not.toHaveBeenCalled();
  });
});
