import {NativeModules, Platform} from 'react-native';
import type {LanMcpService, LanMcpStatus} from './LanMcpContracts';
import {validateConnectionCode} from './LanMcpContracts';

type NativeStatus = Omit<LanMcpStatus, 'supported' | 'preview'>;
interface NativeLanMcp {
  getStatus(): Promise<NativeStatus>;
  startService(): Promise<NativeStatus>;
  stopService(): Promise<NativeStatus>;
  setConnectionCode(code: string): Promise<NativeStatus>;
  exportConnectionFile(
    contents: string,
    filename: string,
  ): Promise<'saved' | 'cancelled'>;
}

const native = (): NativeLanMcp | undefined =>
  Platform.OS === 'android' ? NativeModules.LanMcpModule : undefined;
const requireNative = (): NativeLanMcp => {
  const module = native();
  if (!module)
    throw new Error('此功能需要包含局域网 MCP 服务的 Android 安装包。');
  return module;
};
const toStatus = (value: NativeStatus): LanMcpStatus => ({
  ...value,
  supported: true,
  preview: false,
});

export const lanMcpService: LanMcpService = {
  async getStatus() {
    const module = native();
    return module
      ? toStatus(await module.getStatus())
      : {
          running: false,
          endpoint: null,
          codeConfigured: false,
          supported: false,
          preview: false,
          message:
            Platform.OS === 'ios'
              ? '当前仅支持 Android 手机。'
              : '请安装包含局域网 MCP 服务的新版 Android App。',
        };
  },
  async startService() {
    return toStatus(await requireNative().startService());
  },
  async stopService() {
    return toStatus(await requireNative().stopService());
  },
  async setConnectionCode(code) {
    const error = validateConnectionCode(code);
    if (error) throw new Error(error);
    return toStatus(await requireNative().setConnectionCode(code));
  },
  async exportConnectionFile(contents, filename) {
    return requireNative().exportConnectionFile(contents, filename);
  },
};
