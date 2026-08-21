// DeepSeek Harness (`dsh`) binding schema and its conservative validator.
// `dsh` is a frozen product id bound *only* to `product: 'deepseek-harness'`.
// Dify (or any other product) is never aliased onto `dsh`. Bindings are disabled
// by default and never infer capabilities from unstructured CLI text: an explicit
// `declaredCapabilities` set is the only source of truth, defaulting to all-false.
import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import type {VisualAgentCapabilitySet} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

export type DshBindingV1 = {
  readonly schemaVersion: 1;
  readonly toolId: 'dsh';
  readonly product: 'deepseek-harness';
  readonly protocol: 'dsh_cli' | 'custom_bridge';
  readonly version: string;
  readonly endpointOrExecutable: string;
  readonly cwd: string | null;
  readonly args: readonly string[];
  readonly secretRef: string | null;
  readonly enabled: boolean;
  readonly declaredCapabilities: VisualAgentCapabilitySet;
};

const CAPABILITY_KEYS = [
  'imageInput',
  'structuredAction',
  'stream',
  'cancel',
  'approval',
  'resume',
  'steer',
  'preferences',
] as const;

const ALL_FALSE_CAPABILITIES: VisualAgentCapabilitySet = {
  imageInput: false,
  structuredAction: false,
  stream: false,
  cancel: false,
  approval: false,
  resume: false,
  steer: false,
  preferences: false,
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function normalizeDeclaredCapabilities(value: unknown): VisualAgentCapabilitySet {
  const out = {...ALL_FALSE_CAPABILITIES};
  if (isObject(value)) {
    for (const key of CAPABILITY_KEYS) {
      if (value[key] === true) {
        out[key] = true;
      }
    }
  }
  return out;
}

/**
 * Normalizes an untrusted binding record into a `DshBindingV1`. Rejects any
 * product other than DeepSeek Harness and any protocol outside the DSH set. The
 * result defaults `enabled` to false and never widens capabilities beyond what
 * the binding explicitly declares.
 */
export function validateDshBinding(input: unknown): DshBindingV1 {
  if (!isObject(input)) {
    throw new CapabilityError('visual_agent_invalid_profile');
  }
  if (input.product !== 'deepseek-harness') {
    throw new CapabilityError('visual_agent_invalid_profile');
  }
  const protocol = input.protocol;
  if (protocol !== 'dsh_cli' && protocol !== 'custom_bridge') {
    throw new CapabilityError('visual_agent_invalid_profile');
  }
  return {
    schemaVersion: 1,
    toolId: 'dsh',
    product: 'deepseek-harness',
    protocol,
    version: typeof input.version === 'string' ? input.version : '',
    endpointOrExecutable:
      typeof input.endpointOrExecutable === 'string' ? input.endpointOrExecutable : '',
    cwd: typeof input.cwd === 'string' ? input.cwd : null,
    args: Array.isArray(input.args)
      ? input.args.filter((arg): arg is string => typeof arg === 'string')
      : [],
    secretRef: typeof input.secretRef === 'string' ? input.secretRef : null,
    enabled: input.enabled === true,
    declaredCapabilities: normalizeDeclaredCapabilities(input.declaredCapabilities),
  };
}
