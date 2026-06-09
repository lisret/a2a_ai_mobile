import { NativeModules, Platform } from 'react-native';

const { FloatingWindowModule } = NativeModules;

/**
 * 悬浮窗服务接口
 * 使用React Native Native Modules与Android原生代码通信
 */
class FloatingWindowService {
  private isInitialized: boolean = false;

  /**
   * 初始化悬浮窗服务
   */
  async initialize(): Promise<void> {
    if (Platform.OS !== 'android') {
      throw new Error('悬浮窗服务仅支持Android平台');
    }

    if (!FloatingWindowModule) {
      throw new Error('悬浮窗模块未找到，请确保已正确注册Native Module');
    }

    this.isInitialized = true;
    console.info('[悬浮窗服务] 初始化成功');
  }

  /**
   * 检查是否有悬浮窗权限
   */
  async canDrawOverlays(): Promise<boolean> {
    if (Platform.OS !== 'android' || !FloatingWindowModule) {
      return false;
    }

    try {
      return await FloatingWindowModule.canDrawOverlays();
    } catch (error) {
      console.error('检查悬浮窗权限失败:', error);
      return false;
    }
  }

  /**
   * 打开悬浮窗权限设置页面
   */
  async openOverlayPermissionSettings(): Promise<void> {
    if (Platform.OS !== 'android' || !FloatingWindowModule) {
      throw new Error('悬浮窗权限仅支持Android平台');
    }

    try {
      await FloatingWindowModule.openOverlayPermissionSettings();
    } catch (error) {
      console.error('打开悬浮窗权限设置失败:', error);
      throw error;
    }
  }

  /**
   * 显示悬浮窗
   */
  async showFloatingWindow(text: string): Promise<void> {
    if (Platform.OS !== 'android' || !FloatingWindowModule) {
      throw new Error('悬浮窗仅支持Android平台');
    }

    try {
      await FloatingWindowModule.showFloatingWindow(text);
    } catch (error) {
      console.error('显示悬浮窗失败:', error);
      throw error;
    }
  }

  /**
   * 更新悬浮窗文本
   */
  async updateFloatingWindowText(text: string): Promise<void> {
    if (Platform.OS !== 'android' || !FloatingWindowModule) {
      throw new Error('悬浮窗仅支持Android平台');
    }

    try {
      await FloatingWindowModule.updateFloatingWindowText(text);
    } catch (error) {
      console.error('更新悬浮窗文本失败:', error);
      throw error;
    }
  }

  /**
   * 隐藏悬浮窗
   */
  async hideFloatingWindow(): Promise<void> {
    if (Platform.OS !== 'android' || !FloatingWindowModule) {
      throw new Error('悬浮窗仅支持Android平台');
    }

    try {
      await FloatingWindowModule.hideFloatingWindow();
    } catch (error) {
      console.error('隐藏悬浮窗失败:', error);
      throw error;
    }
  }
}

// 导出单例
export const floatingWindowService = new FloatingWindowService();

