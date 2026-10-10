export const PERMISSIONS = {ANDROID: {RECORD_AUDIO: 'preview-microphone'}};
export const RESULTS = {GRANTED: 'granted'};
export const request = async () => RESULTS.GRANTED;
export const maybeRequestOperatePermissionsOnLaunch = async () => {};
export const subscribeOperatePermissionStatus = () => () => {};
export const requestOperatePermissions = async () => true;
export const requestAdbFallbackPermission = async () => true;
export const ensureBuiltinAsr = async () => {};
export const maybeSilentUpgradeAsr = async () => {};
export async function startUtterance(callback: (event: any) => void) {
  const text = (window as any).__nonoPreviewUtterance || '你好，NoNo';
  callback({type: 'partial', text, engine: 'builtin'});
  await new Promise(resolve => setTimeout(resolve, 350));
  await callback({type: 'final', text, engine: 'builtin'});
}
export const stopUtterance = async () => {};
export const localPack = {
  async listFiles() {
    return [];
  },
  async getNetworkType() {
    return 'wifi';
  },
  async installFromUrl() {
    throw new Error('浏览器预览不下载角色模型，请在 App 中验证下载。');
  },
  async deletePack() {},
  async writeText() {},
  async getFileUri() {
    return null;
  },
  addProgressListener() {
    return () => {};
  },
  subscribeProgress() {
    return () => {};
  },
};
export const modelService = {
  async getModelById(id: string) {
    return {
      id,
      name: '演示操作模型',
      provider: 'preview',
      apiKey: '',
      apiUrl: '',
      modelName: 'preview-model',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  },
  async getModels() {
    return [];
  },
};
export const accessibilityService = {
  async isEnabled() {
    return true;
  },
  async showToast() {},
  async openSettings() {},
  async startTaskExecutionService() {},
  async stopTaskExecutionService() {},
  async acquireWakeLock() {},
  async releaseWakeLock() {},
  async startBackgroundTask() {},
};
export const appMappingService = {
  async getAppMapping() {
    return {};
  },
};
export const floatingWindowService = {
  async hideFloatingWindow() {},
  async showFloatingWindow() {},
  async canDrawOverlays() {
    return true;
  },
};
export const adbService = {
  async isEnabled() {
    return false;
  },
};
