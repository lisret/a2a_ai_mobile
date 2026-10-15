import AsyncStorage from '@react-native-async-storage/async-storage';
import {localPack} from '../../../../features/task/avatar/LocalPack';
import {
  BUILTIN_AVATAR_ID,
  getActiveAvatarId,
  setActiveAvatarId,
  installPinnedAvatar,
  resolveAvatarGltfUri,
} from '../../../../features/task/avatar/AvatarPackStore';

jest.mock('../../../../features/task/avatar/LocalPack', () => ({
  localPack: {
    listFiles: jest.fn(),
    getFileUri: jest.fn(),
    writeText: jest.fn(),
    deletePack: jest.fn(),
    installFromUrl: jest.fn(),
  },
}));

const mockedLocalPack = localPack as jest.Mocked<typeof localPack>;
const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('AvatarPackStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAsyncStorage.getItem.mockResolvedValue(null);
  });

  it('defaults active avatar id to builtin', async () => {
    await expect(getActiveAvatarId()).resolves.toBe(BUILTIN_AVATAR_ID);
  });

  it('installs a pinned avatar via installFromUrl then writes the manifest', async () => {
    mockedLocalPack.installFromUrl.mockResolvedValue('/data/model.glb');
    mockedLocalPack.writeText.mockResolvedValue(undefined);
    mockedLocalPack.listFiles.mockResolvedValue(['manifest.json', 'model.glb']);

    await installPinnedAvatar('box');

    expect(mockedLocalPack.installFromUrl).toHaveBeenCalledWith(
      'avatars',
      'box',
      'https://github.com/KhronosGroup/glTF-Sample-Models/raw/main/2.0/Box/glTF-Binary/Box.glb',
      1664,
      'ed52f7192b8311d700ac0ce80644e3852cd01537e4d62241b9acba023da3d54e',
      'model.glb',
    );
    expect(mockedLocalPack.writeText).toHaveBeenCalledWith(
      'avatars',
      'box',
      'manifest.json',
      expect.any(String),
    );
    expect(mockedLocalPack.deletePack).not.toHaveBeenCalled();
  });

  it('returns null and rolls back to builtin when the pack directory has an unexpected file', async () => {
    mockedAsyncStorage.getItem.mockResolvedValue('box');
    mockedLocalPack.listFiles.mockResolvedValue([
      'manifest.json',
      'model.glb',
      'hack.js',
    ]);

    const uri = await resolveAvatarGltfUri();

    expect(uri).toBeNull();
    expect(mockedLocalPack.deletePack).toHaveBeenCalledWith('avatars', 'box');
    expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
      '@nono:avatar_active',
      BUILTIN_AVATAR_ID,
    );
  });

  it('throws unknown_pin for an unrecognised pin id', async () => {
    await expect(installPinnedAvatar('nope')).rejects.toThrow('unknown_pin');
    expect(mockedLocalPack.installFromUrl).not.toHaveBeenCalled();
  });

  it('throws not_installed when activating an avatar without files on disk', async () => {
    mockedLocalPack.listFiles.mockResolvedValue([]);
    await expect(setActiveAvatarId('box')).rejects.toThrow('not_installed');
    expect(mockedAsyncStorage.setItem).not.toHaveBeenCalled();
  });
});
