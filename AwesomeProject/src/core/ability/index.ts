/**
 * 能力模块导出
 * 统一导出所有能力相关的服务和类型
 */

// 导出类型
export * from './types';

// 导出管理器和服务
export { CapabilityManager, capabilityManager } from './manager/CapabilityManager';
export { capabilityService } from './manager/CapabilityService';

// 导出能力实现
export { AccessibilityCapability } from './accessibility/AccessibilityCapability';
export { accessibilityService } from './accessibility/AccessibilityService';
export { ADBCapability } from './adb/ADBCapability';
export { adbService } from './adb/ADBService';
export { appMappingService } from './adb/ADBAppMappingService';
export { floatingWindowService } from './floatingwindow/FloatingWindowService';

// 导出初始化函数
import { capabilityManager } from './manager/CapabilityManager';
import { AccessibilityCapability } from './accessibility/AccessibilityCapability';
import { ADBCapability } from './adb/ADBCapability';

export function initializeCapabilities(): void {
  const accessibilityCapability = new AccessibilityCapability();
  capabilityManager.register(accessibilityCapability);
  
  const adbCapability = new ADBCapability();
  capabilityManager.register(adbCapability);
  
  console.info('[能力模块] 能力管理器已初始化');
}

