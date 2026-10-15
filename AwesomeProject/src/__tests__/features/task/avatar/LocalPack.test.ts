import {NativeModules} from 'react-native';
import {localPack} from '../../../../features/task/avatar/LocalPack';

describe('localPack JS wrapper', () => {
  beforeEach(() => {
    NativeModules.LocalPackModule = {
      installFromUrl: jest.fn(),
      writeText: jest.fn(),
      listFiles: jest.fn(),
    };
  });

  it('rejects empty sha256 before calling native', async () => {
    await expect(
      localPack.installFromUrl('avatars', 'box', 'https://example', 1, '', 'model.glb'),
    ).rejects.toThrow('invalid_sha256');
    expect(NativeModules.LocalPackModule.installFromUrl).not.toHaveBeenCalled();
  });

  it('rejects uppercase / non-hex sha256 before calling native', async () => {
    const upper = 'A'.repeat(64);
    await expect(
      localPack.installFromUrl('avatars', 'box', 'https://example', 1, upper, 'model.glb'),
    ).rejects.toThrow('invalid_sha256');
    await expect(
      localPack.installFromUrl('avatars', 'box', 'https://example', 1, 'zz', 'model.glb'),
    ).rejects.toThrow('invalid_sha256');
    expect(NativeModules.LocalPackModule.installFromUrl).not.toHaveBeenCalled();
  });

  it('rejects plaintext http url before calling native', async () => {
    const sha = 'a'.repeat(64);
    await expect(
      localPack.installFromUrl('avatars', 'box', 'http://example', 1, sha, 'model.glb'),
    ).rejects.toThrow('invalid_url');
    expect(NativeModules.LocalPackModule.installFromUrl).not.toHaveBeenCalled();
  });

  it('forwards valid installFromUrl args to native', async () => {
    const sha = 'a'.repeat(64);
    (NativeModules.LocalPackModule.installFromUrl as jest.Mock).mockResolvedValue('/data/model.glb');
    const result = await localPack.installFromUrl(
      'avatars',
      'box',
      'https://example/model.glb',
      1,
      sha,
      'model.glb',
    );
    expect(result).toBe('/data/model.glb');
    expect(NativeModules.LocalPackModule.installFromUrl).toHaveBeenCalledWith(
      'avatars',
      'box',
      'https://example/model.glb',
      1,
      sha,
      'model.glb',
    );
  });

  it('throws when native module is unavailable', async () => {
    delete (NativeModules as {LocalPackModule?: unknown}).LocalPackModule;
    await expect(localPack.getFreeBytes()).rejects.toThrow('localpack_unavailable');
  });
});
