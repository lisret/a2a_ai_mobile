# ITGSA权限管理标准实现

## 概述

本文档说明如何按照ITGSA（金标联盟）移动智能终端权限管理标准实现权限管理功能。

参考标准：[ITGSA移动智能终端权限管理标准](https://www.itgsa.com/doc/6495848972174336)

## ITGSA标准核心要求

### 1. 权限最小化原则
- ✅ 只申请必要的权限
- ✅ 区分必需权限和可选权限
- ✅ 可选权限在用户明确需要时才请求

### 2. 权限说明清晰
- ✅ 每个权限都有明确的用途说明
- ✅ 在AndroidManifest.xml中标注权限用途
- ✅ 在代码中定义权限说明常量

### 3. 权限请求时机
- ✅ 按需请求，不在应用启动时全部请求
- ✅ 在功能使用时才请求对应权限
- ✅ 提供"稍后"选项，允许用户稍后处理

### 4. 权限分组管理
- ✅ 按照功能模块分组权限
- ✅ 核心功能权限、自动化功能权限、通知功能权限、辅助功能权限

### 5. 权限拒绝处理
- ✅ 友好的提示信息
- ✅ 引导用户到设置页面
- ✅ 说明权限被拒绝的影响

## 实现架构

### 1. 权限配置 (`permission.config.ts`)

定义了所有权限的配置信息：

```typescript
export const PERMISSION_CONFIG: Record<string, PermissionInfo> = {
  INTERNET: {
    name: 'android.permission.INTERNET',
    group: PermissionGroup.CORE,
    purpose: '网络访问权限，用于连接AI模型API服务',
    required: true,
    requestTiming: '应用启动时自动授予（系统级权限）',
    deniedMessage: '网络权限是应用运行的基础，无法使用AI功能',
  },
  // ... 其他权限
};
```

**权限分组**：
- **CORE（核心功能）**：应用运行必需的权限
- **AUTOMATION（自动化功能）**：任务执行必需的权限
- **NOTIFICATION（通知功能）**：任务通知相关的权限
- **AUXILIARY（辅助功能）**：可选功能的权限

### 2. 权限管理服务 (`PermissionService.ts`)

提供权限管理的核心功能：

- **权限状态检查**：`checkPermission()`
- **权限请求**：`requestPermission()`
- **带说明的权限请求**：`requestPermissionWithRationale()`
- **权限组检查**：`checkPermissionGroup()`
- **必需权限检查**：`ensureRequiredPermissions()`

### 3. AndroidManifest.xml 更新

按照ITGSA标准，在AndroidManifest.xml中：
- ✅ 添加了权限用途说明注释
- ✅ 按功能模块分组权限
- ✅ 标注必需权限和可选权限

## 权限列表

### 核心功能权限（必需）

| 权限名称 | 用途 | 请求时机 |
|---------|------|---------|
| `INTERNET` | 网络访问，连接AI模型API | 系统自动授予 |

### 自动化功能权限（必需）

| 权限名称 | 用途 | 请求时机 |
|---------|------|---------|
| `BIND_ACCESSIBILITY_SERVICE` | 无障碍服务，自动化操作 | 首次使用自动化功能时 |
| `QUERY_ALL_PACKAGES` | 查询所有应用，启动其他应用 | 首次启动其他应用时 |
| `FOREGROUND_SERVICE` | 前台服务，后台任务执行 | 系统自动授予 |
| `FOREGROUND_SERVICE_SPECIAL_USE` | 特殊用途前台服务 | 系统自动授予 |
| `WAKE_LOCK` | 唤醒锁，防止系统休眠 | 系统自动授予 |

### 通知功能权限（可选）

| 权限名称 | 用途 | 请求时机 |
|---------|------|---------|
| `POST_NOTIFICATIONS` | 通知权限，显示任务通知 | 首次需要显示通知时 |

### 辅助功能权限（可选）

| 权限名称 | 用途 | 请求时机 |
|---------|------|---------|
| `CAMERA` | 相机权限，扫描二维码 | 首次使用二维码扫描时 |
| `READ_EXTERNAL_STORAGE` | 读取存储，读取文件 | 首次需要读取文件时 |
| `WRITE_EXTERNAL_STORAGE` | 写入存储，保存文件 | 首次需要保存文件时 |
| `SYSTEM_ALERT_WINDOW` | 悬浮窗权限，显示状态窗 | 首次需要显示悬浮窗时 |

## 使用示例

### 1. 检查权限状态

```typescript
import { permissionService } from '@shared/services/PermissionService';
import { PERMISSION_CONFIG } from '@shared/constants/permission.config';

// 检查单个权限
const result = await permissionService.checkPermission(
  PERMISSION_CONFIG.CAMERA.name
);

if (result.status === PermissionStatus.GRANTED) {
  // 权限已授予，可以使用功能
} else {
  // 权限未授予，需要请求
}
```

### 2. 请求权限（带说明）

```typescript
// 请求权限并显示说明对话框
const status = await permissionService.requestPermissionWithRationale(
  PERMISSION_CONFIG.CAMERA.name,
  () => {
    // 权限被拒绝的回调
    console.log('用户拒绝了相机权限');
  }
);
```

### 3. 检查权限组

```typescript
import { PermissionGroup } from '@shared/constants/permission.config';

// 检查自动化功能权限组
const results = await permissionService.checkPermissionGroup(
  PermissionGroup.AUTOMATION
);

// 检查是否有未授予的必需权限
const allGranted = results.every(r => 
  r.status === PermissionStatus.GRANTED || 
  r.status === PermissionStatus.NOT_SUPPORTED
);
```

### 4. 确保必需权限

```typescript
// 在执行任务前检查必需权限
const hasRequiredPermissions = await permissionService.ensureRequiredPermissions();

if (!hasRequiredPermissions) {
  Alert.alert('缺少必需权限', '请先授予必需的权限才能执行任务');
  return;
}
```

## 权限请求流程

### 标准流程

```
用户触发功能
    ↓
检查权限状态
    ↓
权限已授予？
    ├─ 是 → 执行功能
    └─ 否 → 显示权限说明对话框
            ↓
        用户选择
            ├─ 去开启 → 请求权限
            │           ↓
            │        权限授予？
            │           ├─ 是 → 执行功能
            │           └─ 否 → 显示拒绝提示
            │                     ↓
            │                  引导到设置
            └─ 取消 → 取消操作
```

### 按需请求示例

```typescript
// 在二维码扫描功能中
async function scanQRCode() {
  // 1. 检查相机权限
  const cameraResult = await permissionService.checkPermission(
    PERMISSION_CONFIG.CAMERA.name
  );

  // 2. 如果未授予，请求权限
  if (cameraResult.status !== PermissionStatus.GRANTED) {
    const status = await permissionService.requestPermissionWithRationale(
      PERMISSION_CONFIG.CAMERA.name
    );
    
    if (status !== PermissionStatus.GRANTED) {
      // 权限被拒绝，无法使用功能
      return;
    }
  }

  // 3. 权限已授予，执行功能
  // ... 打开相机扫描二维码
}
```

## 符合ITGSA标准的要点

### ✅ 已实现

1. **权限最小化**：只申请必要的权限，可选权限按需请求
2. **权限说明清晰**：每个权限都有明确的用途说明
3. **权限分组管理**：按照功能模块分组
4. **按需请求**：在功能使用时才请求对应权限
5. **友好提示**：权限被拒绝时提供清晰的说明和引导

### 📋 待优化（可选）

1. **权限使用统计**：记录权限使用情况，用于优化权限请求时机
2. **权限说明页面**：在设置页面中展示所有权限的用途说明
3. **权限状态监控**：监听权限状态变化，及时更新UI

## 相关文件

- `AwesomeProject/src/shared/constants/permission.config.ts` - 权限配置
- `AwesomeProject/src/shared/services/PermissionService.ts` - 权限管理服务
- `AwesomeProject/android/app/src/main/AndroidManifest.xml` - Android权限声明
- `AwesomeProject/src/navigation/AppNavigator.tsx` - 权限检查入口

## 参考

- [ITGSA移动智能终端权限管理标准](https://www.itgsa.com/doc/6495848972174336)
- [Android权限最佳实践](https://developer.android.com/training/permissions/usage-notes)
- [Android权限系统](https://developer.android.com/guide/topics/permissions/overview)
