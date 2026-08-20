import type {
  ActionDecision,
  Observation,
} from '../../../../../core/engine/agentRuntime/domain/AgentTypes';
import {validateActionDecision} from '../../../../../core/engine/agentRuntime/policy/ActionDecisionValidator';
import {
  toPixel,
  toTaskAction,
} from '../../../../../core/engine/agentRuntime/adapters/TaskActionAdapter';

const viewport = {width: 1080, height: 2400};

const observation: Observation = {
  schemaVersion: 1,
  stateSummary: 'form',
  visibleText: [],
  elements: [
    {
      id: 'field',
      role: 'textbox',
      bbox: [100, 200, 200, 100],
      enabled: true,
      confidence: 0.99,
    },
  ],
  uncertainties: [],
};

const decision = (
  action: ActionDecision['action'],
  patch: Partial<ActionDecision> = {},
): ActionDecision =>
  ({
    schemaVersion: 1,
    subtaskId: 'step',
    action,
    expectedState: `${action} done`,
    risk: 'low',
    ...patch,
  } as ActionDecision);

const adapt = (input: ActionDecision) =>
  toTaskAction(
    validateActionDecision(input, observation),
    observation,
    viewport,
  );

describe('toTaskAction', () => {
  it('converts normalized coordinate boundaries with the approved formula', () => {
    expect(toPixel(0, 1080)).toBe(0);
    expect(toPixel(333, 1080)).toBe(360);
    expect(toPixel(1000, 1080)).toBe(1080);
  });

  it('maps a targetId tap to the target bbox center in screen pixels', () => {
    expect(adapt(decision('tap', {targetId: 'field'}))).toEqual({
      type: 'click',
      x: 216,
      y: 600,
      requiresConfirmation: false,
    });
  });

  it('uses explicit coordinates only when no stable target is available', () => {
    expect(
      adapt(
        decision('tap', {
          targetId: undefined,
          coordinates: [250, 750],
        }),
      ),
    ).toEqual({
      type: 'click',
      x: 270,
      y: 1800,
      requiresConfirmation: false,
    });
  });

  it('maps input text and resolves its target center', () => {
    expect(
      adapt(decision('input', {targetId: 'field', text: 'hello'})),
    ).toEqual({
      type: 'input',
      x: 216,
      y: 600,
      text: 'hello',
      requiresConfirmation: false,
    });
  });

  it('maps swipe target center to start and coordinates to end pixels', () => {
    expect(
      adapt(
        decision('swipe', {
          targetId: 'field',
          coordinates: [900, 100],
        }),
      ),
    ).toEqual({
      type: 'swipe',
      startX: 216,
      startY: 600,
      endX: 972,
      endY: 240,
      requiresConfirmation: false,
    });
  });

  it.each([
    ['back', {type: 'back', requiresConfirmation: false}],
    ['wait', {type: 'wait', duration: 1000, requiresConfirmation: false}],
    [
      'finish',
      {
        type: 'complete',
        message: 'finish done',
        requiresConfirmation: false,
      },
    ],
    [
      'ask_user',
      {
        type: 'take_over',
        takeOverMessage: 'ask_user done',
        requiresConfirmation: false,
      },
    ],
  ] as const)('maps %s to the legacy action', (action, expected) => {
    expect(adapt(decision(action))).toEqual(expected);
  });

  it('carries confirmation requirements into the legacy action', () => {
    expect(
      adapt(
        decision('tap', {
          targetId: 'field',
          expectedState: 'payment submitted',
        }),
      ),
    ).toEqual({
      type: 'click',
      x: 216,
      y: 600,
      requiresConfirmation: true,
      confirmationMessage: 'Confirm before payment submitted',
    });
  });
});
