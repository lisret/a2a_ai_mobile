import {
  AgentConfigV2,
  ModelConnection,
} from '../../../../../core/engine/agentRuntime/domain/AgentTypes';
import {AgentConfigState} from '../../../../../core/engine/agentRuntime/domain/AgentConfigState';

const config = (activeMode: AgentConfigV2['activeMode']): AgentConfigV2 => ({
  version: 2,
  activeMode,
  modeDrafts: {
    cloudDirect: {modelConnectionId: 'direct'},
    cloudSplit: {},
    localVisionCloudPlanner: {localModelId: 'minicpm-v-4.6-q4'},
  },
  maxSteps: 99,
});

const connection: ModelConnection = {
  id: 'direct',
  providerId: 'openai',
  baseUrl: 'https://api.example.com',
  modelName: 'original-model',
  secretRef: 'model:direct',
  capabilities: {
    vision: true,
    jsonOutput: true,
    toolCalls: true,
    thinking: false,
  },
};

describe('AgentConfigState', () => {
  it('creates immutable task snapshots detached from later configuration changes', () => {
    const state = new AgentConfigState(config('cloud_direct'), [connection]);
    const snapshot = state.createTaskSnapshot();

    state.replaceConfig(config('cloud_split'));
    expect(snapshot.config.activeMode).toBe('cloud_direct');
    expect(Object.isFrozen(snapshot.connections)).toBe(true);
    expect(snapshot.connections.direct.modelName).toBe('original-model');
    expect(Object.isFrozen(snapshot.connections.direct.capabilities)).toBe(
      true,
    );
  });

  it('does not retain mutable caller-owned objects', () => {
    const mutableConnection = {
      ...connection,
      capabilities: {...connection.capabilities},
    };
    const state = new AgentConfigState(config('cloud_direct'), [
      mutableConnection,
    ]);
    mutableConnection.modelName = 'mutated-after-construction';
    mutableConnection.capabilities.vision = false;

    const snapshot = state.createTaskSnapshot();
    expect(snapshot.connections.direct.modelName).toBe('original-model');
    expect(snapshot.connections.direct.capabilities.vision).toBe(true);
  });
});
