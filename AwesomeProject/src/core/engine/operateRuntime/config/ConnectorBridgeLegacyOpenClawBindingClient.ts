// Production Connector Bridge implementation of LegacyOpenClawBindingPort.
// Sends the upstream credential exactly once; stores only the returned Bridge
// credential under a deterministic local ref and never logs any secret.
import type {CredentialStore} from '../contracts/CredentialStore';
import {
  LEGACY_OPENCLAW_BRIDGE_LOCAL_REF,
  LegacyOpenClawBindingError,
  type LegacyOpenClawBindingPort,
} from './LegacyOpenClawBindingPort';

const BINDINGS_PATH = '/v1/visual-agent/bindings';
const STAGE_PATH = `${BINDINGS_PATH}/stages`;
const RESPONSE_CAP_BYTES = 64 * 1024;
const TIMEOUT_MS = 10_000;

export interface ConnectorBridgeLegacyBindingClientOptions {
  readonly bridgeUrl: string;
  readonly bridgeAuthSecretRef: string;
  readonly timeoutMs: 10_000;
  readonly fetch: typeof fetch;
  readonly credentials: CredentialStore;
}

interface BridgeResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers?: {get(name: string): string | null};
  text(): Promise<string>;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export class ConnectorBridgeLegacyOpenClawBindingClient
  implements LegacyOpenClawBindingPort
{
  private readonly origin: string;

  constructor(private readonly options: ConnectorBridgeLegacyBindingClientOptions) {
    this.origin = this.assertOrigin(options.bridgeUrl);
  }

  async read(
    bindingId: string,
  ): ReturnType<LegacyOpenClawBindingPort['read']> {
    const json = await this.request(
      'GET',
      `${BINDINGS_PATH}/${encodeURIComponent(bindingId)}`,
      undefined,
    );
    const record = asRecord(json);
    const status = record?.status;
    if (status === 'absent') {
      return {status: 'absent'};
    }
    if (status === 'staged' || status === 'committed') {
      const stageId = typeof record?.stageId === 'string' ? record.stageId : '';
      if (!stageId) {
        throw new LegacyOpenClawBindingError('legacy_openclaw_bridge_failed');
      }
      const local = await this.readLocalBridgeSecret();
      if (local === null) {
        throw new LegacyOpenClawBindingError('legacy_openclaw_bridge_missing_secret');
      }
      return {status, stageId, bridgeSecretRef: LEGACY_OPENCLAW_BRIDGE_LOCAL_REF};
    }
    throw new LegacyOpenClawBindingError('legacy_openclaw_bridge_failed');
  }

  async stage(
    input: Parameters<LegacyOpenClawBindingPort['stage']>[0],
  ): ReturnType<LegacyOpenClawBindingPort['stage']> {
    const upstream = await this.readSecret(input.upstreamSecretRef);
    const json = await this.request('POST', STAGE_PATH, {
      bindingId: input.bindingId,
      toolId: input.toolId,
      protocol: input.protocol,
      gatewayUrl: input.gatewayUrl,
      deviceId: input.deviceId,
      cluster: input.cluster,
      upstreamCredential: upstream,
    });
    const record = asRecord(json);
    const stageId = typeof record?.stageId === 'string' ? record.stageId : '';
    const bridgeCredential =
      typeof record?.bridgeCredential === 'string' ? record.bridgeCredential : '';
    if (!stageId || !bridgeCredential) {
      throw new LegacyOpenClawBindingError('legacy_openclaw_bridge_failed');
    }
    await this.options.credentials.put(
      LEGACY_OPENCLAW_BRIDGE_LOCAL_REF,
      bridgeCredential,
    );
    const readback = await this.options.credentials.get(
      LEGACY_OPENCLAW_BRIDGE_LOCAL_REF,
    );
    if (readback !== bridgeCredential) {
      throw new LegacyOpenClawBindingError('legacy_openclaw_bridge_readback_failed');
    }
    return {stageId, bridgeSecretRef: LEGACY_OPENCLAW_BRIDGE_LOCAL_REF};
  }

  async commit(stageId: string): Promise<void> {
    await this.request(
      'POST',
      `${STAGE_PATH}/${encodeURIComponent(stageId)}/commit`,
      {},
    );
  }

  async rollback(stageId: string): Promise<void> {
    await this.request(
      'POST',
      `${STAGE_PATH}/${encodeURIComponent(stageId)}/rollback`,
      {},
    );
    // Only after the server acknowledges rollback do we drop the local secret.
    await this.options.credentials.delete(LEGACY_OPENCLAW_BRIDGE_LOCAL_REF);
  }

  private async readLocalBridgeSecret(): Promise<string | null> {
    try {
      return await this.options.credentials.get(LEGACY_OPENCLAW_BRIDGE_LOCAL_REF);
    } catch {
      throw new LegacyOpenClawBindingError('legacy_openclaw_bridge_failed');
    }
  }

  private async readSecret(secretRef: string): Promise<string> {
    let secret: string | null;
    try {
      secret = await this.options.credentials.get(secretRef);
    } catch {
      throw new LegacyOpenClawBindingError('legacy_openclaw_bridge_failed');
    }
    if (!secret) {
      throw new LegacyOpenClawBindingError('legacy_openclaw_bridge_missing_secret');
    }
    return secret;
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body: Record<string, unknown> | undefined,
  ): Promise<unknown> {
    const auth = await this.readSecret(this.options.bridgeAuthSecretRef);
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, TIMEOUT_MS);
    let response: BridgeResponse;
    try {
      response = (await this.options.fetch(`${this.origin}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${auth}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        redirect: 'manual',
      } as RequestInit)) as unknown as BridgeResponse;
    } catch {
      throw new LegacyOpenClawBindingError(
        timedOut ? 'legacy_openclaw_bridge_timeout' : 'legacy_openclaw_bridge_failed',
      );
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      throw new LegacyOpenClawBindingError('legacy_openclaw_bridge_redirect');
    }
    if (!response.ok) {
      throw new LegacyOpenClawBindingError('legacy_openclaw_bridge_failed');
    }
    const text = await this.readCapped(response);
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new LegacyOpenClawBindingError('legacy_openclaw_bridge_failed');
    }
  }

  private async readCapped(response: BridgeResponse): Promise<string> {
    const declared = response.headers?.get('content-length');
    if (declared && Number(declared) > RESPONSE_CAP_BYTES) {
      throw new LegacyOpenClawBindingError('legacy_openclaw_bridge_failed');
    }
    const text = await response.text();
    if (text.length > RESPONSE_CAP_BYTES) {
      throw new LegacyOpenClawBindingError('legacy_openclaw_bridge_failed');
    }
    return text;
  }

  private assertOrigin(bridgeUrl: string): string {
    let url: URL;
    try {
      url = new URL(bridgeUrl);
    } catch {
      throw new LegacyOpenClawBindingError('legacy_openclaw_bridge_invalid_url');
    }
    if (url.username || url.password || url.hash) {
      throw new LegacyOpenClawBindingError('legacy_openclaw_bridge_invalid_url');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'wss:') {
      throw new LegacyOpenClawBindingError('legacy_openclaw_bridge_invalid_url');
    }
    // Normalize wss:// to https:// for REST calls to the same origin/host.
    const httpProtocol = url.protocol === 'wss:' ? 'https:' : url.protocol;
    return `${httpProtocol}//${url.host}`;
  }
}
