import {AsyncStorageCredentialRetirementRepository} from '../../../../../core/engine/operateRuntime/config/CredentialRetirementRepository';
import {RUNTIME_STORAGE_KEYS} from '../../../../../core/engine/operateRuntime/config/RuntimeConfigStorageKeys';

const makeStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
    peek: () => store,
  };
};

describe('AsyncStorageCredentialRetirementRepository', () => {
  it('stages a replacement record then commits it', async () => {
    const storage = makeStorage();
    const repo = new AsyncStorageCredentialRetirementRepository(storage, () => 42);
    await repo.stage({
      retirementId: 'r-1',
      oldSecretRef: 'model:old',
      replacementSecretRef: 'model:new',
      createdAtMs: 0,
    });
    let records = await repo.list();
    expect(records).toEqual([
      {
        schemaVersion: 1,
        retirementId: 'r-1',
        state: 'staged',
        oldSecretRef: 'model:old',
        replacementSecretRef: 'model:new',
        createdAtMs: 42,
      },
    ]);
    await repo.commit('r-1');
    records = await repo.list();
    expect(records[0].state).toBe('committed');
    expect(storage.peek()[RUNTIME_STORAGE_KEYS.CREDENTIAL_RETIREMENTS_V1]).toContain(
      'committed',
    );
  });

  it('rejects a (null,null) retirement as runtime_config_invalid', async () => {
    const repo = new AsyncStorageCredentialRetirementRepository(makeStorage(), () => 1);
    await expect(
      repo.stage({
        retirementId: 'r-x',
        oldSecretRef: null,
        replacementSecretRef: null,
        createdAtMs: 0,
      }),
    ).rejects.toMatchObject({code: 'runtime_config_invalid'});
  });

  it('rolls back a staged record and keeps the ledger usable after a failed write', async () => {
    const storage = makeStorage();
    const repo = new AsyncStorageCredentialRetirementRepository(storage, () => 1);
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    await expect(
      repo.stage({
        retirementId: 'r-2',
        oldSecretRef: 'model:old',
        replacementSecretRef: null,
        createdAtMs: 0,
      }),
    ).rejects.toThrow('disk full');
    await repo.stage({
      retirementId: 'r-3',
      oldSecretRef: 'model:old',
      replacementSecretRef: null,
      createdAtMs: 0,
    });
    await repo.rollback('r-3');
    expect(await repo.list()).toEqual([]);
  });
});
