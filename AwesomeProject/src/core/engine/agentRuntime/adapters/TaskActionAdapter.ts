import type {TaskAction} from '@core/engine/taskEngine/types/Task';
import type {Observation, ObservationElement} from '../domain/AgentTypes';
import type {ValidatedActionDecision} from '../policy/ActionDecisionValidator';

export interface ViewportDimensions {
  width: number;
  height: number;
}

export const toPixel = (value: number, size: number): number =>
  Math.round((value / 1000) * size);

const targetCenter = (
  target: ObservationElement,
): readonly [number, number] => {
  const [x, y, width, height] = target.bbox;
  return [x + width / 2, y + height / 2];
};

const resolveCoordinates = (
  decision: ValidatedActionDecision,
  observation: Observation | undefined,
): readonly [number, number] => {
  if (decision.targetId !== undefined) {
    const target = observation?.elements.find(
      element => element.id === decision.targetId,
    );
    if (target !== undefined) {
      return targetCenter(target);
    }
  }
  if (decision.coordinates !== undefined) {
    return decision.coordinates;
  }
  throw new Error('validated_action_coordinates_missing');
};

const confirmationFields = (
  decision: ValidatedActionDecision,
): Pick<TaskAction, 'requiresConfirmation' | 'confirmationMessage'> => ({
  requiresConfirmation: decision.requiresConfirmation,
  ...(decision.requiresConfirmation
    ? {confirmationMessage: `Confirm before ${decision.expectedState}`}
    : {}),
});

const assertViewport = (viewport: ViewportDimensions): void => {
  if (
    !Number.isFinite(viewport.width) ||
    viewport.width <= 0 ||
    !Number.isFinite(viewport.height) ||
    viewport.height <= 0
  ) {
    throw new Error('invalid_viewport_dimensions');
  }
};

const pixels = (
  coordinates: readonly [number, number],
  viewport: ViewportDimensions,
): readonly [number, number] => [
  toPixel(coordinates[0], viewport.width),
  toPixel(coordinates[1], viewport.height),
];

/** Adapts one already validated decision to the existing task executor schema. */
export const toTaskAction = (
  decision: ValidatedActionDecision,
  observation: Observation | undefined,
  viewport: ViewportDimensions,
): TaskAction => {
  assertViewport(viewport);
  const confirmation = confirmationFields(decision);

  switch (decision.action) {
    case 'tap': {
      const [x, y] = pixels(
        resolveCoordinates(decision, observation),
        viewport,
      );
      return {type: 'click', x, y, ...confirmation};
    }
    case 'input': {
      const [x, y] = pixels(
        resolveCoordinates(decision, observation),
        viewport,
      );
      return {type: 'input', x, y, text: decision.text, ...confirmation};
    }
    case 'swipe': {
      const [startX, startY] = pixels(
        resolveCoordinates({...decision, coordinates: undefined}, observation),
        viewport,
      );
      if (decision.coordinates === undefined) {
        throw new Error('validated_swipe_end_coordinates_missing');
      }
      const [endX, endY] = pixels(decision.coordinates, viewport);
      return {
        type: 'swipe',
        startX,
        startY,
        endX,
        endY,
        ...confirmation,
      };
    }
    case 'back':
      return {type: 'back', ...confirmation};
    case 'wait':
      return {type: 'wait', duration: 1000, ...confirmation};
    case 'finish':
      return {
        type: 'complete',
        message: decision.expectedState,
        ...confirmation,
      };
    case 'ask_user':
      return {
        type: 'take_over',
        takeOverMessage: decision.expectedState,
        ...confirmation,
      };
  }
};
