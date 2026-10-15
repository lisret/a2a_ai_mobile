import type {
  ActionCoordinates,
  ActionDecision,
  Observation,
  ObservationElement,
} from '../domain/AgentTypes';
import {requiresUserConfirmation} from './ActionPolicy';

const ACTIONS = new Set<ActionDecision['action']>([
  'tap',
  'input',
  'swipe',
  'back',
  'wait',
  'finish',
  'ask_user',
]);
const RISKS = new Set<ActionDecision['risk']>(['low', 'medium', 'high']);
const DEFAULT_MINIMUM_TARGET_CONFIDENCE = 0.75;

export type ActionValidationErrorCode =
  | 'invalid_schema'
  | 'missing_expected_state'
  | 'coordinates_out_of_range'
  | 'target_or_coordinates_missing'
  | 'target_observation_missing'
  | 'target_not_found'
  | 'target_disabled'
  | 'target_confidence_low'
  | 'target_schema_invalid'
  | 'input_text_missing'
  | 'swipe_target_missing'
  | 'swipe_end_coordinates_missing'
  | 'repeated_unchanged_action';

export class ActionValidationError extends Error {
  constructor(public readonly code: ActionValidationErrorCode) {
    super(code);
    this.name = 'ActionValidationError';
  }
}

export type ValidatedActionDecision = Readonly<
  ActionDecision & {requiresConfirmation: boolean}
>;

export interface ActionValidationContext {
  previousDecision?: ActionDecision;
  stateChangedSincePreviousAction?: boolean;
  minimumTargetConfidence?: number;
}

const fail = (code: ActionValidationErrorCode): never => {
  throw new ActionValidationError(code);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonBlankString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isNormalizedCoordinate = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1000;

const validateCoordinates = (value: unknown): ActionCoordinates | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !isNormalizedCoordinate(value[0]) ||
    !isNormalizedCoordinate(value[1])
  ) {
    return fail('coordinates_out_of_range');
  }
  return Object.freeze([value[0], value[1]]) as ActionCoordinates;
};

const isValidBoundingBox = (
  value: unknown,
): value is ObservationElement['bbox'] => {
  if (!Array.isArray(value) || value.length !== 4) {
    return false;
  }
  const bbox = value;
  const [x, y, width, height] = bbox;
  return (
    bbox.length === 4 &&
    isNormalizedCoordinate(x) &&
    isNormalizedCoordinate(y) &&
    isNormalizedCoordinate(width) &&
    isNormalizedCoordinate(height) &&
    x + width <= 1000 &&
    y + height <= 1000
  );
};

const isValidTargetSchema = (value: unknown): value is ObservationElement =>
  isRecord(value) &&
  isNonBlankString(value.id) &&
  isNonBlankString(value.role) &&
  (value.text === undefined || typeof value.text === 'string') &&
  typeof value.enabled === 'boolean' &&
  (value.selected === undefined || typeof value.selected === 'boolean') &&
  typeof value.confidence === 'number' &&
  Number.isFinite(value.confidence) &&
  value.confidence >= 0 &&
  value.confidence <= 1 &&
  isValidBoundingBox(value.bbox);

const resolveTarget = (
  targetId: string | undefined,
  observation: Observation | undefined,
  minimumConfidence: number,
): ObservationElement | undefined => {
  if (targetId === undefined) {
    return undefined;
  }
  if (observation === undefined) {
    return fail('target_observation_missing');
  }
  if (!isRecord(observation)) {
    return fail('target_schema_invalid');
  }
  const elements = observation.elements;
  if (!Array.isArray(elements)) {
    return fail('target_schema_invalid');
  }
  const target = elements.find(
    element => isRecord(element) && element.id === targetId,
  );
  if (!target) {
    return fail('target_not_found');
  }
  if (!isValidTargetSchema(target)) {
    return fail('target_schema_invalid');
  }
  if (!target.enabled) {
    return fail('target_disabled');
  }
  if (target.confidence < minimumConfidence) {
    return fail('target_confidence_low');
  }
  return target;
};

const coordinatesEqual = (
  first: ActionDecision['coordinates'],
  second: ActionDecision['coordinates'],
): boolean =>
  first === undefined
    ? second === undefined
    : second !== undefined && first[0] === second[0] && first[1] === second[1];

const isSameExecutableAction = (
  first: ActionDecision,
  second: ActionDecision,
): boolean =>
  first.action === second.action &&
  first.targetId === second.targetId &&
  first.text === second.text &&
  coordinatesEqual(first.coordinates, second.coordinates);

/** Validates untrusted provider output before it reaches the legacy executor. */
export const validateActionDecision = (
  input: unknown,
  observation?: Observation,
  context: ActionValidationContext = {},
): ValidatedActionDecision => {
  if (!isRecord(input)) {
    return fail('invalid_schema');
  }
  if (!isNonBlankString(input.expectedState)) {
    return fail('missing_expected_state');
  }
  if (
    input.schemaVersion !== 1 ||
    !isNonBlankString(input.subtaskId) ||
    typeof input.action !== 'string' ||
    !ACTIONS.has(input.action as ActionDecision['action']) ||
    typeof input.risk !== 'string' ||
    !RISKS.has(input.risk as ActionDecision['risk']) ||
    (input.targetId !== undefined && !isNonBlankString(input.targetId)) ||
    (input.text !== undefined && typeof input.text !== 'string')
  ) {
    return fail('invalid_schema');
  }

  const coordinates = validateCoordinates(input.coordinates);
  const decision = {
    schemaVersion: 1,
    subtaskId: input.subtaskId,
    action: input.action,
    ...(input.targetId === undefined ? {} : {targetId: input.targetId}),
    ...(coordinates === undefined ? {} : {coordinates}),
    ...(input.text === undefined ? {} : {text: input.text}),
    expectedState: input.expectedState,
    risk: input.risk,
  } as ActionDecision;

  if (
    decision.action === 'input' &&
    (typeof decision.text !== 'string' || decision.text.trim().length === 0)
  ) {
    return fail('input_text_missing');
  }
  if (decision.action === 'swipe') {
    if (decision.targetId === undefined) {
      return fail('swipe_target_missing');
    }
    if (decision.coordinates === undefined) {
      return fail('swipe_end_coordinates_missing');
    }
  } else if (
    (decision.action === 'tap' || decision.action === 'input') &&
    decision.targetId === undefined &&
    decision.coordinates === undefined
  ) {
    return fail('target_or_coordinates_missing');
  }

  const target = resolveTarget(
    decision.targetId,
    observation,
    context.minimumTargetConfidence ?? DEFAULT_MINIMUM_TARGET_CONFIDENCE,
  );

  if (
    context.stateChangedSincePreviousAction === false &&
    context.previousDecision !== undefined &&
    isSameExecutableAction(decision, context.previousDecision)
  ) {
    return fail('repeated_unchanged_action');
  }

  return Object.freeze({
    ...decision,
    requiresConfirmation: requiresUserConfirmation(decision, {target}),
  });
};
