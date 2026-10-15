import {
  AgentConfigV2,
  ModelConnection,
} from '../../../../../core/engine/agentRuntime/domain/AgentTypes';
import {migrateLegacyAgentConfig} from '../../../../../core/engine/agentRuntime/domain/AgentConfigMigration';
import {validateAgentConfig} from '../../../../../core/engine/agentRuntime/domain/AgentConfigValidation';

const legacy = {
  id: 'primary',
  provider: 'openai',
  name: 'Primary',
  apiUrl: ' https://api.example.com ',
  apiKey: 'sk-primary',
  modelName: 'gpt-test',
};

describe('migrateLegacyAgentConfig', () => {
  it.each(['@autoglm:selected_model', '@autoglm:selectedModel'])(
    'migrates selected id from %s',
    key => {
      const output = migrateLegacyAgentConfig({
        models: [legacy],
        selectedValues: {[key]: legacy.id},
      });
      expect(output.config.activeMode).toBe('cloud_direct');
      expect(output.config.modeDrafts.cloudDirect.modelConnectionId).toBe(
        legacy.id,
      );
      expect(output.secrets).toEqual([
        {secretRef: `model:${legacy.id}`, plaintext: legacy.apiKey},
      ]);
      expect(output.connections[0]).not.toHaveProperty('apiKey');
    },
  );

  it('uses the first model only when neither selected value resolves', () => {
    const output = migrateLegacyAgentConfig({
      models: [legacy, {...legacy, id: 'secondary'}],
      selectedValues: {
        '@autoglm:selected_model': 'missing',
        '@autoglm:selectedModel': null,
      },
    });
    expect(output.config.modeDrafts.cloudDirect.modelConnectionId).toBe(
      'primary',
    );
  });

  it('produces a direct configuration that validates with migrated capabilities', () => {
    const output = migrateLegacyAgentConfig({
      models: [legacy],
      selectedValues: {},
    });

    expect(validateAgentConfig(output.config, output.connections)).toEqual({
      ok: true,
    });
  });

  it('returns existing V2 data unchanged and does not restage plaintext secrets', () => {
    const config: AgentConfigV2 = {
      version: 2,
      activeMode: 'cloud_direct',
      modeDrafts: {
        cloudDirect: {modelConnectionId: 'existing'},
        cloudSplit: {},
        localVisionCloudPlanner: {localModelId: 'minicpm-v-4.6-q4'},
      },
      maxSteps: 99,
    };
    const connections: ModelConnection[] = [
      {
        id: 'existing',
        providerId: 'custom',
        baseUrl: 'https://existing.example.com',
        modelName: 'existing-model',
        secretRef: 'model:existing',
        capabilities: {
          vision: true,
          jsonOutput: true,
          toolCalls: false,
          thinking: false,
        },
      },
    ];

    expect(
      migrateLegacyAgentConfig({
        models: [legacy],
        selectedValues: {},
        existingV2: {config, connections},
      }),
    ).toEqual({
      config,
      connections,
      secrets: [],
    });
  });
});
