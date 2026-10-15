import type {
  ActionDecision,
  Observation,
} from '../../../../../core/engine/agentRuntime/domain/AgentTypes';
import {
  ActionValidationError,
  validateActionDecision,
} from '../../../../../core/engine/agentRuntime/policy/ActionDecisionValidator';

const observation: Observation = {
  schemaVersion: 1,
  stateSummary: 'compose screen',
  visibleText: ['Send'],
  elements: [
    {
      id: 'primary',
      role: 'button',
      text: 'Continue',
      bbox: [100, 200, 200, 100],
      enabled: true,
      confidence: 0.99,
    },
    {
      id: 'disabled',
      role: 'button',
      bbox: [0, 0, 100, 100],
      enabled: false,
      confidence: 0.99,
    },
    {
      id: 'uncertain',
      role: 'button',
      bbox: [0, 0, 100, 100],
      enabled: true,
      confidence: 0.2,
    },
    {
      id: 'danger-1',
      role: 'button',
      text: 'Delete account',
      bbox: [500, 500, 200, 100],
      enabled: true,
      confidence: 0.99,
    },
    {
      id: 'danger-2',
      role: 'button',
      text: '发送消息',
      bbox: [500, 700, 200, 100],
      enabled: true,
      confidence: 0.99,
    },
  ],
  uncertainties: [],
};

const tapDecision = (): ActionDecision => ({
  schemaVersion: 1,
  subtaskId: 'submit',
  action: 'tap',
  targetId: 'primary',
  expectedState: 'button activated',
  risk: 'low',
});

const expectValidationCode = (
  input: unknown,
  code: ActionValidationError['code'],
  source: Observation = observation,
) => {
  try {
    validateActionDecision(input, source);
    throw new Error('Expected validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(ActionValidationError);
    expect((error as ActionValidationError).code).toBe(code);
  }
};

describe('validateActionDecision', () => {
  it('rejects a missing or blank expected state', () => {
    const missing: Partial<ActionDecision> = {...tapDecision()};
    delete missing.expectedState;
    expectValidationCode(missing, 'missing_expected_state');
    expectValidationCode(
      {...tapDecision(), expectedState: '   '},
      'missing_expected_state',
    );
  });

  it.each([
    [-1, 500],
    [500, 1001],
    [Number.NaN, 500],
  ])('rejects normalized coordinates outside 0..1000: %p', (x, y) => {
    expectValidationCode(
      {...tapDecision(), targetId: undefined, coordinates: [x, y]},
      'coordinates_out_of_range',
    );
  });

  it('rejects unknown, disabled, and low-confidence targets with typed errors', () => {
    expectValidationCode(
      {...tapDecision(), targetId: 'missing'},
      'target_not_found',
    );
    expectValidationCode(
      {...tapDecision(), targetId: 'disabled'},
      'target_disabled',
    );
    expectValidationCode(
      {...tapDecision(), targetId: 'uncertain'},
      'target_confidence_low',
    );
  });

  it('requires an observation only when a decision uses targetId', () => {
    expect(() => validateActionDecision(tapDecision())).toThrow(
      expect.objectContaining({code: 'target_observation_missing'}),
    );

    expect(
      validateActionDecision({
        ...tapDecision(),
        targetId: undefined,
        coordinates: [500, 500],
      }).action,
    ).toBe('tap');
  });

  it.each([
    [{enabled: 'false'}, 'target_schema_invalid'],
    [{confidence: 1.1}, 'target_schema_invalid'],
    [{bbox: null}, 'target_schema_invalid'],
  ] as const)(
    'rejects malformed provider target fields %p with a typed error',
    (targetPatch, code) => {
      const malformed = {
        ...observation,
        elements: [{...observation.elements[0], ...targetPatch}],
      } as unknown as Observation;

      expectValidationCode(tapDecision(), code, malformed);
    },
  );

  it('rejects input actions without non-blank text', () => {
    expectValidationCode(
      {...tapDecision(), action: 'input', text: undefined},
      'input_text_missing',
    );
    expectValidationCode(
      {...tapDecision(), action: 'input', text: '  '},
      'input_text_missing',
    );
  });

  it('requires swipe start target and end coordinates', () => {
    expectValidationCode(
      {...tapDecision(), action: 'swipe', targetId: undefined},
      'swipe_target_missing',
    );
    expectValidationCode(
      {...tapDecision(), action: 'swipe', coordinates: undefined},
      'swipe_end_coordinates_missing',
    );
  });

  it('stops an identical action when the observed UI did not change', () => {
    const decision = tapDecision();

    try {
      validateActionDecision(decision, observation, {
        previousDecision: decision,
        stateChangedSincePreviousAction: false,
      });
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ActionValidationError);
      expect((error as ActionValidationError).code).toBe(
        'repeated_unchanged_action',
      );
    }

    expect(
      validateActionDecision(decision, observation, {
        previousDecision: decision,
        stateChangedSincePreviousAction: true,
      }).action,
    ).toBe('tap');
  });

  it.each([
    [{...tapDecision(), risk: 'high' as const}, true],
    [{...tapDecision(), expectedState: 'payment submitted'}, true],
    [{...tapDecision(), expectedState: 'transfer completed'}, true],
    [{...tapDecision(), expectedState: 'record deleted'}, true],
    [{...tapDecision(), expectedState: 'authorization granted'}, true],
    [{...tapDecision(), expectedState: 'send message complete'}, true],
    [{...tapDecision(), expectedState: '消息已发送'}, true],
    [tapDecision(), false],
  ])('marks high-risk decision %p for confirmation', (decision, expected) => {
    expect(
      validateActionDecision(decision, observation).requiresConfirmation,
    ).toBe(expected);
  });

  it.each(['danger-1', 'danger-2'])(
    'does not trust low provider risk when target %s is high risk',
    targetId => {
      expect(
        validateActionDecision(
          {...tapDecision(), targetId, expectedState: 'done', risk: 'low'},
          observation,
        ).requiresConfirmation,
      ).toBe(true);
    },
  );

  it('accepts exact coordinate boundaries and returns an immutable validated copy', () => {
    const input: ActionDecision = {
      ...tapDecision(),
      targetId: undefined,
      coordinates: [0, 1000],
    };

    const validated = validateActionDecision(input, observation);

    expect(validated).toEqual({...input, requiresConfirmation: false});
    expect(validated).not.toBe(input);
    expect(Object.isFrozen(validated)).toBe(true);
  });
});
