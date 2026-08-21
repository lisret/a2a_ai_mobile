// OpenClaw Gateway WS binding shape (capability-domain Task 9). Sanitized: the
// upstream binding record forwarded to `VisualAgentUpstreamPort.open` carries
// only `{gatewayUrl, deviceId, cluster, secretRef}` — no schema/tool metadata.
import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';

export interface OpenClawBindingV1 {
  readonly schemaVersion: 1;
  readonly toolId: 'openclaw';
  readonly protocol: 'gateway_ws';
  readonly gatewayUrl: string;
  readonly deviceId: string;
  readonly cluster: string;
  readonly secretRef: string | null;
}

function fail(): never {
  throw new CapabilityError('visual_agent_invalid_profile');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isWssUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    return new URL(value).protocol === 'wss:';
  } catch {
    return false;
  }
}

export function parseOpenClawBindingV1(value: unknown): OpenClawBindingV1 {
  if (!isObject(value)) {
    fail();
  }
  if (
    value.schemaVersion !== 1 ||
    value.toolId !== 'openclaw' ||
    value.protocol !== 'gateway_ws'
  ) {
    fail();
  }
  if (!isWssUrl(value.gatewayUrl)) {
    fail();
  }
  if (!isNonEmptyString(value.deviceId) || !isNonEmptyString(value.cluster)) {
    fail();
  }
  if (!(value.secretRef === null || isNonEmptyString(value.secretRef))) {
    fail();
  }
  return {
    schemaVersion: 1,
    toolId: 'openclaw',
    protocol: 'gateway_ws',
    gatewayUrl: value.gatewayUrl,
    deviceId: value.deviceId as string,
    cluster: value.cluster as string,
    secretRef: (value.secretRef as string | null) ?? null,
  };
}

export function toOpenClawUpstreamBinding(
  binding: OpenClawBindingV1,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    gatewayUrl: binding.gatewayUrl,
    deviceId: binding.deviceId,
    cluster: binding.cluster,
    secretRef: binding.secretRef,
  });
}
