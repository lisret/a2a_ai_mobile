import {SplitAgentPipeline} from '../../../../../core/engine/agentRuntime/pipelines/SplitAgentPipeline';
import type {
  ActionDecision,
  Observation,
  PerceptionProvider,
  PlannerProvider,
  StepInput,
} from '../../../../../core/engine/agentRuntime/contracts/AgentContracts';

const observation: Observation = {
  schemaVersion: 1,
  stateSummary: 'A settings page',
  visibleText: ['Settings'],
  elements: [],
  uncertainties: [],
};
const decision: ActionDecision = {
  schemaVersion: 1,
  subtaskId: 'done',
  action: 'finish',
  expectedState: 'Settings is visible',
  risk: 'low',
};
const stepInput = (): StepInput => ({
  screenshotUri: 'data:image/png;base64,x',
  instruction: 'Open settings',
  history: [],
  signal: new AbortController().signal,
});

describe('SplitAgentPipeline', () => {
  it('calls perception before planner and returns observation and decision', async () => {
    const callOrder: string[] = [];
    const taintedObservation = {
      ...observation,
      screenshotUri: 'data:image/png;base64,private',
      image_url: {url: 'data:image/png;base64,private'},
    } as unknown as Observation;
    const perception: PerceptionProvider = {
      observe: jest.fn(async () => {
        callOrder.push('perception');
        return taintedObservation;
      }),
    };
    const planner: PlannerProvider = {
      plan: jest.fn(async input => {
        callOrder.push('planner');
        expect(input).toEqual({
          observation,
          instruction: 'Open settings',
          history: [],
          signal: expect.any(AbortSignal),
        });
        expect(input).not.toHaveProperty('screenshotUri');
        return decision;
      }),
    };

    const result = await new SplitAgentPipeline(perception, planner).decide(
      stepInput(),
    );

    expect(callOrder).toEqual(['perception', 'planner']);
    expect(perception.observe).toHaveBeenCalledWith(
      expect.objectContaining({
        screenshotUri: 'data:image/png;base64,x',
        instruction: 'Open settings',
      }),
    );
    expect(result).toEqual({observation, decision});
  });

  it('fails closed before planner when perception returns an invalid observation', async () => {
    const perception: PerceptionProvider = {
      observe: jest.fn().mockResolvedValue({...observation, elements: [{}]}),
    };
    const planner: PlannerProvider = {plan: jest.fn()};

    await expect(
      new SplitAgentPipeline(perception, planner).decide(stepInput()),
    ).rejects.toMatchObject({
      code: 'invalid_structured_response',
      message: 'Provider returned invalid structured output',
    });
    expect(planner.plan).not.toHaveBeenCalled();
  });

  it.each([
    [
      'blank id',
      {
        ...observation,
        elements: [
          {
            id: ' ',
            role: 'button',
            bbox: [0, 0, 10, 10],
            enabled: true,
            confidence: 1,
          },
        ],
      },
    ],
    [
      'blank role',
      {
        ...observation,
        elements: [
          {
            id: 'button',
            role: '',
            bbox: [0, 0, 10, 10],
            enabled: true,
            confidence: 1,
          },
        ],
      },
    ],
    [
      'x plus width overflow',
      {
        ...observation,
        elements: [
          {
            id: 'button',
            role: 'button',
            bbox: [950, 0, 51, 10],
            enabled: true,
            confidence: 1,
          },
        ],
      },
    ],
    [
      'y plus height overflow',
      {
        ...observation,
        elements: [
          {
            id: 'button',
            role: 'button',
            bbox: [0, 999, 10, 2],
            enabled: true,
            confidence: 1,
          },
        ],
      },
    ],
  ])('rejects observation elements with %s', async (_label, invalid) => {
    const perception: PerceptionProvider = {
      observe: jest.fn().mockResolvedValue(invalid),
    };
    const planner: PlannerProvider = {plan: jest.fn()};

    await expect(
      new SplitAgentPipeline(perception, planner).decide(stepInput()),
    ).rejects.toMatchObject({code: 'invalid_structured_response'});
    expect(planner.plan).not.toHaveBeenCalled();
  });

  it('does not invoke the planner when perception fails', async () => {
    const perception: PerceptionProvider = {
      observe: jest.fn().mockRejectedValue(new Error('vision unavailable')),
    };
    const planner: PlannerProvider = {plan: jest.fn()};

    await expect(
      new SplitAgentPipeline(perception, planner).decide(stepInput()),
    ).rejects.toThrow('vision unavailable');
    expect(planner.plan).not.toHaveBeenCalled();
  });
});
