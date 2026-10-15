import {AgentConfigV2, ModelConnection} from './AgentTypes';

export interface LegacyMigrationOutput {
  config: AgentConfigV2;
  connections: ModelConnection[];
  secrets: Array<{secretRef: string; plaintext: string}>;
}

export interface LegacyMigrationInput {
  models: Array<{
    id: string;
    provider: string;
    name: string;
    apiUrl: string;
    apiKey: string;
    modelName?: string;
    description?: string;
    createdAt?: number;
    updatedAt?: number;
  }>;
  selectedValues: Record<string, string | null>;
  existingV2?: {config: AgentConfigV2; connections: ModelConnection[]};
}

export const createDefaultAgentConfig = (
  selectedId?: string,
): AgentConfigV2 => ({
  version: 2,
  activeMode: 'cloud_direct',
  modeDrafts: {
    cloudDirect: {modelConnectionId: selectedId},
    cloudSplit: {},
    localVisionCloudPlanner: {localModelId: 'minicpm-v-4.6-q4'},
  },
  maxSteps: 99,
});

export function migrateLegacyAgentConfig(
  input: LegacyMigrationInput,
): LegacyMigrationOutput {
  if (input.existingV2) {
    return {
      config: input.existingV2.config,
      connections: input.existingV2.connections,
      secrets: [],
    };
  }

  const connections: ModelConnection[] = input.models.map(model => ({
    id: model.id,
    providerId: model.provider || 'custom',
    baseUrl: model.apiUrl.trim(),
    modelName: (model.modelName || model.name).trim(),
    secretRef: `model:${model.id}`,
    metadata: {
      displayName: model.name.trim() || (model.modelName || '').trim(),
      ...(model.description?.trim()
        ? {description: model.description.trim()}
        : {}),
      createdAtEpochMs:
        Number.isSafeInteger(model.createdAt) && (model.createdAt ?? -1) >= 0
          ? model.createdAt!
          : 0,
      updatedAtEpochMs:
        Number.isSafeInteger(model.updatedAt) && (model.updatedAt ?? -1) >= 0
          ? model.updatedAt!
          : 0,
    },
    capabilities: {
      vision: true,
      jsonOutput: true,
      toolCalls: false,
      thinking: false,
    },
  }));
  const selectedId =
    ['@autoglm:selected_model', '@autoglm:selectedModel']
      .map(key => input.selectedValues[key])
      .find(id => connections.some(connection => connection.id === id)) ??
    connections[0]?.id;

  return {
    config: createDefaultAgentConfig(selectedId),
    connections,
    secrets: input.models
      .filter(model => model.apiKey.trim().length > 0)
      .map(model => ({
        secretRef: `model:${model.id}`,
        plaintext: model.apiKey,
      })),
  };
}
