const mockNative = {
  isAvailable: jest.fn(),
  put: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
};

jest.mock('react-native', () => ({
  NativeModules: {
    SecureCredentialModule: mockNative,
  },
}));

import { NativeModules } from 'react-native';
import { NativeCredentialStore } from '../../../../../core/engine/agentRuntime/credentials/NativeCredentialStore';

describe('NativeCredentialStore', () => {
  let store: NativeCredentialStore;

  beforeEach(() => {
    jest.resetAllMocks();
    (NativeModules as { SecureCredentialModule?: typeof mockNative }).SecureCredentialModule =
      mockNative;
    store = new NativeCredentialStore();
  });

  it('stores only by opaque secretRef and returns no plaintext in errors', async () => {
    mockNative.put.mockRejectedValue(new Error('E_KEYSTORE_UNAVAILABLE'));

    let rejection: unknown;
    try {
      await store.put('model:abc', 'secret-value');
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toBe('E_KEYSTORE_UNAVAILABLE');
    const serializedRejection = JSON.stringify(rejection, Object.getOwnPropertyNames(rejection));
    expect(serializedRejection).not.toContain('secret-value');
    expect(serializedRejection).not.toContain('model:abc');
    expect(mockNative.put).toHaveBeenCalledWith('model:abc', 'secret-value');
  });

  it('forwards availability, reads, and deletes with valid opaque references', async () => {
    mockNative.isAvailable.mockResolvedValue(true);
    mockNative.get.mockResolvedValue('stored-secret');
    mockNative.delete.mockResolvedValue(undefined);

    await expect(store.isAvailable()).resolves.toBe(true);
    await expect(store.get('model:abc')).resolves.toBe('stored-secret');
    await expect(store.delete('model:abc')).resolves.toBeUndefined();

    expect(mockNative.isAvailable).toHaveBeenCalledWith();
    expect(mockNative.get).toHaveBeenCalledWith('model:abc');
    expect(mockNative.delete).toHaveBeenCalledWith('model:abc');
  });

  it('rejects invalid references and blank plaintext before invoking native code', async () => {
    await expect(store.put('invalid ref', 'secret-value')).rejects.toThrow(
      'E_INVALID_SECRET_REF',
    );
    await expect(store.put('model:abc', '   ')).rejects.toThrow(
      'E_EMPTY_PLAINTEXT',
    );
    await expect(store.get('x')).rejects.toThrow('E_INVALID_SECRET_REF');
    await expect(store.delete('x')).rejects.toThrow('E_INVALID_SECRET_REF');

    expect(mockNative.put).not.toHaveBeenCalled();
    expect(mockNative.get).not.toHaveBeenCalled();
    expect(mockNative.delete).not.toHaveBeenCalled();
  });
});
