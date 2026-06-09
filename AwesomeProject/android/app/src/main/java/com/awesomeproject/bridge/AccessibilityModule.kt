/**
 * React Native 桥接模块
 * 用于在 JavaScript 和 Kotlin 之间通信
 * 重构后使用模块化设计，代码更清晰、易维护
 */

package com.awesomeproject.bridge

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import android.content.Intent
import android.provider.Settings
import android.accessibilityservice.AccessibilityServiceInfo
import android.view.accessibility.AccessibilityManager
import android.util.Log
import android.view.WindowManager
import android.widget.Toast
import android.os.Build
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.core.app.ActivityCompat
import com.awesomeproject.service.AutoGLMAccessibilityService
import com.awesomeproject.ui.SystemDialogManager
import com.awesomeproject.utils.WakeLockManager
import com.awesomeproject.utils.ServiceManager
import com.awesomeproject.ui.NotificationManager
import com.awesomeproject.utils.ScreenshotManager
import com.awesomeproject.utils.SoundManager
import com.awesomeproject.core.MainActivity

class AccessibilityModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    // 模块化组件
    private val systemDialogManager = SystemDialogManager(reactApplicationContext)
    private val wakeLockManager = WakeLockManager(reactApplicationContext)
    private val serviceManager = ServiceManager(reactApplicationContext)
    private val notificationManager = NotificationManager(reactApplicationContext)
    private val screenshotManager = ScreenshotManager()
    private val soundManager = SoundManager(reactApplicationContext)

    override fun getName(): String {
        return "AccessibilityModule"
    }

    /**
     * 检查无障碍服务是否已启用
     */
    @ReactMethod
    fun isEnabled(promise: Promise) {
        try {
            val accessibilityManager = reactApplicationContext
                .getSystemService(android.content.Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
            
            val packageName = reactApplicationContext.packageName
            val serviceClassName = "com.awesomeproject.service.AutoGLMAccessibilityService"
            
            Log.d("AccessibilityModule", "检查无障碍服务，包名: $packageName, 服务类名: $serviceClassName")
            
            // 方法1: 检查已启用的服务列表
            val enabledServices = try {
                accessibilityManager.getEnabledAccessibilityServiceList(
                    AccessibilityServiceInfo.FEEDBACK_ALL_MASK
                )
            } catch (e: Exception) {
                Log.w("AccessibilityModule", "获取已启用服务列表失败", e)
                emptyList()
            }
            
            Log.d("AccessibilityModule", "已启用的无障碍服务数量: ${enabledServices.size}")
            
            // 更宽泛的匹配：检查包名匹配，然后检查类名
            val isEnabledInList = enabledServices.any { service ->
                val info = service.resolveInfo.serviceInfo
                val fullClassName = if (info.name.startsWith(".")) {
                    "${info.packageName}${info.name}"
                } else if (!info.name.contains(".")) {
                    "${info.packageName}.${info.name}"
                } else {
                    info.name
                }
                
                val packageMatches = info.packageName == packageName
                val classMatches = info.name == serviceClassName || 
                                 info.name == ".AutoGLMAccessibilityService" ||
                                 info.name.endsWith("AutoGLMAccessibilityService") ||
                                 fullClassName == serviceClassName ||
                                 fullClassName.endsWith("AutoGLMAccessibilityService")
                
                packageMatches && classMatches
            }
            
            // 方法2: 直接检查服务实例是否存在
            var serviceInstance: AutoGLMAccessibilityService? = null
            var isServiceRunning = false
            try {
                serviceInstance = AutoGLMAccessibilityService.getInstance()
                isServiceRunning = serviceInstance != null
            } catch (e: Exception) {
                Log.w("AccessibilityModule", "获取服务实例失败", e)
            }
            
            // 方法3: 检查无障碍服务是否真的可用
            var isServiceFunctional = false
            if (serviceInstance != null) {
                try {
                    val rootNode = serviceInstance.getRootNodeInfo()
                    isServiceFunctional = rootNode != null
                } catch (e: Exception) {
                    Log.w("AccessibilityModule", "服务功能检查失败", e)
                }
            }
            
            // 方法4: 使用 Settings.Secure 检查
            var isEnabledInSettings = false
            try {
                val enabledServicesSetting = android.provider.Settings.Secure.getString(
                    reactApplicationContext.contentResolver,
                    android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
                )
                if (enabledServicesSetting != null) {
                    val serviceId = "$packageName/$serviceClassName"
                    isEnabledInSettings = enabledServicesSetting.contains(serviceId) || 
                                         enabledServicesSetting.contains("AutoGLMAccessibilityService")
                }
            } catch (e: Exception) {
                Log.w("AccessibilityModule", "检查系统设置失败", e)
            }
            
            // 只要有一个为 true 就认为已启用
            val finalResult = isEnabledInList || isServiceRunning || isServiceFunctional || isEnabledInSettings
            Log.d("AccessibilityModule", "返回结果: $finalResult")
            promise.resolve(finalResult)
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "检查无障碍服务失败", e)
            promise.reject("ERROR", "检查无障碍服务失败: ${e.message}", e)
        }
    }

    /**
     * 等待无障碍服务启动（最多等待指定时间）
     */
    private fun waitForService(maxWaitMs: Long = 5000): AutoGLMAccessibilityService? {
        val startTime = System.currentTimeMillis()
        
        var service = AutoGLMAccessibilityService.getInstance()
        if (service != null) {
            Log.d("AccessibilityModule", "服务已启动")
            return service
        }
        
        Log.d("AccessibilityModule", "服务未启动，尝试触发事件来启动服务...")
        try {
            val handler = android.os.Handler(android.os.Looper.getMainLooper())
            handler.post {
                try {
                    val activity = currentActivity
                    if (activity != null) {
                        val view = activity.window?.decorView
                        if (view != null) {
                            view.requestFocus()
                            
                            val x = view.width / 2
                            val y = view.height / 2
                            val downTime = android.os.SystemClock.uptimeMillis()
                            val event1 = android.view.MotionEvent.obtain(
                                downTime,
                                downTime,
                                android.view.MotionEvent.ACTION_DOWN,
                                x.toFloat(),
                                y.toFloat(),
                                0
                            )
                            val event2 = android.view.MotionEvent.obtain(
                                downTime,
                                downTime + 10,
                                android.view.MotionEvent.ACTION_UP,
                                x.toFloat(),
                                y.toFloat(),
                                0
                            )
                            view.dispatchTouchEvent(event1)
                            view.dispatchTouchEvent(event2)
                            event1.recycle()
                            event2.recycle()
                            
                            val keyEvent = android.view.KeyEvent(
                                android.view.KeyEvent.ACTION_DOWN,
                                android.view.KeyEvent.KEYCODE_BACK
                            )
                            view.dispatchKeyEvent(keyEvent)
                            
                            Log.d("AccessibilityModule", "已触发多种事件（焦点、触摸、键盘）")
                        }
                    }
                } catch (e: Exception) {
                    Log.w("AccessibilityModule", "触发事件失败", e)
                }
            }
        } catch (e: Exception) {
            Log.w("AccessibilityModule", "触发服务启动失败", e)
        }
        
        // 等待服务启动
        while (System.currentTimeMillis() - startTime < maxWaitMs) {
            service = AutoGLMAccessibilityService.getInstance()
            if (service != null) {
                val waitTime = System.currentTimeMillis() - startTime
                Log.d("AccessibilityModule", "服务已启动，等待时间: ${waitTime}ms")
                return service
            }
            try {
                Thread.sleep(200)
            } catch (e: InterruptedException) {
                Log.w("AccessibilityModule", "等待服务时被中断", e)
                break
            }
        }
        
        val totalWaitTime = System.currentTimeMillis() - startTime
        Log.w("AccessibilityModule", "等待服务启动超时 (${totalWaitTime}ms)")
        return null
    }

    /**
     * 打开无障碍服务设置页面
     */
    @ReactMethod
    fun openSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", "打开设置失败", e)
        }
    }

    /**
     * 打开应用通知设置页面
     * Android 8.0+ 可以打开应用的通知设置
     */
    @ReactMethod
    fun openNotificationSettings(promise: Promise) {
        try {
            val intent = Intent().apply {
                when {
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O -> {
                        // Android 8.0+ 使用 ACTION_APP_NOTIFICATION_SETTINGS
                        action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
                        putExtra(Settings.EXTRA_APP_PACKAGE, reactApplicationContext.packageName)
                    }
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP -> {
                        // Android 5.0+ 使用 ACTION_APP_NOTIFICATION_SETTINGS (兼容)
                        action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
                        putExtra("app_package", reactApplicationContext.packageName)
                        putExtra("app_uid", reactApplicationContext.applicationInfo.uid)
                    }
                    else -> {
                        // Android 5.0 以下打开应用详情页面
                        action = Settings.ACTION_APPLICATION_DETAILS_SETTINGS
                        data = android.net.Uri.parse("package:${reactApplicationContext.packageName}")
                    }
                }
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactApplicationContext.startActivity(intent)
            Log.d("AccessibilityModule", "已打开应用通知设置页面")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "打开通知设置失败", e)
            promise.reject("ERROR", "打开通知设置失败: ${e.message}", e)
        }
    }

    /**
     * 检查通知权限是否已授予
     * Android 13+ 需要 POST_NOTIFICATIONS 权限
     */
    @ReactMethod
    fun hasNotificationPermission(promise: Promise) {
        try {
            val hasPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Android 13+ 检查 POST_NOTIFICATIONS 权限
                ContextCompat.checkSelfPermission(
                    reactApplicationContext,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
            } else {
                // Android 12 及以下不需要此权限
                true
            }
            Log.d("AccessibilityModule", "通知权限检查: $hasPermission (Android ${Build.VERSION.SDK_INT})")
            promise.resolve(hasPermission)
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "检查通知权限失败", e)
            promise.reject("ERROR", "检查通知权限失败: ${e.message}", e)
        }
    }

    /**
     * 请求通知权限
     * Android 13+ 需要 POST_NOTIFICATIONS 权限
     */
    @ReactMethod
    fun requestNotificationPermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Android 13+ 需要请求 POST_NOTIFICATIONS 权限
                val activity = currentActivity
                if (activity == null) {
                    promise.reject("ERROR", "无法获取当前 Activity")
                    return
                }
                
                // 检查是否已有权限
                val hasPermission = ContextCompat.checkSelfPermission(
                    reactApplicationContext,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
                
                if (hasPermission) {
                    Log.d("AccessibilityModule", "通知权限已授予")
                    promise.resolve(true)
                    return
                }
                
                // 请求权限
                ActivityCompat.requestPermissions(
                    activity,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    REQUEST_CODE_NOTIFICATION_PERMISSION
                )
                
                Log.d("AccessibilityModule", "已请求通知权限")
                // 注意：这里不能立即返回结果，需要等待 onRequestPermissionsResult
                // 但 React Native 的权限请求是异步的，这里先返回 true 表示已发起请求
                promise.resolve(true)
            } else {
                // Android 12 及以下不需要此权限
                Log.d("AccessibilityModule", "Android 12 及以下不需要通知权限")
                promise.resolve(true)
            }
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "请求通知权限失败", e)
            promise.reject("ERROR", "请求通知权限失败: ${e.message}", e)
        }
    }
    
    companion object {
        const val REQUEST_CODE_NOTIFICATION_PERMISSION = 2001
    }


    /**
     * 启动任务执行前台服务
     */
    @ReactMethod
    fun startTaskExecutionService(statusText: String, promise: Promise) {
        try {
            val success = serviceManager.startTaskExecutionService(statusText)
            if (success) {
                promise.resolve(true)
            } else {
                promise.reject("ERROR", "启动前台服务失败")
            }
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "启动前台服务失败", e)
            promise.reject("ERROR", "启动前台服务失败: ${e.message}", e)
        }
    }

    /**
     * 更新任务执行前台服务通知
     */
    @ReactMethod
    fun updateTaskExecutionService(statusText: String, promise: Promise) {
        try {
            val success = serviceManager.updateTaskExecutionService(statusText)
            if (success) {
                promise.resolve(true)
            } else {
                promise.reject("ERROR", "更新前台服务失败")
            }
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "更新前台服务失败", e)
            promise.reject("ERROR", "更新前台服务失败: ${e.message}", e)
        }
    }

    /**
     * 停止任务执行前台服务
     */
    @ReactMethod
    fun stopTaskExecutionService(promise: Promise) {
        try {
            val success = serviceManager.stopTaskExecutionService()
            if (success) {
                promise.resolve(true)
            } else {
                promise.reject("ERROR", "停止前台服务失败")
            }
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "停止前台服务失败", e)
            promise.reject("ERROR", "停止前台服务失败: ${e.message}", e)
        }
    }

    /**
     * 显示任务完成通知
     */
    @ReactMethod
    fun showTaskCompletionNotification(title: String, message: String, promise: Promise) {
        try {
            val success = notificationManager.showTaskCompletionNotification(title, message)
            if (success) {
                promise.resolve(true)
            } else {
                promise.reject("ERROR", "无法获取通知管理器")
            }
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "显示任务完成通知失败", e)
            promise.reject("ERROR", "显示任务完成通知失败: ${e.message}", e)
        }
    }

    /**
     * 显示 Toast 提示消息
     */
    @ReactMethod
    fun showToast(message: String, duration: Int, promise: Promise) {
        try {
            val activity = currentActivity
            if (activity == null) {
                val toast = Toast.makeText(
                    reactApplicationContext,
                    message,
                    if (duration == 1) Toast.LENGTH_LONG else Toast.LENGTH_SHORT
                )
                toast.show()
                promise.resolve(true)
            } else {
                activity.runOnUiThread {
                    val toast = Toast.makeText(
                        activity,
                        message,
                        if (duration == 1) Toast.LENGTH_LONG else Toast.LENGTH_SHORT
                    )
                    toast.show()
                    promise.resolve(true)
                }
            }
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "显示 Toast 失败", e)
            promise.reject("ERROR", "显示 Toast 失败: ${e.message}", e)
        }
    }

    /**
     * 显示系统级提示窗
     */
    @ReactMethod
    fun showSystemDialog(title: String, message: String, buttonText: String, promise: Promise) {
        try {
            val success = systemDialogManager.showSystemDialog(title, message, buttonText)
            if (success) {
                promise.resolve(true)
            } else {
                promise.reject("ERROR", "显示系统提示窗失败")
            }
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "显示系统提示窗失败", e)
            promise.reject("ERROR", "显示系统提示窗失败: ${e.message}", e)
        }
    }

    /**
     * 播放任务完成提示音
     * 使用系统默认通知音，无需权限
     */
    @ReactMethod
    fun playTaskCompletionSound(promise: Promise) {
        try {
            val success = soundManager.playTaskCompletionSound()
            if (success) {
                promise.resolve(true)
            } else {
                promise.reject("ERROR", "播放提示音失败")
            }
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "播放提示音失败", e)
            promise.reject("ERROR", "播放提示音失败: ${e.message}", e)
        }
    }

    /**
     * 获取 WakeLock
     */
    @ReactMethod
    fun acquireWakeLock(promise: Promise) {
        try {
            val success = wakeLockManager.acquireWakeLock()
            if (success) {
                promise.resolve(true)
            } else {
                promise.reject("ERROR", "获取 WakeLock 失败")
            }
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "获取 WakeLock 失败", e)
            promise.reject("ERROR", "获取 WakeLock 失败: ${e.message}", e)
        }
    }

    /**
     * 释放 WakeLock
     */
    @ReactMethod
    fun releaseWakeLock(promise: Promise) {
        try {
            val success = wakeLockManager.releaseWakeLock()
            if (success) {
                promise.resolve(true)
            } else {
                promise.reject("ERROR", "释放 WakeLock 失败")
            }
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "释放 WakeLock 失败", e)
            promise.reject("ERROR", "释放 WakeLock 失败: ${e.message}", e)
        }
    }

    /**
     * 将应用切换到后台
     */
    @ReactMethod
    fun moveToBackground(promise: Promise) {
        try {
            val activity = currentActivity
            if (activity != null) {
                val intent = Intent(Intent.ACTION_MAIN)
                intent.addCategory(Intent.CATEGORY_HOME)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                reactApplicationContext.startActivity(intent)
                Log.d("AccessibilityModule", "应用已切换到后台")
                promise.resolve(true)
            } else {
                promise.reject("ERROR", "无法获取当前 Activity")
            }
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "切换到后台失败", e)
            promise.reject("ERROR", "切换到后台失败: ${e.message}", e)
        }
    }

    /**
     * 启动后台任务执行
     */
    @ReactMethod
    fun startBackgroundTask(taskData: String, promise: Promise) {
        try {
            val success = serviceManager.startBackgroundTask(taskData)
            if (success) {
                promise.resolve(true)
            } else {
                promise.reject("ERROR", "启动后台任务失败")
            }
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "启动后台任务失败", e)
            promise.reject("ERROR", "启动后台任务失败: ${e.message}", e)
        }
    }

    /**
     * 获取屏幕分辨率
     */
    @ReactMethod
    fun getScreenSize(promise: Promise) {
        try {
            val windowManager = reactApplicationContext.getSystemService(android.content.Context.WINDOW_SERVICE) as? WindowManager
            if (windowManager == null) {
                promise.reject("ERROR", "无法获取WindowManager")
                return
            }
            
            val result = Arguments.createMap()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                // Android 11+ (API 30+) 使用新 API
                val windowMetrics = windowManager.currentWindowMetrics
                val bounds = windowMetrics.bounds
                result.putInt("width", bounds.width())
                result.putInt("height", bounds.height())
            } else {
                // Android 10 及以下使用旧 API（已弃用但兼容）
                @Suppress("DEPRECATION")
                val displayMetrics = android.util.DisplayMetrics()
                @Suppress("DEPRECATION")
                windowManager.defaultDisplay.getRealMetrics(displayMetrics)
                result.putInt("width", displayMetrics.widthPixels)
                result.putInt("height", displayMetrics.heightPixels)
            }
            
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "获取屏幕分辨率失败", e)
            promise.reject("ERROR", "获取屏幕分辨率失败: ${e.message}", e)
        }
    }

    /**
     * 请求 MediaProjection 权限（Android 9 及以下需要）
     */
    @ReactMethod
    fun requestScreenshotPermission(promise: Promise) {
        try {
            val androidVersion = android.os.Build.VERSION.SDK_INT
            if (androidVersion >= android.os.Build.VERSION_CODES.R) {
                promise.resolve(true)
                return
            }
            
            val activity = currentActivity
            if (activity == null || activity !is MainActivity) {
                promise.reject("ERROR", "无法获取 Activity")
                return
            }
            
            activity.requestMediaProjectionPermission { success ->
                if (success) {
                    promise.resolve(true)
                } else {
                    promise.reject("ERROR", "用户拒绝了截图权限")
                }
            }
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "请求截图权限失败", e)
            promise.reject("ERROR", "请求截图权限失败: ${e.message}", e)
        }
    }

    /**
     * 获取屏幕截图
     */
    @ReactMethod
    fun captureScreen(promise: Promise) {
        try {
            Log.d("AccessibilityModule", "开始截图流程")
            
            var service = AutoGLMAccessibilityService.getInstance()
            
            if (service == null) {
                Log.w("AccessibilityModule", "服务实例为 null，等待服务启动...")
                service = waitForService(5000)
            }
            
            if (service == null) {
                Log.e("AccessibilityModule", "无障碍服务实例为 null，服务可能未启动")
                promise.reject("ERROR", "无障碍服务未启动。请确保：1. 无障碍服务已启用 2. 已重启应用 3. 等待几秒后重试")
                return
            }
            
            val androidVersion = android.os.Build.VERSION.SDK_INT
            if (androidVersion < android.os.Build.VERSION_CODES.R) {
                val mediaProjection = AutoGLMAccessibilityService.getMediaProjection()
                if (mediaProjection == null) {
                    Log.e("AccessibilityModule", "MediaProjection 未设置")
                    promise.reject("ERROR", "截图失败：需要先请求截图权限。请先调用 requestScreenshotPermission。")
                    return
                }
            }
            
            val bitmap = service.captureScreen()
            if (bitmap == null) {
                Log.e("AccessibilityModule", "captureScreen 返回 null")
                if (androidVersion < android.os.Build.VERSION_CODES.R) {
                    promise.reject("ERROR", "截图失败：无法获取屏幕截图。请检查：1. 已允许截图权限 2. 无障碍服务已启用 3. 屏幕未锁定")
                } else {
                    promise.reject("ERROR", "截图失败：无法获取屏幕截图。请检查：1. 无障碍服务已启用 2. 应用有截图权限 3. 屏幕未锁定")
                }
                return
            }
            
            val dataUri = screenshotManager.bitmapToBase64(bitmap)
            if (dataUri != null) {
                promise.resolve(dataUri)
            } else {
                promise.reject("ERROR", "截图转换失败")
            }
        } catch (e: Exception) {
            Log.e("AccessibilityModule", "截图失败", e)
            promise.reject("ERROR", "截图失败: ${e.message}", e)
        }
    }
}

