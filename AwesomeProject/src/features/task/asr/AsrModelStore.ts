/**
 * AsrModelStore — 决定当前该用哪个离线 ASR 包，并保证 builtin 随时可用。
 *
 * builtin（流式 Zipformer 14M）随 APK assets 走，`ensureBuiltinAsr` 每次首页
 * focus 调用；native 若哈希已匹配即 no-op。upgrade（SenseVoice）由 Wi-Fi 静默
 * 升级写入，只有当 `isUpgradeReady()` 且磁盘上文件能通过 pins 校验时才启用；
 * 任一不符就丢弃升级目录并回退 builtin，绝不让半损坏的升级包被选中。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {STORAGE_KEYS} from '../../../shared/constants/storage.config';
import {localPack} from '../avatar/LocalPack';
import {ASR_PINS, AsrPackPin} from './AsrArtifactPins';

export type AsrPackId = 'builtin' | 'upgrade';

const MB = 1024 * 1024;
const BUILTIN_ASSET_DIR = 'nono-asr/builtin';

export function upgradeDiskBudgetBytes(): number {
  return ASR_PINS.upgrade.archiveBytes * 2 + 50 * MB;
}

export async function isUpgradeReady(): Promise<boolean> {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.ASR_UPGRADE_READY);
  return value === 'true';
}

export async function markUpgradeReady(ready: boolean): Promise<void> {
  if (ready) {
    await AsyncStorage.setItem(STORAGE_KEYS.ASR_UPGRADE_READY, 'true');
  } else {
    await AsyncStorage.removeItem(STORAGE_KEYS.ASR_UPGRADE_READY);
  }
}

function hasAllPinnedFiles(present: string[], pin: AsrPackPin): boolean {
  return pin.files.every(file => present.includes(file.name));
}

export async function resolveAsrPackId(): Promise<AsrPackId> {
  if (await isUpgradeReady()) {
    try {
      const present = await localPack.listFiles('asr', 'upgrade');
      if (hasAllPinnedFiles(present, ASR_PINS.upgrade)) {
        return 'upgrade';
      }
    } catch {
      // listFiles failing means the dir is unusable; fall through to cleanup.
    }
    await markUpgradeReady(false);
    await localPack.deletePack('asr', 'upgrade');
  }
  return 'builtin';
}

export async function getAsrDirUri(id: AsrPackId): Promise<string> {
  const tokensUri = await localPack.getFileUri('asr', id, 'tokens.txt');
  return tokensUri.replace(/\/tokens\.txt$/, '');
}

export async function ensureBuiltinAsr(): Promise<void> {
  await localPack.installFromAssets(
    'asr',
    'builtin',
    BUILTIN_ASSET_DIR,
    JSON.stringify(ASR_PINS.builtin.files),
  );
}
