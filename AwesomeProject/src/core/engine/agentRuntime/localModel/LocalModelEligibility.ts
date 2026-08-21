export const MIN_LOCAL_MODEL_API_LEVEL = 26;
export const MIN_LOCAL_MODEL_RAM_BYTES = 6 * 1024 ** 3;
export const MIN_LOCAL_MODEL_STORAGE_BYTES = 3 * 1024 ** 3;

export type LocalModelEligibilityState =
  | 'unsupported'
  | 'needs_download'
  | 'needs_test'
  | 'testing'
  | 'ready'
  | 'failed';

export interface DeviceFacts {
  apiLevel: number;
  abi: string;
  totalRamBytes: number;
  freeStorageBytes: number;
}

export interface LocalModelEligibility {
  state: LocalModelEligibilityState;
  checkedAtEpochMs?: number;
  fingerprint?: string;
  reason?: string;
}

const eligibilityStates: ReadonlySet<string> = new Set([
  'unsupported',
  'needs_download',
  'needs_test',
  'testing',
  'ready',
  'failed',
]);

export function evaluateStaticEligibility(
  facts: DeviceFacts,
): LocalModelEligibility {
  if (
    facts.apiLevel < MIN_LOCAL_MODEL_API_LEVEL ||
    facts.abi !== 'arm64-v8a' ||
    facts.totalRamBytes < MIN_LOCAL_MODEL_RAM_BYTES ||
    facts.freeStorageBytes < MIN_LOCAL_MODEL_STORAGE_BYTES
  ) {
    return {state: 'unsupported'};
  }

  return {state: 'needs_download'};
}

export function parseNativeEligibility(value: unknown): LocalModelEligibility {
  if (value === null || typeof value !== 'object') {
    throw new TypeError('Local model eligibility must be an object');
  }

  const dto = value as Record<string, unknown>;
  const checkedAtEpochMs = dto.checkedAtEpochMs;
  if (typeof dto.state !== 'string' || !eligibilityStates.has(dto.state)) {
    throw new TypeError('Unknown local model eligibility state');
  }
  if (
    checkedAtEpochMs !== undefined &&
    (typeof checkedAtEpochMs !== 'number' ||
      !Number.isFinite(checkedAtEpochMs) ||
      !Number.isInteger(checkedAtEpochMs) ||
      checkedAtEpochMs < 0)
  ) {
    throw new TypeError(
      'checkedAtEpochMs must be a finite non-negative integer',
    );
  }
  if (
    dto.fingerprint !== undefined &&
    dto.fingerprint !== null &&
    typeof dto.fingerprint !== 'string'
  ) {
    throw new TypeError('fingerprint must be a string');
  }
  if (
    dto.reason !== undefined &&
    dto.reason !== null &&
    typeof dto.reason !== 'string'
  ) {
    throw new TypeError('reason must be a string');
  }

  return {
    state: dto.state as LocalModelEligibilityState,
    ...(checkedAtEpochMs === undefined ? {} : {checkedAtEpochMs}),
    ...(dto.fingerprint == null
      ? {}
      : {fingerprint: dto.fingerprint as string}),
    ...(dto.reason == null ? {} : {reason: dto.reason as string}),
  };
}