/**
 * ADB 模块
 * 用于执行 shell 命令作为无障碍服务的回退方案
 */
class ADBModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val screenshotManager = ScreenshotManager()

    override fun getName(): String {
        return "ADBModule"
    }

    /**
     * 使用 ADB 命令截图
     */
    @ReactMethod
    fun captureScreenWithADB(promise: Promise) {
        try {
            Log.d("ADBModule", "开始使用 ADB 截图")
            
            val processBuilder = ProcessBuilder("sh", "-c", "screencap -p")
            processBuilder.redirectErrorStream(true)
            
            val process = processBuilder.start()
            
            val inputStream = process.inputStream
            val outputStream = java.io.ByteArrayOutputStream()
            
            val buffer = ByteArray(8192)
            var bytesRead: Int
            while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                outputStream.write(buffer, 0, bytesRead)
            }
            
            val imageBytes = outputStream.toByteArray()
            inputStream.close()
            outputStream.close()
            
            val exitCode = process.waitFor()
            
            if (exitCode == 0 && imageBytes.isNotEmpty()) {
                Log.d("ADBModule", "ADB 截图成功，原始图片大小: ${imageBytes.size} 字节")
                
                val bitmap = android.graphics.BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
                if (bitmap == null) {
                    Log.e("ADBModule", "无法解析 PNG 图片数据")
                    promise.reject("ERROR", "截图失败：无法解析图片数据")
                    return
                }
                
                val dataUri = screenshotManager.bitmapToBase64(bitmap)
                if (dataUri != null) {
                    promise.resolve(dataUri)
                } else {
                    promise.reject("ERROR", "截图转换失败")
                }
            } else {
                val errorOutput = try {
                    process.errorStream.bufferedReader().use { it.readText() }
                } catch (e: Exception) {
                    ""
                }
                
                val errorMsg = if (imageBytes.isEmpty()) {
                    "截图失败：未获取到图片数据"
                } else {
                    "截图失败，退出码: $exitCode${if (errorOutput.isNotEmpty()) ", 错误: $errorOutput" else ""}"
                }
                
                Log.e("ADBModule", errorMsg)
                promise.reject("ERROR", errorMsg)
            }
        } catch (e: Exception) {
            Log.e("ADBModule", "ADB 截图异常", e)
            promise.reject("ERROR", "ADB 截图失败: ${e.message}", e)
        }
    }

    /**
     * 执行 shell 命令
     */
    @ReactMethod
    fun executeShellCommand(command: String, promise: Promise) {
        try {
            Log.d("ADBModule", "执行shell命令: $command")
            
            val processBuilder = ProcessBuilder("sh", "-c", command)
            processBuilder.redirectErrorStream(true)
            
            val process = processBuilder.start()
            
            val output = process.inputStream.bufferedReader().use { it.readText() }
            if (output.isNotEmpty()) {
                Log.d("ADBModule", "命令输出: $output")
            }
            
            val exitCode = process.waitFor()
            
            if (exitCode == 0) {
                Log.d("ADBModule", "命令执行成功")
                promise.resolve(true)
            } else {
                val userFriendlyError = when {
                    output.contains("Permission denied") || output.contains("permission") -> {
                        when {
                            command.contains("am start") -> {
                                "启动应用失败：权限不足。am start 命令可能需要系统权限。建议使用无障碍服务启动应用。"
                            }
                            command.contains("monkey") -> {
                                "启动应用失败：权限不足。monkey 命令可能需要系统权限。建议使用无障碍服务启动应用。"
                            }
                            command.contains("input") -> {
                                "命令执行失败：权限不足。input 命令可能需要 root 权限或系统权限。"
                            }
                            else -> {
                                "命令执行失败：权限不足。命令: $command"
                            }
                        }
                    }
                    output.contains("not found") || output.contains("No such file") -> {
                        "命令执行失败：命令不存在或设备不支持。命令: $command"
                    }
                    exitCode == 137 -> {
                        when {
                            command.contains("monkey") -> {
                                "启动应用失败：monkey 进程被系统杀死（退出码137）。可能原因：1. 系统安全策略限制 2. 应用崩溃。建议使用无障碍服务启动应用。"
                            }
                            else -> {
                                "命令执行失败：进程被系统杀死（退出码137）。命令: $command"
                            }
                        }
                    }
                    else -> {
                        "命令执行失败，退出码: $exitCode${if (output.isNotEmpty()) ", 错误: $output" else ""}。命令: $command"
                    }
                }
                
                promise.reject("ERROR", userFriendlyError)
            }
        } catch (e: Exception) {
            Log.e("ADBModule", "执行shell命令异常", e)
            promise.reject("ERROR", "执行shell命令失败: ${e.message}", e)
        }
    }

    /**
     * 执行shell命令并返回输出
     */
    @ReactMethod
    fun executeShellCommandWithOutput(command: String, promise: Promise) {
        try {
            Log.d("ADBModule", "执行shell命令（带输出）: $command")
            
            val processBuilder = ProcessBuilder("sh", "-c", command)
            processBuilder.redirectErrorStream(true)
            
            val process = processBuilder.start()
            
            val output = process.inputStream.bufferedReader().use { it.readText() }
            val exitCode = process.waitFor()
            
            if (exitCode == 0) {
                Log.d("ADBModule", "命令执行成功，输出长度: ${output.length}")
                promise.resolve(output.trim())
            } else {
                val errorMsg = "命令执行失败，退出码: $exitCode${if (output.isNotEmpty()) ", 错误: $output" else ""}"
                Log.e("ADBModule", errorMsg)
                promise.reject("ERROR", errorMsg)
            }
        } catch (e: Exception) {
            Log.e("ADBModule", "执行shell命令异常", e)
            promise.reject("ERROR", "执行shell命令失败: ${e.message}", e)
        }
    }
}

