import {
  AgentProviderError,
  type PlannerInput,
  type RuntimeHistoryEntry,
} from './AgentContracts';
import type {
  ActionDecision,
  Observation,
  ObservationElement,
} from '../domain/AgentTypes';

const ACTIONS = new Set([
  'tap',
  'input',
  'swipe',
  'back',
  'wait',
  'finish',
  'ask_user',
]);
const RISKS = new Set(['low', 'medium', 'high']);
const DATA_URI = /data:[^,\s]*,/i;

const invalidPayload = (): never => {
  throw new AgentProviderError(
    'invalid_structured_response',
    'Provider returned invalid structured output',
  );
};

const objectValue = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalidPayload();
  }
  return value as Record<string, unknown>;
};

const safeString = (value: unknown): string => {
  if (typeof value !== 'string' || DATA_URI.test(value)) {
    return invalidPayload();
  }
  return value;
};

const nonBlankString = (value: unknown): string => {
  const stringValue = safeString(value);
  if (!stringValue.trim()) {
    return invalidPayload();
  }
  return stringValue;
};

const normalizedNumber = (value: unknown): number => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1000
  ) {
    return invalidPayload();
  }
  return value;
};

const sanitizeElement = (value: unknown): ObservationElement => {
  const element = objectValue(value);
  if (
    !Array.isArray(element.bbox) ||
    element.bbox.length !== 4 ||
    typeof element.enabled !== 'boolean' ||
    typeof element.confidence !== 'number' ||
    !Number.isFinite(element.confidence) ||
    element.confidence < 0 ||
    element.confidence > 1 ||
    (element.selected !== undefined && typeof element.selected !== 'boolean')
  ) {
    return invalidPayload();
  }
  const bbox = [
    normalizedNumber(element.bbox[0]),
    normalizedNumber(element.bbox[1]),
    normalizedNumber(element.bbox[2]),
    normalizedNumber(element.bbox[3]),
  ] as const;
  if (bbox[0] + bbox[2] > 1000 || bbox[1] + bbox[3] > 1000) {
    return invalidPayload();
  }
  return {
    id: nonBlankString(element.id),
    role: nonBlankString(element.role),
    ...(element.text === undefined ? {} : {text: safeString(element.text)}),
    bbox,
    enabled: element.enabled,
    ...(element.selected === undefined
      ? {}
      : {selected: element.selected as boolean}),
    confidence: element.confidence,
  };
};

export const sanitizeObservation = (value: unknown): Observation => {
  const observation = objectValue(value);
  if (
    observation.schemaVersion !== 1 ||
    !Array.isArray(observation.visibleText) ||
    !Array.isArray(observation.elements) ||
    !Array.isArray(observation.uncertainties)
  ) {
    return invalidPayload();
  }
  return {
    schemaVersion: 1,
    ...(observation.app === undefined
      ? {}
      : {app: safeString(observation.app)}),
    ...(observation.page === undefined
      ? {}
      : {page: safeString(observation.page)}),
    stateSummary: safeString(observation.stateSummary),
    visibleText: observation.visibleText.map(safeString),
    elements: observation.elements.map(sanitizeElement),
    uncertainties: observation.uncertainties.map(safeString),
  };
};

const sanitizeCoordinates = (value: unknown): readonly [number, number] => {
  if (!Array.isArray(value) || value.length !== 2) {
    return invalidPayload();
  }
  return [normalizedNumber(value[0]), normalizedNumber(value[1])];
};

const sanitizeDecision = (value: unknown): ActionDecision => {
  const decision = objectValue(value);
  if (
    decision.schemaVersion !== 1 ||
    typeof decision.action !== 'string' ||
    !ACTIONS.has(decision.action) ||
    typeof decision.risk !== 'string' ||
    !RISKS.has(decision.risk)
  ) {
    return invalidPayload();
  }
  return {
    schemaVersion: 1,
    subtaskId: safeString(decision.subtaskId),
    action: decision.action,
    ...(decision.targetId === undefined
      ? {}
      : {targetId: safeString(decision.targetId)}),
    ...(decision.coordinates === undefined
      ? {}
      : {coordinates: sanitizeCoordinates(decision.coordinates)}),
    ...(decision.text === undefined ? {} : {text: safeString(decision.text)}),
    expectedState: safeString(decision.expectedState),
    risk: decision.risk,
  } as ActionDecision;
};

const sanitizeHistoryEntry = (value: unknown): RuntimeHistoryEntry => {
  const entry = objectValue(value);
  if (
    typeof entry.step !== 'number' ||
    !Number.isSafeInteger(entry.step) ||
    entry.step < 0
  ) {
    return invalidPayload();
  }
  return {
    step: entry.step,
    ...(entry.observation === undefined
      ? {}
      : {observation: sanitizeObservation(entry.observation)}),
    ...(entry.decision === undefined
      ? {}
      : {decision: sanitizeDecision(entry.decision)}),
    ...(entry.outcome === undefined
      ? {}
      : {outcome: safeString(entry.outcome)}),
  };
};

export const sanitizePlannerInput = (input: PlannerInput): PlannerInput => ({
  observation: sanitizeObservation(input.observation),
  instruction: safeString(input.instruction),
  history: input.history.map(sanitizeHistoryEntry),
  signal: input.signal,
});
