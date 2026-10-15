export interface LanMcpStatus {
  running: boolean;
  endpoint: string | null;
  codeConfigured: boolean;
  message?: string;
  supported: boolean;
  preview: boolean;
}

export interface LanMcpService {
  getStatus(): Promise<LanMcpStatus>;
  startService(): Promise<LanMcpStatus>;
  stopService(): Promise<LanMcpStatus>;
  setConnectionCode(code: string): Promise<LanMcpStatus>;
  exportConnectionFile(
    contents: string,
    filename: string,
  ): Promise<'saved' | 'cancelled'>;
}

export function validateConnectionCode(code: string): string | null {
  return /^[A-Za-z0-9_-]{12,128}$/.test(code)
    ? null
    : '请输入 12–128 位字母、数字、短横线或下划线。';
}
