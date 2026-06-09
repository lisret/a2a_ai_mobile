# Android 13+ 后台服务修复说明

## 问题描述

在 Android 13 (API 33) 及更高版本中，app 切换到后台后，前台服务无法正常启动，导致后台任务无法执行。

## 问题原因

从 **Android 13 (API 33)** 开始，Google 引入了新的前台服务类型要求：

1. **必须声明前台服务类型**：所有前台服务必须在 `AndroidManifest.xml` 中声明 `android:foregroundServiceType` 属性
2. **必须传递服务类型**：在调用 `startForeground()` 时必须传递对应的服务类型
3. **Android 14+ 需要运行时权限**：Android 14 (API 34) 及以上版本，特殊用途前台服务需要在运行时请求权限

如果不满足这些要求，系统会阻止前台服务启动，导致后台任务无法执行。

## 解决方案

### 1. AndroidManifest.xml 配置

#### 添加权限声明

```xml
<!-- Android 8.0+ 前台服务权限（必需，用于后台运行） -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<!-- Android 14+ 特殊用途前台服务权限 -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
```

#### 在 Service 声明中添加服务类型

```xml
<service
  android:name=".TaskExecutionService"
  android:enabled="true"
  android:exported="false"
  android:foregroundServiceType="specialUse" />
```

**关键点**：
- `android:foregroundServiceType="specialUse"` 表示这是一个特殊用途的前台服务
- 适用于自动化任务执行这种特殊场景

### 2. 代码修改

#### TaskExecutionService.kt

在 `onStartCommand()` 方法中，Android 13+ 需要传递服务类型：

```kotlin
import androidx.core.app.ServiceCompat

// Android 13+ 需要传递前台服务类型
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
    // Android 13+ (API 33+) 需要指定前台服务类型
    ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        notification,
        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
    )
} else {
    startForeground(NOTIFICATION_ID, notification)
}
```

### 3. Android 14+ 运行时权限（可选，但推荐）

Android 14 (API 34) 及以上版本，特殊用途前台服务需要在运行时请求权限。可以在启动服务前检查并请求权限：

```kotlin
// 在 AccessibilityModule.kt 中
@ReactMethod
fun startTaskExecutionService(statusText: String, promise: Promise) {
    try {
        // Android 14+ 需要检查特殊用途前台服务权限
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val hasPermission = ContextCompat.checkSelfPermission(
                reactApplicationContext,
                "android.permission.FOREGROUND_SERVICE_SPECIAL_USE"
            ) == PackageManager.PERMISSION_GRANTED
            
            if (!hasPermission) {
                // 注意：这个权限通常由系统自动授予，但如果需要可以引导用户到设置页面
                Log.w("AccessibilityModule", "特殊用途前台服务权限未授予")
            }
        }
        
        val intent = Intent(reactApplicationContext, TaskExecutionService::class.java).apply {
            putExtra("statusText", statusText)
        }
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactApplicationContext.startForegroundService(intent)
        } else {
            reactApplicationContext.startService(intent)
        }
        
        Log.d("AccessibilityModule", "任务执行前台服务已启动")
        promise.resolve(true)
    } catch (e: Exception) {
        Log.e("AccessibilityModule", "启动前台服务失败", e)
        promise.reject("ERROR", "启动前台服务失败: ${e.message}", e)
    }
}
```

## 前台服务类型说明

Android 13+ 支持以下前台服务类型：

| 服务类型 | 常量值 | 适用场景 |
|---------|--------|---------|
| `dataSync` | `FOREGROUND_SERVICE_TYPE_DATA_SYNC` | 数据同步 |
| `mediaPlayback` | `FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK` | 媒体播放 |
| `phoneCall` | `FOREGROUND_SERVICE_TYPE_PHONE_CALL` | 电话呼叫 |
| `location` | `FOREGROUND_SERVICE_TYPE_LOCATION` | 位置服务 |
| `connectedDevice` | `FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE` | 连接设备 |
| `shortService` | `FOREGROUND_SERVICE_TYPE_SHORT_SERVICE` | 短时服务（最多 3 分钟） |
| `specialUse` | `FOREGROUND_SERVICE_TYPE_SPECIAL_USE` | 特殊用途（需要说明用途） |

**本项目使用 `specialUse`**，因为自动化任务执行是一个特殊场景，不属于其他标准类型。

## 验证修复

### 测试步骤

1. **在 Android 13+ 设备上测试**：
   - 启动应用
   - 开始执行任务
   - 切换到后台（按 Home 键）
   - 检查通知栏是否显示"任务执行中"通知
   - 检查任务是否继续执行

2. **检查日志**：
   ```bash
   adb logcat | grep TaskExecutionService
   ```
   应该看到：
   ```
   TaskExecutionService: 任务执行服务已启动
   TaskExecutionService: 前台服务已启动，常驻通知已显示
   ```

3. **如果仍然失败**：
   - 检查是否在 AndroidManifest.xml 中正确声明了 `foregroundServiceType`
   - 检查是否在代码中传递了服务类型
   - 检查是否有权限错误（Android 14+）

## 常见问题

### Q1: 为什么 Android 13+ 需要声明服务类型？

**A**: Google 为了提升用户体验和电池续航，要求所有前台服务必须明确声明用途，让用户知道应用在后台做什么。

### Q2: 使用 `specialUse` 有什么限制？

**A**: 
- Android 14+ 需要在运行时请求权限（通常系统会自动授予）
- 需要在应用说明中说明使用特殊用途前台服务的原因
- 某些厂商 ROM 可能对特殊用途服务有额外限制

### Q3: 如果不想使用 `specialUse`，还有其他选择吗？

**A**: 可以考虑：
- `dataSync`：如果任务主要是数据同步
- `shortService`：如果任务执行时间很短（最多 3 分钟）
- 但都不如 `specialUse` 适合自动化任务执行场景

### Q4: Android 14+ 权限请求失败怎么办？

**A**: 
- 特殊用途前台服务权限通常由系统自动授予
- 如果被拒绝，可以引导用户到"应用信息" → "特殊应用访问" → "特殊用途前台服务"中手动授予
- 某些厂商 ROM 可能有不同的权限管理界面

## 相关文档

- [Android 前台服务官方文档](https://developer.android.com/guide/components/foreground-services)
- [Android 13 前台服务类型](https://developer.android.com/about/versions/13/changes/fgs-types-required)
- [Android 14 特殊用途前台服务](https://developer.android.com/about/versions/14/changes/fgs-types-required)

## 修改文件清单

1. ✅ `android/app/src/main/AndroidManifest.xml` - 添加权限和服务类型声明
2. ✅ `android/app/src/main/java/com/awesomeproject/TaskExecutionService.kt` - 修改 startForeground 调用

## 总结

修复 Android 13+ 后台服务问题的关键是：
1. ✅ 在 AndroidManifest.xml 中声明 `foregroundServiceType="specialUse"`
2. ✅ 在代码中使用 `ServiceCompat.startForeground()` 并传递服务类型
3. ✅ 添加 Android 14+ 的特殊用途前台服务权限声明

修复后，前台服务应该可以在 Android 13+ 设备上正常启动和运行。

