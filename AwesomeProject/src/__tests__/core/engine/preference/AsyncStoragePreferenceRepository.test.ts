import {
  AsyncStoragePreferenceRepository,
  PREFERENCE_STORAGE_KEYS,
} from '@features/preference/data/AsyncStoragePreferenceRepository';
import type {AsyncStorageLike} from '@features/preference/data/AsyncStoragePreferenceRepository';
import type {Clock, IdGenerator} from '@core/engine/capabilities/shared/CapabilityPorts';

const makeStorage = (seed: Record<string, string> = {}) => {
  const store: Record<string, string> = {...seed};
  return {
    store,
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
  } satisfies AsyncStorageLike & {store: Record<string, string>};
};

const makeClock = (): Clock => {
  let t = 1000;
  return {now: () => (t += 1)};
};

const makeIds = (): IdGenerator => {
  let n = 0;
  return {next: () => `id-${(n += 1)}`};
};

describe('AsyncStoragePreferenceRepository', () => {
  it('serializes writes and migrates only legacy name/preference records', async () => {
    const storage = makeStorage();
    const clock = makeClock();
    const ids = makeIds();
    const repository = new AsyncStoragePreferenceRepository(storage, clock, ids);

    await Promise.all([
      repository.upsertConfirmed({kind: 'preference', title: '咖啡', summary: '少糖'}),
      repository.upsertConfirmed({kind: 'preference', title: '奶茶', summary: '热饮'}),
    ]);

    await expect(repository.list()).resolves.toHaveLength(2);
    expect(storage.setItem).not.toHaveBeenCalledWith(
      PREFERENCE_STORAGE_KEYS.LEGACY_MEMORIES,
      expect.anything(),
    );
    expect(storage.setItem).toHaveBeenCalledWith(
      PREFERENCE_STORAGE_KEYS.PREFERENCES_V1,
      expect.any(String),
    );
  });

  it('migrates legacy name/preference records and drops errands and legacy key', async () => {
    const storage = makeStorage({
      [PREFERENCE_STORAGE_KEYS.LEGACY_MEMORIES]: JSON.stringify([
        {id: 'm1', kind: 'name', title: '你叫它 NoNo', body: '称呼'},
        {id: 'm2', kind: 'preference', title: '咖啡', body: '少糖'},
        {id: 'm3', kind: 'errand', title: '买菜', when: '明天'},
      ]),
    });
    const repository = new AsyncStoragePreferenceRepository(
      storage,
      makeClock(),
      makeIds(),
    );

    const items = await repository.list();
    expect(items.map(item => item.kind).sort()).toEqual(['name', 'preference']);
    expect(items.find(item => item.kind === 'preference')?.summary).toBe('少糖');
    expect(storage.setItem).not.toHaveBeenCalledWith(
      PREFERENCE_STORAGE_KEYS.LEGACY_MEMORIES,
      expect.anything(),
    );
  });

  it('throws repository_corrupt on malformed stored envelope', async () => {
    const storage = makeStorage({
      [PREFERENCE_STORAGE_KEYS.PREFERENCES_V1]: '{not json',
    });
    const repository = new AsyncStoragePreferenceRepository(
      storage,
      makeClock(),
      makeIds(),
    );
    await expect(repository.list()).rejects.toThrow('repository_corrupt');
  });

  it('deletes by id and forgets all', async () => {
    const storage = makeStorage();
    const repository = new AsyncStoragePreferenceRepository(
      storage,
      makeClock(),
      makeIds(),
    );
    const first = await repository.upsertConfirmed({
      kind: 'preference',
      title: '咖啡',
      summary: '少糖',
    });
    await repository.upsertConfirmed({kind: 'name', title: 'NoNo', summary: '称呼'});
    await repository.delete(first.id);
    await expect(repository.list()).resolves.toHaveLength(1);
    await repository.forgetAll();
    await expect(repository.list()).resolves.toHaveLength(0);
  });
});
