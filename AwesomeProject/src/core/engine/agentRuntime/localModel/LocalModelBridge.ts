import {NativeModules} from 'react-native';

import {
  parseNativeEligibility,
  type LocalModelEligibility,
} from './LocalModelEligibility';

interface LocalModelEligibilityNativeModule {
  getEligibility(modelId: string): Promise<unknown>;
  startDownload(
    modelId: string,
    urls: LocalModelDownloadUrls,
  ): Promise<unknown>;
  cancelDownload(modelId: string): Promise<unknown>;
  verifyAndSelfTest(modelId: string): Promise<unknown>;
  invalidateAfterRuntimeFailure(errorCode: string): Promise<unknown>;
}

export interface LocalModelDownloadUrls {
  modelUrl: string;
  mmprojUrl: string;
}

export interface LocalModelDownloadStatus {
  state:
    | 'idle'
    | 'downloading'
    | 'verifying'
    | 'complete'
    | 'failed'
    | 'cancelled';
  downloadedBytes: number;
  totalBytes: number;
  reason?: string;
}

const nativeModule = NativeModules.LocalModelEligibility as
  | LocalModelEligibilityNativeModule
  | undefined;

function requireNativeModule(): LocalModelEligibilityNativeModule {
  if (!nativeModule) {
    throw new Error('LocalModelEligibility native module is not available');
  }
  return nativeModule;
}

export async function getLocalModelEligibility(
  modelId: string,
): Promise<LocalModelEligibility> {
  return parseNativeEligibility(
    await requireNativeModule().getEligibility(modelId),
  );
}

export async function startLocalModelDownload(
  modelId: string,
  urls: LocalModelDownloadUrls,
): Promise<LocalModelDownloadStatus> {
  return parseDownloadStatus(
    await requireNativeModule().startDownload(modelId, urls),
  );
}

export async function cancelLocalModelDownload(
  modelId: string,
): Promise<LocalModelDownloadStatus> {
  return parseDownloadStatus(
    await requireNativeModule().cancelDownload(modelId),
  );
}

export async function verifyAndSelfTestLocalModel(
  modelId: string,
): Promise<LocalModelEligibility> {
  return parseNativeEligibility(
    await requireNativeModule().verifyAndSelfTest(modelId),
  );
}

export async function invalidateLocalModelAfterRuntimeFailure(
  errorCode: string,
): Promise<LocalModelEligibility> {
  return parseNativeEligibility(
    await requireNativeModule().invalidateAfterRuntimeFailure(errorCode),
  );
}

function parseDownloadStatus(value: unknown): LocalModelDownloadStatus {
  if (value === null || typeof value !== 'object') {
    throw new TypeError('Local model download status must be an object');
  }
  const dto = value as Record<string, unknown>;
  const downloadedBytes = dto.downloadedBytes;
  const totalBytes = dto.totalBytes;
  const validStates: ReadonlySet<string> = new Set([
    'idle',
    'downloading',
    'verifying',
    'complete',
    'failed',
    'cancelled',
  ]);
  if (typeof dto.state !== 'string' || !validStates.has(dto.state)) {
    throw new TypeError('Unknown local model download state');
  }
  if (
    typeof downloadedBytes !== 'number' ||
    !Number.isFinite(downloadedBytes) ||
    !Number.isInteger(downloadedBytes) ||
    downloadedBytes < 0
  ) {
    throw new TypeError(
      'downloadedBytes must be a finite non-negative integer',
    );
  }
  if (
    typeof totalBytes !== 'number' ||
    !Number.isFinite(totalBytes) ||
    !Number.isInteger(totalBytes) ||
    totalBytes < 0
  ) {
    throw new TypeError('totalBytes must be a finite non-negative integer');
  }
  if (
    dto.reason !== undefined &&
    dto.reason !== null &&
    typeof dto.reason !== 'string'
  ) {
    throw new TypeError('reason must be a string');
  }
  return {
    state: dto.state as LocalModelDownloadStatus['state'],
    downloadedBytes,
    totalBytes,
    ...(dto.reason == null ? {} : {reason: dto.reason as string}),
  };
}
