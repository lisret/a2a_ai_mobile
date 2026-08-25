import AsyncStorage from '@react-native-async-storage/async-storage';
import {localPack} from './LocalPack';
import {parseAvatarManifest, AvatarManifestV1} from './parseAvatarManifest';
import {AVATAR_PINS} from './AvatarArtifactPins';
import {STORAGE_KEYS} from '../../../shared/constants/storage.config';

export const BUILTIN_AVATAR_ID = 'builtin';

export interface AvatarLookItem {
  id: string;
  title: string;
  installed: boolean;
}

function buildManifest(pin: (typeof AVATAR_PINS)[number]): AvatarManifestV1 {
  return {
    schemaVersion: 1,
    id: pin.id,
    version: pin.version,
    title: pin.title,
    files: {model: {name: 'model.glb', bytes: pin.bytes, sha256: pin.sha256}},
    clips: {},
  };
}

export function listAvatarLooks(): AvatarLookItem[] {
  return [
    {id: BUILTIN_AVATAR_ID, title: '默认角色', installed: true},
    ...AVATAR_PINS.map(pin => ({id: pin.id, title: pin.title, installed: false})),
  ];
}

export async function getActiveAvatarId(): Promise<string> {
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.AVATAR_ACTIVE);
  return stored || BUILTIN_AVATAR_ID;
}

export async function setActiveAvatarId(id: string): Promise<void> {
  if (id !== BUILTIN_AVATAR_ID) {
    const files = await localPack.listFiles('avatars', id);
    if (!files.includes('manifest.json') || !files.includes('model.glb')) {
      throw new Error('not_installed');
    }
  }
  await AsyncStorage.setItem(STORAGE_KEYS.AVATAR_ACTIVE, id);
}

export async function installPinnedAvatar(id: string): Promise<void> {
  const pin = AVATAR_PINS.find(item => item.id === id);
  if (!pin) {
    throw new Error('unknown_pin');
  }
  try {
    await localPack.installFromUrl(
      'avatars',
      pin.id,
      pin.url,
      pin.bytes,
      pin.sha256,
      'model.glb',
    );
    const manifest = buildManifest(pin);
    await localPack.writeText(
      'avatars',
      pin.id,
      'manifest.json',
      JSON.stringify(manifest),
    );
    const dirFiles = await localPack.listFiles('avatars', pin.id);
    parseAvatarManifest(manifest, dirFiles);
  } catch (error) {
    await localPack.deletePack('avatars', pin.id);
    throw error;
  }
}

export async function rollbackAvatarToBuiltin(): Promise<void> {
  const id = await getActiveAvatarId();
  if (id !== BUILTIN_AVATAR_ID) {
    await localPack.deletePack('avatars', id);
  }
  await AsyncStorage.setItem(STORAGE_KEYS.AVATAR_ACTIVE, BUILTIN_AVATAR_ID);
}

export async function resolveAvatarGltfUri(): Promise<string | null> {
  const id = await getActiveAvatarId();
  if (id === BUILTIN_AVATAR_ID) {
    return null;
  }
  const pin = AVATAR_PINS.find(item => item.id === id);
  if (!pin) {
    await rollbackAvatarToBuiltin();
    return null;
  }
  try {
    const dirFiles = await localPack.listFiles('avatars', id);
    parseAvatarManifest(buildManifest(pin), dirFiles);
  } catch (error) {
    await rollbackAvatarToBuiltin();
    return null;
  }
  return localPack.getFileUri('avatars', id, 'model.glb');
}
