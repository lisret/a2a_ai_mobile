import type {LanMcpService, LanMcpStatus} from '../../../src/features/capability/services/lanMcp/LanMcpContracts';
import {validateConnectionCode} from '../../../src/features/capability/services/lanMcp/LanMcpContracts';

// Only the configured flag is retained in memory; never persist a preview secret.
let codeConfigured = false;
let running = false;
const status = (): LanMcpStatus => ({
  running, codeConfigured, supported: true, preview: true,
  endpoint: running ? 'http://192.0.2.10:8765/mcp' : null,
  message: '浏览器仅演示操作流程，请在 Android 手机上启动真实服务。',
});

export const lanMcpService: LanMcpService = {
  async getStatus() { return status(); },
  async startService() {
    if (!codeConfigured) throw new Error('请先设置服务连接码。');
    running = true;
    return status();
  },
  async stopService() { running = false; return status(); },
  async setConnectionCode(code) {
    if (running) throw new Error('请先关闭服务，再更换连接码。');
    const error = validateConnectionCode(code);
    if (error) throw new Error(error);
    codeConfigured = true;
    return status();
  },
  async exportConnectionFile(contents, filename) {
    const blob = new Blob([contents], {type: 'text/markdown;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return 'saved';
  },
};
