import {ConnectorBridgeLegacyOpenClawBindingClient} from '../../../../../core/engine/operateRuntime/config/ConnectorBridgeLegacyOpenClawBindingClient';
import {LEGACY_OPENCLAW_BRIDGE_LOCAL_REF} from '../../../../../core/engine/operateRuntime/config/LegacyOpenClawBindingPort';
import type {CredentialStore} from '../../../../../core/engine/operateRuntime/contracts/CredentialStore';

const UPSTREAM = 'UPSTREAM-SENTINEL-TOKEN';
const BRIDGE_AUTH = 'BRIDGE-AUTH-SENTINEL';
const GATEWAY = 'wss://gateway.legacy.example/ws';

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {get: () => null},
  text: async () => JSON.stringify(body),
});

const makeCredentials = (): CredentialStore => {
  const store = new Map<string, string>([
    ['upstream:legacy', UPSTREAM],
    ['bridge:auth', BRIDGE_AUTH],
  ]);
  return {
    isAvailable: jest.fn().mockResolvedValue(true),
    put: jest.fn(async (ref: string, value: string) => {
      store.set(ref, value);
    }),
    get: jest.fn(async (ref: string) => store.get(ref) ?? null),
    delete: jest.fn(async (ref: string) => {
      store.delete(ref);
    }),
  };
};

const makeClient = (fetchImpl: jest.Mock, credentials = makeCredentials()) =>
  new ConnectorBridgeLegacyOpenClawBindingClient({
    bridgeUrl: 'https://bridge.example',
    bridgeAuthSecretRef: 'bridge:auth',
    timeoutMs: 10_000,
    fetch: fetchImpl as unknown as typeof fetch,
    credentials,
  });

const stageInput = {
  bindingId: 'legacy-openclaw-gateway' as const,
  toolId: 'openclaw' as const,
  protocol: 'gateway_ws' as const,
  gatewayUrl: GATEWAY,
  deviceId: 'device-123',
  cluster: 'cluster-a',
  upstreamSecretRef: 'upstream:legacy',
};

describe('ConnectorBridgeLegacyOpenClawBindingClient', () => {
  it('stages the upstream credential once and stores the returned bridge secret locally', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, {stageId: 's-1', bridgeCredential: 'BRIDGE-CRED'}));
    const credentials = makeCredentials();
    const client = makeClient(fetchImpl, credentials);
    const result = await client.stage(stageInput);

    expect(result).toEqual({
      stageId: 's-1',
      bridgeSecretRef: LEGACY_OPENCLAW_BRIDGE_LOCAL_REF,
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://bridge.example/v1/visual-agent/bindings/stages');
    expect(init.headers.Authorization).toBe(`Bearer ${BRIDGE_AUTH}`);
    expect(JSON.parse(init.body).upstreamCredential).toBe(UPSTREAM);
    expect(credentials.put).toHaveBeenCalledWith(
      LEGACY_OPENCLAW_BRIDGE_LOCAL_REF,
      'BRIDGE-CRED',
    );
  });

  it('maps read states and requires the local bridge secret for a committed binding', async () => {
    const credentials = makeCredentials();
    (credentials.get as jest.Mock).mockImplementation(async (ref: string) =>
      ref === LEGACY_OPENCLAW_BRIDGE_LOCAL_REF ? 'BRIDGE-CRED' : ref === 'bridge:auth' ? BRIDGE_AUTH : null,
    );
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, {status: 'committed', stageId: 's-1'}));
    const client = makeClient(fetchImpl, credentials);
    const result = await client.read('legacy-openclaw-gateway');
    expect(result).toMatchObject({status: 'committed', stageId: 's-1'});
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://bridge.example/v1/visual-agent/bindings/legacy-openclaw-gateway',
    );
  });

  it('rejects a committed binding whose local bridge secret is missing', async () => {
    const credentials = makeCredentials();
    (credentials.get as jest.Mock).mockImplementation(async (ref: string) =>
      ref === 'bridge:auth' ? BRIDGE_AUTH : null,
    );
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, {status: 'staged', stageId: 's-1'}));
    await expect(
      makeClient(fetchImpl, credentials).read('legacy-openclaw-gateway'),
    ).rejects.toThrow('legacy_openclaw_bridge_missing_secret');
  });

  it('deletes the local bridge secret only after the server acknowledges rollback', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    const credentials = makeCredentials();
    const client = makeClient(fetchImpl, credentials);
    await client.rollback('s-1');
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://bridge.example/v1/visual-agent/bindings/stages/s-1/rollback',
    );
    const fetchOrder = fetchImpl.mock.invocationCallOrder[0];
    const deleteOrder = (credentials.delete as jest.Mock).mock.invocationCallOrder[0];
    expect(deleteOrder).toBeGreaterThan(fetchOrder);
  });

  it('rejects a cross-origin redirect and never leaks a secret in the error', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(302, {}));
    let thrown: Error | null = null;
    try {
      await makeClient(fetchImpl).stage(stageInput);
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown?.message).toBe('legacy_openclaw_bridge_redirect');
    expect(thrown?.message).not.toContain(UPSTREAM);
    expect(thrown?.message).not.toContain(BRIDGE_AUTH);
  });

  it('aborts on timeout with a sanitized error', async () => {
    const fetchImpl = jest.fn(
      (_url: string, init: {signal: AbortSignal}) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    jest.useFakeTimers();
    const promise = makeClient(fetchImpl as unknown as jest.Mock).stage(stageInput);
    promise.catch(() => undefined);
    await jest.advanceTimersByTimeAsync(10_000);
    await expect(promise).rejects.toThrow('legacy_openclaw_bridge_timeout');
    jest.useRealTimers();
  });

  it('rejects a non-HTTPS/WSS bridge origin', () => {
    expect(
      () =>
        new ConnectorBridgeLegacyOpenClawBindingClient({
          bridgeUrl: 'http://insecure.example',
          bridgeAuthSecretRef: 'bridge:auth',
          timeoutMs: 10_000,
          fetch: jest.fn() as unknown as typeof fetch,
          credentials: makeCredentials(),
        }),
    ).toThrow('legacy_openclaw_bridge_invalid_url');
  });
});
