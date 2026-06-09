# Moto Razr 50 (XT2453-2) 通知栏显示问题调研

## 问题描述

Moto Razr 50 (XT2453-2) 手机无法在通知栏显示通知。

## 设备信息

- **设备型号**: Moto Razr 50
- **设备代码**: XT2453-2
- **系统版本**: **Android 15 (API 35)** ✅ 已确认

## 问题分析

### 1. Android 13+ 通知权限要求（Android 15 更严格）

**关键发现：** 从 **Android 13 (API 33)** 开始，Google 引入了新的通知权限要求，**Android 15 (API 35) 执行更严格**：

- ✅ **必须声明权限**: 在 `AndroidManifest.xml` 中声明 `POST_NOTIFICATIONS` 权限
- ✅ **必须运行时请求**: 应用首次启动时需要请求通知权限
- ❌ **未授权则不显示**: 如果用户未授予通知权限，系统会**静默阻止**通知显示，不会抛出异常
- ⚠️ **Android 15 增强**: Android 15 对通知权限的检查更加严格，即使有前台服务权限，普通通知仍需要 `POST_NOTIFICATIONS` 权限

### 2. 当前代码检查

#### AndroidManifest.xml 分析

**当前状态：** ❌ **缺少 POST_NOTIFICATIONS 权限声明**

```xml
<!-- 当前 AndroidManifest.xml -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
<!-- ❌ 缺少 POST_NOTIFICATIONS 权限 -->
```

**问题：**
- Android 13+ 设备上，没有 `POST_NOTIFICATIONS` 权限，通知会被系统静默阻止
- 不会抛出异常，但通知不会显示
- 这是导致 Moto Razr 50 无法显示通知的**最可能原因**

#### 通知实现代码分析

**NotificationManager.kt** 实现看起来是正确的：
- ✅ 创建了通知渠道（Android 8.0+ 必需）
- ✅ 设置了高重要性（`IMPORTANCE_HIGH`）
- ✅ 设置了高优先级（`PRIORITY_HIGH`）
- ✅ 设置了可见性（`VISIBILITY_PUBLIC`）
- ✅ 使用了默认声音和震动（`DEFAULT_ALL`）

**但是：** 没有检查通知权限状态，也没有请求权限的逻辑。

### 3. Moto Razr 50 特定问题

#### 可能的设备特定限制

1. **系统版本**
   - Moto Razr 50 很可能运行 Android 13 或更高版本
   - 需要 `POST_NOTIFICATIONS` 权限

2. **摩托罗拉系统定制**
   - 摩托罗拉可能对通知有额外的限制
   - 可能需要在系统设置中手动开启通知权限

3. **电池优化**
   - 如果应用被加入电池优化白名单，可能影响通知显示
   - 需要引导用户将应用加入电池优化白名单

4. **通知渠道设置**
   - 用户可能在系统设置中关闭了应用的通知渠道
   - 需要检查通知渠道是否被禁用

## 解决方案

### 方案 1：添加 POST_NOTIFICATIONS 权限（必需）⭐

#### 1.1 更新 AndroidManifest.xml

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- 现有权限 -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
    
    <!-- ✅ 添加：Android 13+ 通知权限（必需） -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    
    <!-- 其他权限... -->
</manifest>
```

#### 1.2 添加运行时权限请求（Android 15 必需）

**在应用启动时或显示通知前请求权限：**

```kotlin
// 在 AccessibilityModule.kt 或 MainActivity.kt 中
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

