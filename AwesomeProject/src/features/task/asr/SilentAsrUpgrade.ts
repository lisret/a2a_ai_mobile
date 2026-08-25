/**
 * SilentAsrUpgrade — 仅在 Wi-Fi 空闲时静默把 SenseVoice 升级包下到本地。
 *
 * 绝不打断用户：整段包在 try/catch 里，任何失败只 `console.info` 一个原因码
 * （wifi_only / no_space / bad_hash），不弹 Alert、不发通知。校验失败时把升级
 * 目录清掉并保持 ready=false，下次仍然回退 builtin。
 */
import {localPack} from '../avatar/LocalPack';
import {ASR_PINS} from './AsrArtifactPins';
import {
  isUpgradeReady,
  markUpgradeReady,
  upgradeDiskBudgetBytes,
} from './AsrModelStore';

export async function maybeSilentUpgradeAsr(): Promise<void> {
  try {
    if (await isUpgradeReady()) {
      return;
    }

    const network = await localPack.getNetworkType();
    if (network !== 'wifi') {
      console.info('[asr-upgrade] skip: wifi_only');
      return;
    }

    const freeBytes = await localPack.getFreeBytes();
    if (freeBytes < upgradeDiskBudgetBytes()) {
      console.info('[asr-upgrade] skip: no_space');
      return;
    }

    const pin = ASR_PINS.upgrade;
    try {
      await localPack.installArchiveFromUrl(
        'asr',
        'upgrade',
        pin.archiveUrl,
        pin.archiveBytes,
        pin.archiveSha256,
        JSON.stringify(pin.files),
      );
      await markUpgradeReady(true);
    } catch {
      console.info('[asr-upgrade] failed: bad_hash');
      await markUpgradeReady(false);
      await localPack.deletePack('asr', 'upgrade');
    }
  } catch {
    // Never surface upgrade failures to the UI.
  }
}
