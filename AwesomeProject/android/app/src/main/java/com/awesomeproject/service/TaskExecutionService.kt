package com.awesomeproject.service

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.awesomeproject.core.MainApplication

/**
 * 任务执行前台服务
 * 用于在应用切换到后台时保持任务继续执行
 */
class TaskExecutionService : Service() {
    companion object {
        private const val TAG = "TaskExecutionService"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "task_execution_channel"
        private const val CHANNEL_NAME = "任务执行"
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "任务执行服务已创建")
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // 处理停止服务的请求（中断任务）
        if (intent?.action == "STOP_SERVICE" || intent?.action == "CANCEL_TASK") {
            Log.d(TAG, "收到中断任务请求")
            // 发送事件到 JS，通知任务中断
            sendCancelTaskEvent()
            stopSelf()
            return START_NOT_STICKY
        }

        Log.d(TAG, "任务执行服务已启动")
        val statusText = intent?.getStringExtra("statusText") ?: "任务执行中..."
        
        try {
            // 【关键】必须即时创建并显示通知
            // Android 8.0+ 要求：使用 startForegroundService() 后，必须在 5 秒内调用 startForeground()
            // 否则会抛出 IllegalStateException 导致应用崩溃
            val notification = createNotification(statusText)
            val notificationManager = getSystemService(NotificationManager::class.java)
            
            // 如果服务已经在运行，更新通知；否则启动前台服务
            if (notificationManager.activeNotifications.any { it.id == NOTIFICATION_ID }) {
                // 服务已运行，只需更新通知内容
                notificationManager.notify(NOTIFICATION_ID, notification)
                Log.d(TAG, "前台服务通知已更新")
            } else {
                // 首次启动，必须调用 startForeground() 显示常驻通知
                // 这是 Android 系统强制要求，不显示通知会导致 IllegalStateException
                // Android 13+ (包括 Android 15、16) 需要传递前台服务类型
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    // Android 13+ (API 33+) 包括 Android 15 (API 35) 和 Android 16 (API 36)
                    // 需要指定前台服务类型
                    // 注意：Android 15 的前台服务时间限制主要针对媒体处理服务，
                    // 我们的 specialUse 类型不受此限制影响
                    ServiceCompat.startForeground(
                        this,
                        NOTIFICATION_ID,
                        notification,
                        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                    )
                    Log.d(TAG, "前台服务已启动（Android 13+），常驻通知已显示")
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                    Log.d(TAG, "前台服务已启动，常驻通知已显示")
                }
            }
        } catch (e: IllegalStateException) {
            // Android 11+ 后台启动限制或前台服务启动失败
            Log.e(TAG, "启动前台服务失败（IllegalStateException）", e)
            // 即使启动失败，也返回 START_STICKY，让服务有机会重试
            // 但记录错误，方便调试
        } catch (e: SecurityException) {
            // 权限相关异常
            Log.e(TAG, "启动前台服务权限不足", e)
        } catch (e: Exception) {
            // 其他异常
            Log.e(TAG, "启动前台服务时发生未知错误", e)
        }
        
        return START_STICKY // 服务被杀死后自动重启
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "任务执行服务已销毁")
    }

    /**
     * 创建通知渠道（Android 8.0+ 必需）
     * 
     * Android 8.0+ 要求所有通知必须属于一个通知渠道
     * 通知渠道创建后无法修改重要性级别，只能由用户在系统设置中修改
     */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW // 低优先级，不发出声音，不震动
            ).apply {
                description = "显示任务执行状态，用户无法手动清除此通知"
                setShowBadge(false) // 不在应用图标上显示角标
                enableLights(false) // 不显示指示灯
                enableVibration(false) // 不震动
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
            Log.d(TAG, "通知渠道已创建: $CHANNEL_NAME")
        }
    }

    /**
     * 创建常驻通知（前台服务通知）
     * 
     * 关键特性：
     * 1. setOngoing(true) - 用户无法手动清除，滑动清除会直接停止服务
     * 2. 必须即时显示 - 在 startForeground() 之前创建
     * 3. 可自定义配置 - 标题、内容、图标、点击事件等
     * 4. 用户可感知 - 一直显示在通知栏，让用户知道任务在运行
     * 5. 点击通知不打开应用 - 避免打断后台任务执行
     */
    private fun createNotification(statusText: String): Notification {
        // 中断任务的 Intent
        val cancelIntent = Intent(this, TaskExecutionService::class.java).apply {
            action = "CANCEL_TASK"
        }
        val cancelPendingIntent = PendingIntent.getService(
            this,
            1,
            cancelIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        // 使用应用图标作为通知图标（如果可用）
        val iconRes = try {
            packageManager.getApplicationInfo(packageName, 0).icon
        } catch (e: Exception) {
            android.R.drawable.ic_dialog_info // 回退到系统默认图标
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("任务执行中")
            .setContentText(statusText)
            .setSmallIcon(iconRes)
            // 不设置 setContentIntent，点击通知不会打开应用，避免打断后台任务
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "中断任务",
                cancelPendingIntent
            ) // 添加中断任务按钮，让用户可以通过按钮中断任务
            .setOngoing(true) // 【关键】常驻通知：用户无法手动清除，滑动清除会直接停止服务
            .setPriority(NotificationCompat.PRIORITY_LOW) // 低优先级，不打扰用户
            .setCategory(NotificationCompat.CATEGORY_SERVICE) // 服务类别
            .setShowWhen(false) // 不显示时间戳
            .setAutoCancel(false) // 不自动取消（配合 setOngoing(true)）
            .build()
    }

    /**
     * 更新通知内容
     */
    fun updateNotification(statusText: String) {
        val notification = createNotification(statusText)
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    /**
     * 发送任务中断事件到 JS
     */
    private fun sendCancelTaskEvent() {
        try {
            // 获取 ReactContext（通过 Application）
            val application = applicationContext as? MainApplication
            val reactContext = application?.reactNativeHost?.reactInstanceManager?.currentReactContext as? ReactContext
            
            reactContext?.let { context ->
                val params: WritableMap = Arguments.createMap()
                params.putString("action", "cancelTask")
                
                context
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("TaskCancelRequested", params)
                
                Log.d(TAG, "已发送任务中断事件到 JS")
            } ?: run {
                // 如果无法获取 ReactContext，尝试通过 reactHost
                try {
                    val reactHost = application?.reactHost
                    val reactContext = reactHost?.currentReactContext as? ReactContext
                    reactContext?.let { context ->
                        val params: WritableMap = Arguments.createMap()
                        params.putString("action", "cancelTask")
                        
                        context
                            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                            .emit("TaskCancelRequested", params)
                        
                        Log.d(TAG, "已发送任务中断事件到 JS（通过 reactHost）")
                    } ?: Log.w(TAG, "无法获取 ReactContext，无法发送事件")
                } catch (e: Exception) {
                    Log.e(TAG, "通过 reactHost 发送事件失败", e)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "发送任务中断事件失败", e)
        }
    }
}

