import {
  ActionDecision,
  AgentConfigV2,
  AgentMode,
  ModelConnection,
  Observation,
} from '../../../../../core/engine/agentRuntime/domain/AgentTypes';
import {validateAgentConfig} from '../../../../../core/engine/agentRuntime/domain/AgentConfigValidation';

const makeConnections = (): ModelConnection[] => [
  {
    id: 'direct',
    providerId: 'openai',
    baseUrl: 'https://api.example.com',
    modelName: 'direct-model',
    secretRef: 'model:direct',
    capabilities: {
      vision: true,
      jsonOutput: true,
      toolCalls: true,
      thinking: false,
    },
  },
  {
    id: 'vision',
    providerId: 'openai',
    baseUrl: 'https://api.example.com',
    modelName: 'vision-model',
    secretRef: 'model:vision',
    capabilities: {
      vision: true,
      jsonOutput: true,
      toolCalls: false,
      thinking: false,
    },
  },
  {
    id: 'planner',
    providerId: 'openai',
    baseUrl: 'https://api.example.com',
    modelName: 'planner-model',
    secretRef: 'model:planner',
    capabilities: {
      vision: false,
      jsonOutput: true,
      toolCalls: true,
      thinking: false,
    },
  },
];

const makeConfig = (mode: AgentMode, draft: object): AgentConfigV2 => {
  const modeDrafts: AgentConfigV2['modeDrafts'] = {
    cloudDirect: {},
    cloudSplit: {},
    localVisionCloudPlanner: {localModelId: 'minicpm-v-4.6-q4'},
  };
  if (mode === 'cloud_direct') {
    modeDrafts.cloudDirect =
      draft as AgentConfigV2['modeDrafts']['cloudDirect'];
  } else if (mode === 'cloud_split') {
    modeDrafts.cloudSplit = draft as AgentConfigV2['modeDrafts']['cloudSplit'];
  } else {
    modeDrafts.localVisionCloudPlanner =
      draft as AgentConfigV2['modeDrafts']['localVisionCloudPlanner'];
  }
  return {version: 2, activeMode: mode, modeDrafts, maxSteps: 99};
};

const makeLocalConfig = (): AgentConfigV2 =>
  makeConfig('local_vision_cloud_planner', {
    localModelId: 'minicpm-v-4.6-q4',
    plannerConnectionId: 'planner',
  });

const observationFixture: Observation = {
  schemaVersion: 1,
  stateSummary: 'login form visible',
  visibleText: ['Sign in', 'Email'],
  elements: [
    {
      id: 'sign-in',
      role: 'button',
      text: 'Sign in',
      bbox: [0, 0, 1000, 80],
      enabled: true,
      confidence: 0.99,
    },
  ],
  uncertainties: [],
};

const actionDecisionFixture: ActionDecision = {
  schemaVersion: 1,
  subtaskId: 'sign-in',
  action: 'tap',
  targetId: 'sign-in',
  coordinates: [500, 40],
  expectedState: 'credentials form focused',
  risk: 'low',
};

describe('validateAgentConfig', () => {
  it('exposes schema-versioned observation and action DTO fixtures', () => {
    expect(observationFixture.visibleText).toContain('Sign in');
    expect(actionDecisionFixture.action).toBe('tap');
  });

  it.each([
    ['cloud_direct', 1, {modelConnectionId: 'direct'}],
    [
      'cloud_split',
      2,
      {visionConnectionId: 'vision', plannerConnectionId: 'planner'},
    ],
    [
      'local_vision_cloud_planner',
      1,
      {localModelId: 'minicpm-v-4.6-q4', plannerConnectionId: 'planner'},
    ],
  ] as const)(
    'validates %s with %i credential reference(s)',
    (mode, _count, draft) => {
      const result = validateAgentConfig(
        makeConfig(mode, draft),
        makeConnections(),
        {state: 'ready', reasons: [], checkedAtEpochMs: 1},
      );
      expect(result).toEqual({ok: true});
    },
  );

  it('rejects local mode until eligibility is ready', () => {
    const result = validateAgentConfig(makeLocalConfig(), makeConnections(), {
      state: 'needs_test',
      reasons: ['self_test_required'],
      checkedAtEpochMs: 1,
    });
    expect(result).toEqual({ok: false, errors: ['local_model_not_ready']});
  });

  it('rejects active connections with missing secrets or capabilities', () => {
    const connections = makeConnections().map(connection =>
      connection.id === 'direct'
        ? {
            ...connection,
            secretRef: '',
            capabilities: {...connection.capabilities, vision: false},
          }
        : connection,
    );
    expect(
      validateAgentConfig(
        makeConfig('cloud_direct', {modelConnectionId: 'direct'}),
        connections,
      ),
    ).toEqual({
      ok: false,
      errors: ['connection_secret_missing', 'connection_vision_unsupported'],
    });
  });

  it('maps a missing JSON-output capability to its explicit error', () => {
    const connections = makeConnections().map(connection =>
      connection.id === 'direct'
        ? {
            ...connection,
            capabilities: {...connection.capabilities, jsonOutput: false},
          }
        : connection,
    );

    expect(
      validateAgentConfig(
        makeConfig('cloud_direct', {modelConnectionId: 'direct'}),
        connections,
      ),
    ).toEqual({
      ok: false,
      errors: ['connection_json_output_unsupported'],
    });
  });

  it('rejects an invalid max-step count', () => {
    expect(
      validateAgentConfig(
        {
          ...makeConfig('cloud_direct', {modelConnectionId: 'direct'}),
          maxSteps: 0,
        },
        makeConnections(),
      ),
    ).toEqual({
      ok: false,
      errors: ['max_steps_invalid'],
    });
  });
});
