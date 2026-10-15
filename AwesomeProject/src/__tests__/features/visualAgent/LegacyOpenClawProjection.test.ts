// Wave 2A Task 8: proves `VisualAgentProfileController.readActiveProjection`
// only reads the already-migrated current-schema envelope. It must never
// import or invoke `RuntimeConfigMigrationV1`/`LegacyOpenClawBindingPort`,
// read a legacy key, or project upstream metadata/credentials.
import {VisualAgentProfileController} from '@features/visualAgent/application/VisualAgentProfileController';
import type {IdGenerator} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {CredentialStore} from '@core/engine/operateRuntime/contracts/CredentialStore';
import {DEFAULT_AGENT_CONFIG_V2} from '@core/engine/operateRuntime/config/RuntimeConfigValidation';
import type {
  CredentialRetirementRepository,
  RuntimeConfigEnvelopeV1,
  RuntimeConfigRepository,
  RuntimeRouteConfigV1,
} from '@core/engine/operateRuntime/contracts/RuntimeConfigContracts';
import type {
  VisualAgentCapabilitySet,
  VisualAgentToolAdapter,
  VisualAgentToolRegistry,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

const capabilities: VisualAgentCapabilitySet = {
  imageInput: true,
  structuredAction: true,
  stream: true,
  cancel: true,
  approval: true,
  resume: true,
  steer: true,
  preferences: true,
};

interface MigratedRuntimeConfigRepositoryFixture {
  readonly repository: jest.Mocked<RuntimeConfigRepository>;
  readonly migrationRun: jest.Mock;
  readonly legacyStorage: {readonly getItem: jest.Mock};
}

function createMigratedRuntimeConfigRepositoryFixture(input: {
  revision: number;
  visualAgent: RuntimeRouteConfigV1['visualAgent'];
}): MigratedRuntimeConfigRepositoryFixture {
  const active: RuntimeRouteConfigV1 = Object.freeze({
    capabilities: Object.freeze({phoneOperate: false, errands: false}),
    privacy: Object.freeze({memoryEnabled: false, memoryLocation: 'device', memoryProfileId: null}),
    modelAPI: Object.freeze({agentConfig: DEFAULT_AGENT_CONFIG_V2, profiles: [], bindings: []}),
    visualAgent: Object.freeze(input.visualAgent),
  }) as RuntimeRouteConfigV1;
  const envelope: RuntimeConfigEnvelopeV1 = Object.freeze({
    schemaVersion: 1,
    revision: input.revision,
    active,
    draft: active,
  }) as RuntimeConfigEnvelopeV1;

  const repository: jest.Mocked<RuntimeConfigRepository> = {
    load: jest.fn().mockResolvedValue(envelope),
    mutateDraft: jest.fn(),
    activateDraft: jest.fn(),
    compareAndActivate: jest.fn(),
    listProfiles: jest.fn(),
    listBindings: jest.fn(),
    putProfile: jest.fn(),
    putBinding: jest.fn(),
    removeProfile: jest.fn(),
  };

  return {
    repository,
    // Independent forbidden-call spies: the controller constructor accepts
    // none of these, so they can never be invoked by `readActiveProjection`.
    migrationRun: jest.fn(),
    legacyStorage: {getItem: jest.fn()},
  };
}

const makeCredentials = (): jest.Mocked<CredentialStore> => ({
  isAvailable: jest.fn().mockResolvedValue(true),
  put: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  delete: jest.fn().mockResolvedValue(undefined),
});

const makeRetirements = (): jest.Mocked<CredentialRetirementRepository> => ({
  stage: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  list: jest.fn().mockResolvedValue([]),
  complete: jest.fn().mockResolvedValue(undefined),
});

const makeRegistry = (): jest.Mocked<VisualAgentToolRegistry> => ({
  require: jest.fn().mockReturnValue({} as VisualAgentToolAdapter),
  list: jest.fn().mockReturnValue(['openclaw', 'codex', 'cursor', 'dsh', 'hermes']),
});

const makeIds = (): jest.Mocked<IdGenerator> => ({next: jest.fn().mockReturnValue('generated-id')});

describe('VisualAgentProfileController.readActiveProjection legacy boundary', () => {
  it('projects a runtime-migrated OpenClaw profile without invoking migration or reading legacy keys', async () => {
    const fixture = createMigratedRuntimeConfigRepositoryFixture({
      revision: 7,
      visualAgent: {
        enabled: true,
        activeProfileId: 'legacy-openclaw',
        profiles: [
          {
            schemaVersion: 1,
            profileId: 'legacy-openclaw',
            toolId: 'openclaw',
            enabled: true,
            connector: {
              kind: 'connector_bridge',
              bridgeUrl: 'https://bridge.example',
              bindingId: 'legacy-openclaw-gateway',
              secretRef: 'visual-agent:legacy-openclaw',
            },
            requestedCapabilities: capabilities,
          },
        ],
      },
    });

    // The controller constructor has no parameter for `migrationRun` or
    // `legacyStorage`: there is no way for it to reach either spy.
    const controller = new VisualAgentProfileController(
      fixture.repository,
      makeCredentials(),
      makeRetirements(),
      makeRegistry(),
      makeIds(),
    );

    const projection = await controller.readActiveProjection();

    expect(projection).toEqual({
      profileId: 'legacy-openclaw',
      toolId: 'openclaw',
      connectorRef: {kind: 'connector_bridge', bindingId: 'legacy-openclaw-gateway'},
    });
    expect(fixture.repository.load).toHaveBeenCalledTimes(1);
    expect(fixture.repository.compareAndActivate).not.toHaveBeenCalled();
    expect(fixture.migrationRun).not.toHaveBeenCalled();
    expect(fixture.legacyStorage.getItem).not.toHaveBeenCalled();
    // `toolId: 'openclaw'` itself is the frozen legacy tool identity and is
    // expected to survive projection; only upstream metadata/credentials must not.
    expect(JSON.stringify(projection)).not.toMatch(/gatewayUrl|deviceId|cluster|secretRef|bridgeUrl/i);
  });

  it('returns null when the migrated envelope has no active profile', async () => {
    const fixture = createMigratedRuntimeConfigRepositoryFixture({
      revision: 3,
      visualAgent: {enabled: false, activeProfileId: null, profiles: []},
    });
    const controller = new VisualAgentProfileController(
      fixture.repository,
      makeCredentials(),
      makeRetirements(),
      makeRegistry(),
      makeIds(),
    );

    await expect(controller.readActiveProjection()).resolves.toBeNull();
    expect(fixture.migrationRun).not.toHaveBeenCalled();
    expect(fixture.legacyStorage.getItem).not.toHaveBeenCalled();
  });
});
