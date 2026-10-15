import {
  AsyncStorageModelCatalogCache,
  type AsyncStorageLike,
} from '../../../../../core/engine/operateRuntime/model/ModelCatalogCache';
import type {ProviderModelCatalogResult} from '../../../../../core/engine/operateRuntime/model/ModelProviderContracts';

const readyResult: ProviderModelCatalogResult = {
  status: 'ready',
  models: [
    {
      id: 'gpt-4o',
      displayName: 'GPT-4o',
      inputModalities: ['text'],
      outputModalities: ['text'],
      capabilities: {chat: true, vision: 'unknown', toolCalls: 'unknown', reasoning: 'unknown'},
      contextWindow: null,
      maxOutputTokens: null,
      metadataSource: 'remote',
    },
  ],
  source: 'remote',
  stale: false,
  manualModelIdAllowed: true,
};

const makeStorage = () => {
  let store: Record<string, string> = {};
  const storage: AsyncStorageLike = {
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
  };
  return storage;
};

describe('AsyncStorageModelCatalogCache', () => {
  it('serves a fresh ready entry, then marks it stale, then expires it', async () => {
    let clock = 1_000;
    const cache = new AsyncStorageModelCatalogCache(makeStorage(), () => clock);
    await cache.write('profile-a:1:registry-v1:catalog-v1', readyResult);

    const fresh = await cache.read('profile-a:1:registry-v1:catalog-v1');
    expect(fresh).toMatchObject({status: 'ready', source: 'cache', stale: false});

    clock += 16 * 60 * 1000;
    const stale = await cache.read('profile-a:1:registry-v1:catalog-v1');
    expect(stale).toMatchObject({status: 'ready', stale: true});

    clock += 25 * 60 * 60 * 1000;
    expect(await cache.read('profile-a:1:registry-v1:catalog-v1')).toBeNull();
  });

  it('does not durably cache auth_failed results', async () => {
    const cache = new AsyncStorageModelCatalogCache(makeStorage(), () => 1);
    await cache.write('k', {
      status: 'auth_failed',
      models: [],
      manualModelIdAllowed: true,
    });
    expect(await cache.read('k')).toBeNull();
  });

  it('expires empty entries after 60 seconds', async () => {
    let clock = 0;
    const cache = new AsyncStorageModelCatalogCache(makeStorage(), () => clock);
    await cache.write('k', {status: 'empty', models: [], manualModelIdAllowed: true});
    expect(await cache.read('k')).toMatchObject({status: 'empty'});
    clock += 61_000;
    expect(await cache.read('k')).toBeNull();
  });

  it('deletes every cache key for a profile', async () => {
    const cache = new AsyncStorageModelCatalogCache(makeStorage(), () => 1);
    await cache.write('profile-a:1:registry-v1:catalog-v1', readyResult);
    await cache.write('profile-a:2:registry-v1:catalog-v1', readyResult);
    await cache.deleteProfile('profile-a');
    expect(await cache.read('profile-a:1:registry-v1:catalog-v1')).toBeNull();
    expect(await cache.read('profile-a:2:registry-v1:catalog-v1')).toBeNull();
  });
});
