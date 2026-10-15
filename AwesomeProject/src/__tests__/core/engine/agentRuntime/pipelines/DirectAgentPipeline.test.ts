import {DirectAgentPipeline} from '../../../../../core/engine/agentRuntime/pipelines/DirectAgentPipeline';
import type {
  DirectActionDecision,
  DirectAgentProvider,
  StepInput,
} from '../../../../../core/engine/agentRuntime/contracts/AgentContracts';

describe('DirectAgentPipeline', () => {
  it('passes the screenshot only to the direct provider and returns its decision', async () => {
    const decision: DirectActionDecision = {
      schemaVersion: 1,
      subtaskId: 'open-settings',
      action: 'tap',
      coordinates: [500, 500],
      expectedState: 'Settings is visible',
      risk: 'low',
    };
    const provider: DirectAgentProvider = {
      decide: jest.fn().mockResolvedValue(decision),
    };
    const input: StepInput = {
      screenshotUri: 'data:image/png;base64,x',
      instruction: 'Open settings',
      history: [],
      signal: new AbortController().signal,
    };

    const result = await new DirectAgentPipeline(provider).decide(input);

    expect(provider.decide).toHaveBeenCalledWith(input);
    expect(result).toEqual({decision});
  });
});
