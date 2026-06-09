/**
 * 权限配置 - 符合ITGSA（金标联盟）标准
 * 
 * ITGSA标准要求：
 * 1. 权限最小化原则：只申请必要的权限
 * 2. 权限说明清晰：每个权限都要有明确的用途说明
 * 3. 权限请求时机：在需要使用时才请求，而不是启动时全部请求
 * 4. 权限分组管理：按照功能模块分组
 * 5. 权限拒绝处理：友好的提示和引导
 */

/**
 * 权限分组
 */
export enum PermissionGroup {
  /** 核心功能权限 - 应用运行必需 */
  CORE = 'core',
  /** 自动化功能权限 - 任务执行必需 */
  AUTOMATION = 'automation',
  /** 通知功能权限 - 任务通知必需 */
  NOTIFICATION = 'notification',
  /** 辅助功能权限 - 可选功能 */
  AUXILIARY = 'auxiliary',
}

/**
 * 权限类型定义
 */
export interface PermissionInfo {
  /** 权限名称（Android权限常量） */
  name: string;
  /** 权限分组 */
  group: PermissionGroup;
  /** 权限用途说明（用于向用户展示） */
  purpose: string;
  /** 是否必需（必需权限在功能使用时必须授予） */
  required: boolean;
  /** 最小Android版本要求 */
  minSdkVersion?: number;
  /** 权限请求时机说明 */
  requestTiming: string;
  /** 权限被拒绝时的提示信息 */
  deniedMessage: string;
}

/**
 * 权限配置映射
 */
export const PERMISSION_CONFIG: Record<string, PermissionInfo> = {
  // ========== 核心功能权限 ==========
  INTERNET: {
    name: 'android.permission.INTERNET',
    group: PermissionGroup.CORE,
    purpose: '网络访问权限，用于连接AI模型API服务',
    required: true,
    requestTiming: '应用启动时自动授予（系统级权限）',
    deniedMessage: '网络权限是应用运行的基础，无法使用AI功能',
  },

  // ========== 自动化功能权限 ==========
  BIND_ACCESSIBILITY_SERVICE: {
    name: 'android.permission.BIND_ACCESSIBILITY_SERVICE',
    group: PermissionGroup.AUTOMATION,
    purpose: '无障碍服务权限，用于自动化操作（截图、点击、滑动等）',
    required: true,
    requestTiming: '首次使用自动化功能时请求',
    deniedMessage: '无障碍服务是自动化功能的核心，未开启将无法执行任务',
  },

  QUERY_ALL_PACKAGES: {
    name: 'android.permission.QUERY_ALL_PACKAGES',
    group: PermissionGroup.AUTOMATION,
    purpose: '查询所有应用权限，用于启动和管理其他应用',
    required: true,
    minSdkVersion: 30, // Android 11+
    requestTiming: '首次启动其他应用时请求',
    deniedMessage: '需要此权限才能启动和管理其他应用',
  },

  FOREGROUND_SERVICE: {
    name: 'android.permission.FOREGROUND_SERVICE',
    group: PermissionGroup.AUTOMATION,
    purpose: '前台服务权限，用于在后台执行自动化任务',
    required: true,
    minSdkVersion: 26, // Android 8.0+
    requestTiming: '首次执行后台任务时自动授予（系统级权限）',
    deniedMessage: '前台服务权限是后台任务执行的基础',
  },

  FOREGROUND_SERVICE_SPECIAL_USE: {
    name: 'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
    group: PermissionGroup.AUTOMATION,
    purpose: '特殊用途前台服务权限，用于自动化任务执行',
    required: true,
    minSdkVersion: 34, // Android 14+
    requestTiming: '首次执行后台任务时自动授予（系统级权限）',
    deniedMessage: '特殊用途前台服务权限是后台任务执行的基础',
  },

  WAKE_LOCK: {
    name: 'android.permission.WAKE_LOCK',
    group: PermissionGroup.AUTOMATION,
    purpose: '唤醒锁权限，防止系统休眠，确保任务正常执行',
    required: true,
    requestTiming: '执行长时间任务时自动授予（系统级权限）',
    deniedMessage: '唤醒锁权限确保任务在后台正常执行',
  },

  // ========== 通知功能权限 ==========
  POST_NOTIFICATIONS: {
    name: 'android.permission.POST_NOTIFICATIONS',
    group: PermissionGroup.NOTIFICATION,
    purpose: '通知权限，用于显示任务完成通知和任务执行状态',
    required: false, // 可选，但建议授予
    minSdkVersion: 33, // Android 13+
    requestTiming: '首次需要显示通知时请求',
    deniedMessage: '通知权限用于及时提醒任务完成状态，建议开启',
  },

  // ========== 辅助功能权限 ==========
  CAMERA: {
    name: 'android.permission.CAMERA',
    group: PermissionGroup.AUXILIARY,
    purpose: '相机权限，用于扫描二维码添加API密钥',
    required: false,
    requestTiming: '首次使用二维码扫描功能时请求',
    deniedMessage: '相机权限用于扫描二维码，您可以手动输入API密钥',
  },

  READ_EXTERNAL_STORAGE: {
    name: 'android.permission.READ_EXTERNAL_STORAGE',
    group: PermissionGroup.AUXILIARY,
    purpose: '读取存储权限，用于读取图片等文件',
    required: false,
    requestTiming: '首次需要读取文件时请求',
    deniedMessage: '读取存储权限用于读取文件，功能可正常使用',
  },

  WRITE_EXTERNAL_STORAGE: {
    name: 'android.permission.WRITE_EXTERNAL_STORAGE',
    group: PermissionGroup.AUXILIARY,
    purpose: '写入存储权限，用于保存截图等文件',
    required: false,
    requestTiming: '首次需要保存文件时请求',
    deniedMessage: '写入存储权限用于保存文件，功能可正常使用',
  },

  SYSTEM_ALERT_WINDOW: {
    name: 'android.permission.SYSTEM_ALERT_WINDOW',
    group: PermissionGroup.AUXILIARY,
    purpose: '悬浮窗权限，用于显示任务执行状态悬浮窗',
    required: false,
    requestTiming: '首次需要显示悬浮窗时请求',
    deniedMessage: '悬浮窗权限用于显示任务状态，功能可正常使用',
  },
};

/**
 * 按分组获取权限列表
 */
export function getPermissionsByGroup(group: PermissionGroup): PermissionInfo[] {
  return Object.values(PERMISSION_CONFIG).filter(p => p.group === group);
}

/**
 * 获取必需权限列表
 */
export function getRequiredPermissions(): PermissionInfo[] {
  return Object.values(PERMISSION_CONFIG).filter(p => p.required);
}

/**
 * 获取可选权限列表
 */
export function getOptionalPermissions(): PermissionInfo[] {
  return Object.values(PERMISSION_CONFIG).filter(p => !p.required);
}

/**
 * 根据权限名称获取权限信息
 */
export function getPermissionInfo(permissionName: string): PermissionInfo | undefined {
  return Object.values(PERMISSION_CONFIG).find(p => p.name === permissionName);
}
