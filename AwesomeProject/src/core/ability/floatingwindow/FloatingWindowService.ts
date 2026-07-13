import { NativeModules, Platform } from 'react-native';

const { FloatingWindowModule } = NativeModules;

/**
 * 悬浮窗服务接口
 * 支持 Android（SYSTEM_ALERT_WINDOW）和 iOS（UIWindow overlay）
 */
class FloatingWindowService {
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    if (!FloatingWindowModule) {
      throw new Error('悬浮窗模块未找到，请确保已正确注册Native Module');
    }
    this.isInitialized = true;
    console.info(`[悬浮窗服务] 初始化成功 (${Platform.OS})`);
  }

  async canDrawOverlays(): Promise<boolean> {
    if (Platform.OS === 'ios') return true;
    if (!FloatingWindowModule) return false;
    try { return await FloatingWindowModule.canDrawOverlays(); }
    catch (error) { console.error('检查悬浮窗权限失败:', error); return false; }
  }

  async openOverlayPermissionSettings(): Promise<void> {
    if (Platform.OS === 'ios') return;
    if (!FloatingWindowModule) throw new Error('当前平台不支持此操作');
    try { await FloatingWindowModule.openOverlayPermissionSettings(); }
    catch (error) { console.error('打开悬浮窗权限设置失败:', error); throw error; }
  }

  async showFloatingWindow(text: string): Promise<void> {
    if (!FloatingWindowModule) throw new Error('当前平台不支持悬浮窗');
    try { await FloatingWindowModule.showFloatingWindow(text); }
    catch (error) { console.error('显示悬浮窗失败:', error); throw error; }
  }

  async updateFloatingWindowText(text: string): Promise<void> {
    if (!FloatingWindowModule) throw new Error('当前平台不支持悬浮窗');
    try { await FloatingWindowModule.updateFloatingWindowText(text); }
    catch (error) { console.error('更新悬浮窗文本失败:', error); throw error; }
  }

  async hideFloatingWindow(): Promise<void> {
    if (!FloatingWindowModule) return;
    try { await FloatingWindowModule.hideFloatingWindow(); }
    catch (error) { console.error('隐藏悬浮窗失败:', error); throw error; }
  }
}

export const floatingWindowService = new FloatingWindowService();
