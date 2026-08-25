import {NativeModules} from 'react-native';

export type PackKind = 'avatars' | 'asr';
export type NetworkKind = 'wifi' | 'cellular' | 'none' | 'unknown';

export interface LocalPackNative {
  getFreeBytes(): Promise<number>;
  getNetworkType(): Promise<NetworkKind>;
  listFiles(kind: PackKind, id: string): Promise<string[]>;
  getFileUri(kind: PackKind, id: string, fileName: string): Promise<string>;
  writeText(kind: PackKind, id: string, fileName: string, body: string): Promise<void>;
  deletePack(kind: PackKind, id: string): Promise<void>;
  installFromUrl(
    kind: PackKind,
    id: string,
    url: string,
    bytes: number,
    sha256: string,
    fileName: string,
  ): Promise<string>;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[a-z0-9._-]+$/;
const FILE_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

function requireNative(): LocalPackNative {
  const native = NativeModules.LocalPackModule as LocalPackNative | undefined;
  if (native === undefined || native === null) {
    throw new Error('localpack_unavailable');
  }
  return native;
}

function assertKind(kind: PackKind): void {
  if (kind !== 'avatars' && kind !== 'asr') {
    throw new Error('invalid_kind');
  }
}

function assertId(id: string): void {
  if (!ID_PATTERN.test(id)) {
    throw new Error('invalid_id');
  }
}

function assertFileName(fileName: string): void {
  if (!FILE_NAME_PATTERN.test(fileName) || fileName === '.' || fileName === '..') {
    throw new Error('invalid_file_name');
  }
}

export const localPack: LocalPackNative = {
  async getFreeBytes(): Promise<number> {
    return requireNative().getFreeBytes();
  },

  async getNetworkType(): Promise<NetworkKind> {
    return requireNative().getNetworkType();
  },

  async listFiles(kind: PackKind, id: string): Promise<string[]> {
    assertKind(kind);
    assertId(id);
    return requireNative().listFiles(kind, id);
  },

  async getFileUri(kind: PackKind, id: string, fileName: string): Promise<string> {
    assertKind(kind);
    assertId(id);
    assertFileName(fileName);
    return requireNative().getFileUri(kind, id, fileName);
  },

  async writeText(kind: PackKind, id: string, fileName: string, body: string): Promise<void> {
    assertKind(kind);
    assertId(id);
    assertFileName(fileName);
    return requireNative().writeText(kind, id, fileName, body);
  },

  async deletePack(kind: PackKind, id: string): Promise<void> {
    assertKind(kind);
    assertId(id);
    return requireNative().deletePack(kind, id);
  },

  async installFromUrl(
    kind: PackKind,
    id: string,
    url: string,
    bytes: number,
    sha256: string,
    fileName: string,
  ): Promise<string> {
    assertKind(kind);
    assertId(id);
    assertFileName(fileName);
    if (!SHA256_PATTERN.test(sha256)) {
      throw new Error('invalid_sha256');
    }
    if (!url.startsWith('https://')) {
      throw new Error('invalid_url');
    }
    if (!Number.isInteger(bytes) || bytes <= 0) {
      throw new Error('invalid_bytes');
    }
    return requireNative().installFromUrl(kind, id, url, bytes, sha256, fileName);
  },
};
