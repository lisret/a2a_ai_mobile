import {ProviderModelCatalogService} from '../../../../../core/engine/operateRuntime/model/ProviderModelCatalogService';
import {BUILT_IN_REGISTRATIONS} from '../../../../../core/engine/operateRuntime/model/ModelProviderRegistry';
import type {CredentialStore} from '../../../../../core/engine/operateRuntime/contracts/CredentialStore';
import type {
  ModelCatalogCache,
  ModelEndpointProfileV1,
  ProviderModelCatalogResult,
} from '../../../../../core/engine/operateRuntime/model/ModelProviderContracts';
import type {ProviderFetch} from '../../../../../core/engine/operateRuntime/model/transports/providerHttp';

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {get: () => null},
  text: async () => JSON.stringify(body),
});

const credentials = (secret: string | null): CredentialStore => ({
  isAvailable: jest.fn().mockResolvedValue(true),
  put: jest.fn(),
  get: jest.fn().mockResolvedValue(secret),
  delete: jest.fn(),
});

const memoryCache = (): ModelCatalogCache => {
  const store = new Map<string, ProviderModelCatalogResult>();
  return {
    read: jest.fn(async (key: string) => store.get(key) ?? null),
    write: jest.fn(async (key: string, value: ProviderModelCatalogResult) => {
      store.set(key, value);
    }),
    deleteProfile: jest.fn(async () => undefined),
  };
};

const openaiProfile: ModelEndpointProfileV1 = {
  id: 'profile-openai',
  label: 'OpenAI',
  mode: 'preset',
  preset: 'openai',
  baseURLOverride: null,
  region: null,
  channel: null,
  secretRef: 'model:openai',
  generation: 1,
};

const zhipuProfile: ModelEndpointProfileV1 = {
  ...openaiProfile,
  id: 'profile-zhipu',
  preset: 'zhipu_glm',
  secretRef: 'model:zhipu',
};

const anthropicProfile: ModelEndpointProfileV1 = {
  ...openaiProfile,
  id: 'profile-anthropic',
  preset: 'anthropic',
  secretRef: 'model:ant',
};

const makeService = (fetchImpl: ProviderFetch, cache = memoryCache()) =>
  new ProviderModelCatalogService({
    registrations: BUILT_IN_REGISTRATIONS,
    credentials: credentials('secret'),
    fetchImpl,
    cache,
    now: () => 1_000,
  });

const request = (profile: ModelEndpointProfileV1, generation = profile.generation) => ({
  profile,
  signal: new AbortController().signal,
  timeoutMs: 30_000,
  requestGeneration: generation,
});

describe('ProviderModelCatalogService', () => {
  it('returns ready models from a successful remote enumeration', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, {data: [{id: 'gpt-4o'}, {id: 'gpt-4o-mini'}]})) as unknown as ProviderFetch;
    const result = await makeService(fetchImpl).listModels(request(openaiProfile));
    expect(result.status).toBe('ready');
    expect(result.models.map(m => m.id)).toEqual(['gpt-4o', 'gpt-4o-mini']);
    if (result.status === 'ready') {
      expect(result.source).toBe('remote');
    }
    expect(result.models[0].capabilities.vision).toBe(true);
  });

  it('maps a 401 to auth_failed and does not cache it', async () => {
    const cache = memoryCache();
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(401, {})) as unknown as ProviderFetch;
    const result = await makeService(fetchImpl, cache).listModels(
      request(openaiProfile),
    );
    expect(result.status).toBe('auth_failed');
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('maps a 2xx with zero models to empty', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, {data: []})) as unknown as ProviderFetch;
    const result = await makeService(fetchImpl).listModels(request(openaiProfile));
    expect(result.status).toBe('empty');
  });

  it('maps a 5xx to network_failed', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(500, {})) as unknown as ProviderFetch;
    const result = await makeService(fetchImpl).listModels(request(openaiProfile));
    expect(result.status).toBe('network_failed');
  });

  it('returns unsupported with signed candidates for a signed-static preset', async () => {
    const fetchImpl = jest.fn() as unknown as ProviderFetch;
    const result = await makeService(fetchImpl).listModels(request(zhipuProfile));
    expect(result.status).toBe('unsupported');
    expect(result.models.length).toBeGreaterThan(0);
    if (result.status === 'unsupported') {
      expect(result.source).toBe('signed_static');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('follows Anthropic cursor pagination to completion with a loop guard', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {data: [{id: 'claude-3-5-sonnet-latest'}], has_more: true, last_id: 'a'}),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {data: [{id: 'claude-3-haiku'}], has_more: false, last_id: null}),
      ) as unknown as ProviderFetch;
    const result = await makeService(fetchImpl).listModels(request(anthropicProfile));
    expect(result.models.map(m => m.id)).toEqual([
      'claude-3-5-sonnet-latest',
      'claude-3-haiku',
    ]);
    expect((fetchImpl as unknown as jest.Mock).mock.calls[1][0]).toContain('after_id=a');
  });

  it('serves a stale cached ready entry after a network failure', async () => {
    const cache = memoryCache();
    await cache.write('profile-openai:1:registry-v1:catalog-v1', {
      status: 'ready',
      models: [
        {
          id: 'cached-model',
          displayName: 'cached',
          inputModalities: ['text'],
          outputModalities: ['text'],
          capabilities: {chat: true, vision: 'unknown', toolCalls: 'unknown', reasoning: 'unknown'},
          contextWindow: null,
          maxOutputTokens: null,
          metadataSource: 'remote',
        },
      ],
      source: 'cache',
      stale: true,
      manualModelIdAllowed: true,
    });
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(503, {})) as unknown as ProviderFetch;
    const result = await makeService(fetchImpl, cache).listModels(
      request(openaiProfile),
    );
    expect(result.status).toBe('ready');
    expect(result.models[0].id).toBe('cached-model');
  });

  it('ignores a late response from an older profile generation', async () => {
    const cache = memoryCache();
    const service = makeService(
      jest.fn().mockResolvedValue(jsonResponse(200, {data: [{id: 'new'}]})) as unknown as ProviderFetch,
      cache,
    );
    const current = await service.listModels(
      request({...openaiProfile, generation: 5}, 5),
    );
    await service.listModels(request({...openaiProfile, generation: 4}, 4));
    expect(await cache.read('profile-openai:5:registry-v1:catalog-v1')).toEqual(
      current,
    );
    expect(await cache.read('profile-openai:4:registry-v1:catalog-v1')).toBeNull();
  });

  it('describes a manual model as unverified metadata', () => {
    const service = makeService(jest.fn() as unknown as ProviderFetch);
    const descriptor = service.describeManualModel(openaiProfile, 'my-model');
    expect(descriptor).toMatchObject({
      id: 'my-model',
      metadataSource: 'manual',
      capabilities: {chat: 'unknown'},
    });
  });
});
