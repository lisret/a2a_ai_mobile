# Android 后台运行实现说明

## 实现概述

本项目使用 **Android 前台服务（Foreground Service）** 实现后台任务执行，符合 Android 8.0+ 的最佳实践。

## 核心要点

### 1. 常驻通知（前台服务通知）的核心定义

**常驻通知**是 Android 系统强制要求的、显示在手机通知栏中**无法被用户手动清除**的通知，它是 Android "前台服务" 的 "可视化标识"。

#### 关键特性：

1. **无法手动清除**：
   - 普通通知：用户可以在通知栏左滑/右滑直接清除
   - 常驻通知：用户无法手动清除，只能通过：
     - 点击通知的"停止"按钮（自定义）
     - 停止对应的前台服务
     - 滑动清除会**直接停止服务**（这是和普通通知最核心的区别）

2. **必须即时显示**：
   - 启动前台服务的同时，必须立即创建并显示这个通知
   - 使用 `startForegroundService()` 后，必须在 **5 秒内**调用 `startForeground()`
   - 如果不显示通知就启动前台服务，Android 系统会直接抛出 `IllegalStateException` 异常，导致应用崩溃

3. **可自定义配置**：
   - 标题、内容、图标、点击事件
   - 是否震动/响铃（通过通知渠道配置）
   - 添加操作按钮（如"停止"按钮）

4. **用户可感知**：
   - 常驻通知会一直显示在通知栏
   - 让用户明确知道应用在后台有持续运行的任务
   - 避免"静默后台运行"带来的隐私/电量争议

### 2. Android 8.0+ 前台服务要求

- ✅ **必须使用前台服务**：Android 8.0+ 不允许后台服务长时间运行
- ✅ **必须显示常驻通知**：前台服务必须显示一个持续的通知（`setOngoing(true)`）
- ✅ **必须创建通知渠道**：Android 8.0+ 需要创建通知渠道（NotificationChannel）
- ✅ **必须声明权限**：在 `AndroidManifest.xml` 中声明 `FOREGROUND_SERVICE` 权限
- ✅ **必须即时显示**：在 5 秒内调用 `startForeground()` 显示通知

### 2. 实现细节

#### 前台服务类 (`TaskExecutionService.kt`)

```kotlin
class TaskExecutionService : Service() {
    // 1. 创建通知渠道（Android 8.0+）
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(...)
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    // 2. 启动前台服务时必须调用 startForeground()
    override fun onStartCommand(...) {
        val notification = createNotification(...)
        startForeground(NOTIFICATION_ID, notification)
        return START_STICKY // 服务被杀死后自动重启
    }
}
```

#### 通知配置

- **常驻通知**：`setOngoing(true)` - 【关键】用户无法滑动清除，滑动清除会直接停止服务
- **停止按钮**：添加"停止"操作按钮，让用户可以通过按钮停止服务
- **低优先级**：`PRIORITY_LOW` - 不打扰用户，不发出声音
- **服务类别**：`CATEGORY_SERVICE` - 标识为服务通知
- **使用应用图标**：自动获取应用图标作为通知图标
- **不自动取消**：`setAutoCancel(false)` - 配合 `setOngoing(true)` 使用

#### AndroidManifest.xml 配置

```xml
<!-- 前台服务权限 -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

<!-- 前台服务声明 -->
<service
    android:name=".TaskExecutionService"
    android:enabled="true"
    android:exported="false" />
```

### 3. 启动前台服务

#### Android 8.0+ (API 26+)

```kotlin
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    context.startForegroundService(intent)
} else {
    context.startService(intent)
}
```

**重要**：使用 `startForegroundService()` 后，必须在 5 秒内调用 `startForeground()`，否则服务会被系统杀死。

### 4. 与 React Native 集成

通过 Native Module (`AccessibilityModule.kt`) 暴露以下方法：

- `startTaskExecutionService(statusText)` - 启动前台服务
- `updateTaskExecutionService(statusText)` - 更新通知内容
- `stopTaskExecutionService()` - 停止前台服务

### 5. 工作流程

1. **任务开始时**：
   - 启动前台服务（显示常驻通知）
   - 显示悬浮窗（可选）
   - 切换到后台（`moveToBackground()`）

2. **任务执行中**：
   - 实时更新前台服务通知内容
   - 更新悬浮窗状态（如果启用）

3. **任务完成/失败**：
   - 停止前台服务（通知自动消失）
   - 隐藏悬浮窗

## 注意事项

### ✅ 已实现

- [x] Android 8.0+ 前台服务支持
- [x] 通知渠道创建（Android 8.0+）
- [x] 常驻通知显示
- [x] 通知内容实时更新
- [x] 服务自动重启（`START_STICKY`）
- [x] 应用图标作为通知图标
- [x] 低优先级通知（不打扰用户）

### ⚠️ 限制说明

1. **Android 版本要求**：
   - Android 8.0+ (API 26+) 需要前台服务
   - Android 9 (API 28) 需要 `FOREGROUND_SERVICE` 权限
   - 本项目支持 Android 9+，已正确配置

2. **系统限制**：
   - 前台服务会显示常驻通知（用户可见）
   - 某些厂商 ROM 可能对后台运行有额外限制
   - 电池优化可能影响服务运行

3. **iOS 不支持**：
   - 本项目仅支持 Android
   - iOS 后台运行限制更严格，需要特定场景（音频、定位等）
   - iOS 无"无限制持续运行"机制

## 与 React Native 后台运行库对比

### 本项目实现 vs react-native-background-fetch

| 特性 | 本项目 | react-native-background-fetch |
|------|--------|-------------------------------|
| 适用场景 | 长时间持续运行 | 短时间定期任务 |
| 实现方式 | 前台服务 | 系统后台任务调度 |
| 运行时间 | 无限制（直到任务完成） | 受系统限制（通常几分钟） |
| 通知显示 | 必须显示常驻通知 | 可选 |
| 适用版本 | Android 8.0+ | Android 5.0+ |

### 为什么选择前台服务？

1. **任务特性**：AI 自动化任务需要持续运行，可能执行多步操作
2. **时间要求**：任务执行时间不确定，可能需要几分钟到几十分钟
3. **可靠性**：前台服务不会被系统轻易杀死，保证任务完成

## 测试建议

1. **测试前台服务启动**：
   - 启用"后台运行任务"开关
   - 开始执行任务
   - 检查通知栏是否显示"任务执行中"通知

2. **测试后台运行**：
   - 任务开始后，按 Home 键切换到后台
   - 检查任务是否继续执行
   - 检查通知内容是否实时更新

3. **测试服务停止**：
   - 任务完成后，检查通知是否消失
   - 检查悬浮窗是否隐藏

4. **测试异常情况**：
   - 任务失败时，服务是否正确停止
   - 应用被杀死后，服务是否自动重启（`START_STICKY`）

## 参考文档

- [Android 前台服务官方文档](https://developer.android.com/guide/components/foreground-services)
- [Android 通知渠道文档](https://developer.android.com/training/notify-user/channels)
- [React Native 后台任务](https://reactnative.dev/docs/background-tasks)

