jest.mock('../../../../features/task/avatar/LocalPack', () => ({
  localPack: {
    getNetworkType: jest.fn(),
    getFreeBytes: jest.fn(),
    installArchiveFromUrl: jest.fn(),
    deletePack: jest.fn(),
  },
}));

jest.mock('../../../../features/task/asr/AsrModelStore', () => ({
  isUpgradeReady: jest.fn(),
  markUpgradeReady: jest.fn(),
  upgradeDiskBudgetBytes: jest.fn(() => 3_000_000_000),
}));

import {localPack} from '../../../../features/task/avatar/LocalPack';
import {
  isUpgradeReady,
  markUpgradeReady,
} from '../../../../features/task/asr/AsrModelStore';
import {maybeSilentUpgradeAsr} from '../../../../features/task/asr/SilentAsrUpgrade';

const getNetworkType = localPack.getNetworkType as jest.Mock;
const getFreeBytes = localPack.getFreeBytes as jest.Mock;
const installArchive = localPack.installArchiveFromUrl as jest.Mock;

describe('maybeSilentUpgradeAsr', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isUpgradeReady as jest.Mock).mockResolvedValue(false);
    getNetworkType.mockResolvedValue('wifi');
    getFreeBytes.mockResolvedValue(9_000_000_000);
    installArchive.mockResolvedValue(undefined);
  });

  it('does nothing on cellular', async () => {
    getNetworkType.mockResolvedValue('cellular');
    await expect(maybeSilentUpgradeAsr()).resolves.toBeUndefined();
    expect(installArchive).not.toHaveBeenCalled();
  });

  it('does nothing on none or unknown', async () => {
    getNetworkType.mockResolvedValue('none');
    await maybeSilentUpgradeAsr();
    getNetworkType.mockResolvedValue('unknown');
    await maybeSilentUpgradeAsr();
    expect(installArchive).not.toHaveBeenCalled();
  });

  it('does nothing if already ready', async () => {
    (isUpgradeReady as jest.Mock).mockResolvedValue(true);
    await maybeSilentUpgradeAsr();
    expect(getNetworkType).not.toHaveBeenCalled();
    expect(installArchive).not.toHaveBeenCalled();
  });

  it('does nothing if free bytes below budget', async () => {
    getFreeBytes.mockResolvedValue(10);
    await maybeSilentUpgradeAsr();
    expect(installArchive).not.toHaveBeenCalled();
  });

  it('on wifi installs archive then marks ready', async () => {
    await maybeSilentUpgradeAsr();
    expect(installArchive).toHaveBeenCalledWith(
      'asr',
      'upgrade',
      expect.stringMatching(/^https:\/\/github\.com\//),
      expect.any(Number),
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.any(String),
    );
    expect(markUpgradeReady).toHaveBeenCalledWith(true);
  });

  it('on hash failure leaves ready false and does not throw', async () => {
    installArchive.mockRejectedValue(new Error('E_HASH_MISMATCH'));
    await expect(maybeSilentUpgradeAsr()).resolves.toBeUndefined();
    expect(markUpgradeReady).not.toHaveBeenCalledWith(true);
    expect(markUpgradeReady).toHaveBeenCalledWith(false);
  });
});
