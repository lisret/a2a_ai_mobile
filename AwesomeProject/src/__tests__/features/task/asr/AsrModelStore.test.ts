import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../../../../features/task/avatar/LocalPack', () => ({
  localPack: {
    listFiles: jest.fn(),
    deletePack: jest.fn(),
    getFileUri: jest.fn(),
    installFromAssets: jest.fn(),
  },
}));

import {localPack} from '../../../../features/task/avatar/LocalPack';
import {ASR_PINS} from '../../../../features/task/asr/AsrArtifactPins';
import {
  resolveAsrPackId,
  isUpgradeReady,
  upgradeDiskBudgetBytes,
} from '../../../../features/task/asr/AsrModelStore';

const getItem = AsyncStorage.getItem as jest.Mock;
const removeItem = AsyncStorage.removeItem as jest.Mock;

describe('AsrModelStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getItem.mockResolvedValue(null);
  });

  it('defaults to builtin when no upgrade flag', async () => {
    await expect(isUpgradeReady()).resolves.toBe(false);
    await expect(resolveAsrPackId()).resolves.toBe('builtin');
    expect(localPack.deletePack).not.toHaveBeenCalled();
  });

  it('falls back to builtin and drops a corrupt upgrade dir', async () => {
    getItem.mockResolvedValue('true');
    // Upgrade flag set but the installed files fail the pins list.
    (localPack.listFiles as jest.Mock).mockResolvedValue(['stale.onnx']);

    await expect(resolveAsrPackId()).resolves.toBe('builtin');

    expect(localPack.deletePack).toHaveBeenCalledWith('asr', 'upgrade');
    expect(removeItem).toHaveBeenCalledWith('@nono:asr_upgrade_ready');
  });

  it('returns upgrade when every pinned file is present', async () => {
    getItem.mockResolvedValue('true');
    (localPack.listFiles as jest.Mock).mockResolvedValue(
      ASR_PINS.upgrade.files.map(f => f.name),
    );

    await expect(resolveAsrPackId()).resolves.toBe('upgrade');
    expect(localPack.deletePack).not.toHaveBeenCalled();
  });

  it('budgets more than the upgrade archive size', () => {
    expect(upgradeDiskBudgetBytes()).toBeGreaterThan(
      ASR_PINS.upgrade.archiveBytes,
    );
  });
});