// Android 13+ (API 33+) 需要通知权限
// Android 15 (API 35) 执行更严格，必须请求
fun checkAndRequestNotificationPermission(): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) { // API 33+
        val hasPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        
        if (!hasPermission) {
            Log.w("NotificationPermission", "通知权限未授予，需要请求权限")
            // 请求权限
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                REQUEST_CODE_NOTIFICATION_PERMISSION
            )
            return false
        }
        
        Log.d("NotificationPermission", "通知权限已授予")
        return true
    }
    
    // Android 12 及以下不需要此权限
    return true
}
```

**注意：** Android 15 对通知权限的检查非常严格，即使应用有前台服务权限，普通通知（非前台服务通知）仍需要 `POST_NOTIFICATIONS` 权限。

#### 1.3 在显示通知前检查权限（Android 15 必需）

**更新 NotificationManager.kt：**

```kotlin
import android.Manifest
import androidx.core.content.ContextCompat

fun showTaskCompletionNotification(title: String, message: String): Boolean {
    return try {
        // ✅ Android 13+ (API 33+) 检查通知权限
        // ✅ Android 15 (API 35) 执行更严格，必须检查
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) { // API 33+
            val hasPermission = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            
            if (!hasPermission) {
                Log.w("NotificationManager", "通知权限未授予（Android ${Build.VERSION.SDK_INT}），无法显示通知")
                Log.w("NotificationManager", "提示：Android 13+ 需要 POST_NOTIFICATIONS 权限才能显示通知")
                // 可以发送事件到 JS，提示用户开启通知权限
                // 或者直接打开通知设置页面
                return false
            }
            
            Log.d("NotificationManager", "通知权限已授予，可以显示通知")
        }
        
        // 原有的通知显示逻辑...
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? AndroidNotificationManager
        // ...
    } catch (e: Exception) {
        Log.e("NotificationManager", "显示任务完成通知失败", e)
        false
    }
}
```

**Android 15 特殊说明：**
- Android 15 对通知权限的检查非常严格
- 即使应用有前台服务权限，普通通知仍需要 `POST_NOTIFICATIONS` 权限
- 前台服务通知（`setOngoing(true)`）可能不需要此权限，但普通通知必须要有

### 方案 2：检查通知渠道状态

**在显示通知前检查渠道是否被禁用：**

```kotlin
fun showTaskCompletionNotification(title: String, message: String): Boolean {
    return try {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? AndroidNotificationManager
        if (notificationManager == null) {
            Log.e("NotificationManager", "无法获取通知管理器")
            return false
        }

        val channelId = "task_completion_channel"
        
        // ✅ 检查通知渠道是否被禁用
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = notificationManager.getNotificationChannel(channelId)
            if (channel != null && channel.importance == NotificationManager.IMPORTANCE_NONE) {
                Log.w("NotificationManager", "通知渠道已被用户禁用")
                // 可以引导用户到设置页面开启
                return false
            }
        }
        
        // 显示通知...
    } catch (e: Exception) {
        Log.e("NotificationManager", "显示任务完成通知失败", e)
        false
    }
}
```

### 方案 3：引导用户到设置页面

**如果权限未授予，引导用户到设置页面：**

```kotlin
fun openNotificationSettings() {
    val intent = Intent().apply {
        when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O -> {
                action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
                putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            }
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP -> {
                action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
                putExtra("app_package", context.packageName)
                putExtra("app_uid", context.applicationInfo.uid)
            }
            else -> {
                action = Settings.ACTION_APPLICATION_DETAILS_SETTINGS
                data = Uri.parse("package:${context.packageName}")
            }
        }
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
    }
    context.startActivity(intent)
}
```

### 方案 4：添加调试日志

**添加详细的日志，帮助诊断问题：**

```kotlin
fun showTaskCompletionNotification(title: String, message: String): Boolean {
    return try {
        Log.d("NotificationManager", "开始显示通知: $title - $message")
        Log.d("NotificationManager", "Android 版本: ${Build.VERSION.SDK_INT}")
        
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? AndroidNotificationManager
        if (notificationManager == null) {
            Log.e("NotificationManager", "无法获取通知管理器")
            return false
        }
        
        // Android 13+ 检查权限
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val hasPermission = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            Log.d("NotificationManager", "通知权限状态: $hasPermission")
            
            if (!hasPermission) {
                Log.w("NotificationManager", "通知权限未授予，无法显示通知")
                return false
            }
        }
        
        val channelId = "task_completion_channel"
        
        // 检查通知渠道
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = notificationManager.getNotificationChannel(channelId)
            if (channel != null) {
                Log.d("NotificationManager", "通知渠道重要性: ${channel.importance}")
                Log.d("NotificationManager", "通知渠道是否启用: ${channel.importance != NotificationManager.IMPORTANCE_NONE}")
                
                if (channel.importance == NotificationManager.IMPORTANCE_NONE) {
                    Log.w("NotificationManager", "通知渠道已被用户禁用")
                    return false
                }
            } else {
                Log.w("NotificationManager", "通知渠道不存在，将创建新渠道")
            }
        }
        
        // 显示通知...
        notificationManager.notify(2001, notification)
        Log.d("NotificationManager", "通知已发送到系统: $title - $message")
        
        // 验证通知是否真的显示
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val activeNotifications = notificationManager.activeNotifications
            val hasOurNotification = activeNotifications.any { it.id == 2001 }
            Log.d("NotificationManager", "通知是否在活动列表中: $hasOurNotification")
        }
        
        true
    } catch (e: Exception) {
        Log.e("NotificationManager", "显示任务完成通知失败", e)
        false
    }
}
```

## 诊断步骤

### 1. 检查 Android 版本

```bash
# 在设备上运行
adb shell getprop ro.build.version.sdk
```

**Moto Razr 50 确认：** 返回 35 (Android 15)，**必须**有 `POST_NOTIFICATIONS` 权限。

### 2. 检查通知权限状态

```bash
# 检查应用的通知权限
adb shell dumpsys package com.awesomeproject | grep -A 5 "POST_NOTIFICATIONS"
```

### 3. 检查通知渠道状态

```bash
# 检查通知渠道
adb shell dumpsys notification | grep -A 10 "task_completion_channel"
```

### 4. 查看日志

```bash
# 查看通知相关日志
adb logcat | grep -i "NotificationManager"
```

## 推荐修复步骤

### 优先级 1：添加 POST_NOTIFICATIONS 权限（Android 15 必需）⭐

**Android 15 对通知权限要求非常严格，这是导致 Moto Razr 50 无法显示通知的根本原因。**

1. ✅ 在 `AndroidManifest.xml` 中添加权限声明（**立即修复**）
2. ✅ 在应用启动时请求权限（**立即修复**）
3. ✅ 在显示通知前检查权限状态（**立即修复**）
4. ✅ 如果权限未授予，引导用户到设置页面（**用户体验优化**）

### 优先级 2：增强错误处理和日志

1. ✅ 添加详细的日志输出
2. ✅ 检查通知渠道状态
3. ✅ 提供用户友好的错误提示

### 优先级 3：用户体验优化

1. ✅ 如果权限未授予，引导用户到设置页面
2. ✅ 在设置页面添加"检查通知权限"功能
3. ✅ 提供通知测试功能

## 预期效果

修复后，Moto Razr 50 应该能够：
- ✅ 正确显示任务完成通知
- ✅ 在通知栏显示前台服务通知
- ✅ 用户可以通过通知快速返回应用

## 相关文件

- `AwesomeProject/android/app/src/main/AndroidManifest.xml` - 权限声明
- `AwesomeProject/android/app/src/main/java/com/awesomeproject/ui/NotificationManager.kt` - 通知管理
- `AwesomeProject/android/app/src/main/java/com/awesomeproject/core/MainActivity.kt` - 主活动（可在此请求权限）

## 参考资料

- [Android 13 通知权限要求](https://developer.android.com/develop/ui/views/notifications/notification-permission)
- [Android 通知最佳实践](https://developer.android.com/develop/ui/views/notifications)
- [摩托罗拉设备通知问题](https://support.motorola.com/us/en/solution/HT215569)

