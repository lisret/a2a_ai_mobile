import {
  validateVisualAgentCapabilitySet,
  validateVisualAgentProfileV1,
} from '../../../../../core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import type {
  VisualAgentCapabilitySet,
  VisualAgentProfileV1,
} from '../../../../../core/engine/operateRuntime/visualAgent/VisualAgentContracts';

const CAPABILITY_KEYS: readonly (keyof VisualAgentCapabilitySet)[] = [
  'imageInput',
  'structuredAction',
  'stream',
  'cancel',
  'approval',
  'resume',
  'steer',
  'preferences',
];

const fullCapabilities: VisualAgentCapabilitySet = {
  imageInput: true,
  structuredAction: true,
  stream: true,
  cancel: true,
  approval: true,
  resume: true,
  steer: true,
  preferences: true,
};

const legacyProfile: VisualAgentProfileV1 = {
  schemaVersion: 1,
  profileId: 'legacy-openclaw',
  toolId: 'openclaw',
  enabled: true,
  connector: {
    kind: 'connector_bridge',
    bridgeUrl: 'https://bridge.example',
    bindingId: 'legacy-openclaw-gateway',
    secretRef: 'visual-agent-bridge:legacy-openclaw-gateway',
  },
  requestedCapabilities: fullCapabilities,
};

const expectCode = (fn: () => unknown, code: string): void => {
  expect(fn).toThrow();
  try {
    fn();
  } catch (error) {
    expect((error as {code?: string}).code).toBe(code);
  }
};

describe('validateVisualAgentCapabilitySet', () => {
  it('accepts a set with all eight declared booleans', () => {
    expect(validateVisualAgentCapabilitySet(fullCapabilities)).toEqual(
      fullCapabilities,
    );
  });

  it.each(CAPABILITY_KEYS)('rejects a set missing the %s boolean', key => {
    const partial: Record<string, boolean> = {...fullCapabilities};
    delete partial[key];
    expectCode(
      () => validateVisualAgentCapabilitySet(partial),
      'visual_agent_invalid_capability_set',
    );
  });

  it.each(CAPABILITY_KEYS)('rejects a non-boolean %s value', key => {
    expectCode(
      () =>
        validateVisualAgentCapabilitySet({...fullCapabilities, [key]: 'yes'}),
      'visual_agent_invalid_capability_set',
    );
  });
});

describe('validateVisualAgentProfileV1', () => {
  it('accepts the legacy openclaw profile as a valid tool id', () => {
    expect(validateVisualAgentProfileV1(legacyProfile)).toBe(legacyProfile);
  });

  it.each(['codex', 'cursor', 'dsh', 'hermes', 'custom:acme'] as const)(
    'accepts the %s tool id',
    toolId => {
      expect(
        validateVisualAgentProfileV1({...legacyProfile, toolId}),
      ).toBeDefined();
    },
  );

  it('rejects the camelCase openClaw spelling that is never a tool id', () => {
    expectCode(
      () => validateVisualAgentProfileV1({...legacyProfile, toolId: 'openClaw'}),
      'visual_agent_invalid_profile',
    );
  });

  it('rejects an empty custom tool id suffix', () => {
    expectCode(
      () => validateVisualAgentProfileV1({...legacyProfile, toolId: 'custom:'}),
      'visual_agent_invalid_profile',
    );
  });

  it('rejects a non connector_bridge connector', () => {
    expectCode(
      () =>
        validateVisualAgentProfileV1({
          ...legacyProfile,
          connector: {...legacyProfile.connector, kind: 'direct'},
        }),
      'visual_agent_invalid_profile',
    );
  });

  it('rejects an invalid requested capability set', () => {
    expectCode(
      () =>
        validateVisualAgentProfileV1({
          ...legacyProfile,
          requestedCapabilities: {imageInput: true},
        }),
      'visual_agent_invalid_capability_set',
    );
  });

  it('requires schemaVersion 1', () => {
    expectCode(
      () => validateVisualAgentProfileV1({...legacyProfile, schemaVersion: 2}),
      'visual_agent_invalid_profile',
    );
  });
});
