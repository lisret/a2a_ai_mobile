/**
 * 权限管理服务 - 符合ITGSA（金标联盟）标准
 * 
 * 实现功能：
 * 1. 权限状态检查
 * 2. 权限请求（按需请求）
 * 3. 权限状态跟踪
 * 4. 权限拒绝处理
 */

import { Platform, Alert, Linking } from 'react-native';
import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PERMISSION_CONFIG, PermissionGroup, PermissionInfo, getPermissionsByGroup } from '../constants/permission.config';
import { accessibilityService } from '../../core/ability/accessibility/AccessibilityService';
import { STORAGE_KEYS } from '../constants/storage.config';

const { AccessibilityModule } = NativeModules;

/**
 * 权限状态
 */
export enum PermissionStatus {
  /** 已授予 */
  GRANTED = 'granted',
  /** 已拒绝 */
  DENIED = 'denied',
  /** 需要说明后请求 */
  NEEDS_RATIONALE = 'needs_rationale',
  /** 永久拒绝（需要跳转设置） */
  PERMANENTLY_DENIED = 'permanently_denied',
  /** 不支持（当前Android版本不需要） */
  NOT_SUPPORTED = 'not_supported',
}

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  /** 权限名称 */
  permission: string;
  /** 权限状态 */
  status: PermissionStatus;
  /** 权限信息 */
  info?: PermissionInfo;
  /** 是否需要请求 */
  needsRequest: boolean;
}

/**
 * 权限状态存储接口
 */
interface PermissionStatusStorage {
  status: PermissionStatus;
  lastChecked: number; // 时间戳
  lastGranted?: number; // 最后授予时间戳
}

/**
 * 权限管理服务
 */
class PermissionService {
  /** 权限状态缓存 */
  private permissionCache: Map<string, PermissionStatus> = new Map();
  
  /** 权限状态变化回调 */
  private permissionChangeCallbacks: Map<string, (status: PermissionStatus) => void> = new Map();

  /**
   * 获取权限状态存储键
   */
  private getPermissionStorageKey(permissionName: string): string {
    if (permissionName === 'android.permission.BIND_ACCESSIBILITY_SERVICE') {
      return STORAGE_KEYS.PERMISSION_ACCESSIBILITY_STATUS;
    }
    if (permissionName === 'android.permission.POST_NOTIFICATIONS') {
      return STORAGE_KEYS.PERMISSION_NOTIFICATION_STATUS;
    }
    return `${STORAGE_KEYS.PERMISSION_STATUS_PREFIX}${permissionName}`;
  }

  /**
   * 保存权限状态到持久化存储
   */
  private async savePermissionStatus(permissionName: string, status: PermissionStatus): Promise<void> {
    try {
      const storageKey = this.getPermissionStorageKey(permissionName);
      const storage: PermissionStatusStorage = {
        status,
        lastChecked: Date.now(),
        ...(status === PermissionStatus.GRANTED ? { lastGranted: Date.now() } : {}),
      };
      await AsyncStorage.setItem(storageKey, JSON.stringify(storage));
      console.info(`[权限服务] 已保存权限状态: ${permissionName} = ${status}`);
    } catch (error) {
      console.error(`[权限服务] 保存权限状态失败: ${permissionName}`, error);
    }
  }

  /**
   * 从持久化存储获取权限状态
   */
  private async getPermissionStatusFromStorage(permissionName: string): Promise<PermissionStatusStorage | null> {
    try {
      const storageKey = this.getPermissionStorageKey(permissionName);
      const value = await AsyncStorage.getItem(storageKey);
      if (value) {
        return JSON.parse(value) as PermissionStatusStorage;
      }
    } catch (error) {
      console.error(`[权限服务] 获取权限状态失败: ${permissionName}`, error);
    }
    return null;
  }

  /**
   * 检查权限状态
   */
  async checkPermission(permissionName: string): Promise<PermissionCheckResult> {
    if (Platform.OS !== 'android') {
      return {
        permission: permissionName,
        status: PermissionStatus.NOT_SUPPORTED,
        needsRequest: false,
      };
    }

    const info = PERMISSION_CONFIG[Object.keys(PERMISSION_CONFIG).find(
      key => PERMISSION_CONFIG[key].name === permissionName
    ) || ''];

    // 检查Android版本要求
    if (info?.minSdkVersion) {
      const androidVersion = Platform.Version as number;
      if (androidVersion < info.minSdkVersion) {
        return {
          permission: permissionName,
          status: PermissionStatus.NOT_SUPPORTED,
          info,
          needsRequest: false,
        };
      }
    }

    // 特殊权限处理
    let status: PermissionStatus;

    switch (permissionName) {
      case 'android.permission.BIND_ACCESSIBILITY_SERVICE':
        // 无障碍服务权限需要特殊检查
        try {
          const isEnabled = await accessibilityService.isEnabled();
          status = isEnabled ? PermissionStatus.GRANTED : PermissionStatus.DENIED;
        } catch {
          status = PermissionStatus.DENIED;
        }
        break;

      case 'android.permission.POST_NOTIFICATIONS':
        // 通知权限（Android 13+）
        if (Platform.Version >= 33) {
          try {
            const hasPermission = await accessibilityService.hasNotificationPermission();
            status = hasPermission ? PermissionStatus.GRANTED : PermissionStatus.DENIED;
          } catch {
            status = PermissionStatus.DENIED;
          }
        } else {
          status = PermissionStatus.NOT_SUPPORTED;
        }
        break;

      case 'android.permission.SYSTEM_ALERT_WINDOW':
        // 悬浮窗权限需要特殊检查
        try {
          // 这里需要调用原生模块检查悬浮窗权限
          // 暂时返回DENIED，需要时再请求
          status = PermissionStatus.DENIED;
        } catch {
          status = PermissionStatus.DENIED;
        }
        break;

      default:
        // 系统级权限（如INTERNET、FOREGROUND_SERVICE等）通常自动授予
        // 其他权限需要运行时请求
        status = PermissionStatus.DENIED;
    }

    // 获取之前的存储状态
    const previousStorage = await this.getPermissionStatusFromStorage(permissionName);
    const previousStatus = previousStorage?.status;

    // 更新缓存
    this.permissionCache.set(permissionName, status);

    // 如果状态发生变化，保存到持久化存储并触发回调
    if (previousStatus !== status) {
      await this.savePermissionStatus(permissionName, status);
      
      // 触发状态变化回调
      const callback = this.permissionChangeCallbacks.get(permissionName);
      if (callback) {
        callback(status);
      }
    } else {
      // 即使状态没变化，也更新检查时间
      await this.savePermissionStatus(permissionName, status);
    }

    return {
      permission: permissionName,
      status,
      info,
      needsRequest: status === PermissionStatus.DENIED && info?.required !== false,
    };
  }

  /**
   * 检查权限是否曾经被授予过（从持久化存储）
   */
  async hasPermissionBeenGranted(permissionName: string): Promise<boolean> {
    const storage = await this.getPermissionStatusFromStorage(permissionName);
    return storage?.lastGranted !== undefined;
  }

  /**
   * 注册权限状态变化回调
   */
  onPermissionStatusChange(permissionName: string, callback: (status: PermissionStatus) => void): () => void {
    this.permissionChangeCallbacks.set(permissionName, callback);
    // 返回取消注册的函数
    return () => {
      this.permissionChangeCallbacks.delete(permissionName);
    };
  }

  /**
   * 检查权限组的所有权限
   */
  async checkPermissionGroup(group: PermissionGroup): Promise<PermissionCheckResult[]> {
    const permissions = getPermissionsByGroup(group);
    const results: PermissionCheckResult[] = [];

    for (const permission of permissions) {
      const result = await this.checkPermission(permission.name);
      results.push(result);
    }

    return results;
  }

  /**
   * 请求权限
   */
  async requestPermission(permissionName: string): Promise<PermissionStatus> {
    if (Platform.OS !== 'android') {
      return PermissionStatus.NOT_SUPPORTED;
    }

    const info = PERMISSION_CONFIG[Object.keys(PERMISSION_CONFIG).find(
      key => PERMISSION_CONFIG[key].name === permissionName
    ) || ''];

    if (!info) {
      throw new Error(`未知的权限: ${permissionName}`);
    }

    // 检查Android版本要求
    if (info.minSdkVersion && (Platform.Version as number) < info.minSdkVersion) {
      return PermissionStatus.NOT_SUPPORTED;
    }

    // 先检查当前状态
    const checkResult = await this.checkPermission(permissionName);
    if (checkResult.status === PermissionStatus.GRANTED) {
      return PermissionStatus.GRANTED;
    }

    // 特殊权限处理
    switch (permissionName) {
      case 'android.permission.BIND_ACCESSIBILITY_SERVICE':
        // 无障碍服务需要跳转到设置页面
        await accessibilityService.openSettings();
        // 返回DENIED，等待用户手动开启
        return PermissionStatus.DENIED;

      case 'android.permission.POST_NOTIFICATIONS':
        // 通知权限（Android 13+）
        if (Platform.Version >= 33) {
          try {
            await accessibilityService.requestNotificationPermission();
            // 等待一小段时间后检查
            await new Promise(resolve => setTimeout(resolve, 500));
            const hasPermission = await accessibilityService.hasNotificationPermission();
            return hasPermission ? PermissionStatus.GRANTED : PermissionStatus.DENIED;
          } catch {
            return PermissionStatus.DENIED;
          }
        }
        return PermissionStatus.NOT_SUPPORTED;

      case 'android.permission.SYSTEM_ALERT_WINDOW':
        // 悬浮窗权限需要跳转到设置页面
        try {
          // 这里需要调用原生模块打开悬浮窗设置
          // 暂时返回DENIED
          return PermissionStatus.DENIED;
        } catch {
          return PermissionStatus.DENIED;
        }

      default:
        // 其他权限需要运行时请求
        // 这里可以集成 react-native-permissions 或其他权限库
        return PermissionStatus.DENIED;
    }
  }

  /**
   * 请求权限（带用户提示）
   */
  async requestPermissionWithRationale(
    permissionName: string,
    onDenied?: () => void
  ): Promise<PermissionStatus> {
    const info = PERMISSION_CONFIG[Object.keys(PERMISSION_CONFIG).find(
      key => PERMISSION_CONFIG[key].name === permissionName
    ) || ''];

    if (!info) {
      throw new Error(`未知的权限: ${permissionName}`);
    }

    // 先检查当前状态
    const checkResult = await this.checkPermission(permissionName);
    if (checkResult.status === PermissionStatus.GRANTED) {
      return PermissionStatus.GRANTED;
    }

    // 显示权限说明对话框
    return new Promise((resolve) => {
      Alert.alert(
        '需要权限',
        `${info.purpose}\n\n${info.requestTiming}`,
        [
          {
            text: '取消',
            style: 'cancel',
            onPress: () => {
              onDenied?.();
              resolve(PermissionStatus.DENIED);
            },
          },
          {
            text: '去开启',
            onPress: async () => {
              const status = await this.requestPermission(permissionName);
              if (status === PermissionStatus.DENIED && info.deniedMessage) {
                // 如果被拒绝，显示拒绝提示
                Alert.alert('权限被拒绝', info.deniedMessage);
                onDenied?.();
              }
              resolve(status);
            },
          },
        ]
      );
    });
  }

  /**
   * 检查并请求必需权限
   */
  async ensureRequiredPermissions(): Promise<boolean> {
    const requiredPermissions = Object.values(PERMISSION_CONFIG).filter(p => p.required);
    
    for (const permission of requiredPermissions) {
      const result = await this.checkPermission(permission.name);
      if (result.status !== PermissionStatus.GRANTED && result.status !== PermissionStatus.NOT_SUPPORTED) {
        // 必需权限未授予
        return false;
      }
    }

    return true;
  }

  /**
   * 清除权限缓存
   */
  clearCache(): void {
    this.permissionCache.clear();
  }

  /**
   * 获取权限状态（从缓存）
   */
  getCachedStatus(permissionName: string): PermissionStatus | undefined {
    return this.permissionCache.get(permissionName);
  }
}

export const permissionService = new PermissionService();
