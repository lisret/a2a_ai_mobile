package com.awesomeproject.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import javax.annotation.Nullable

/**
 * Headless JS 任务执行服务
 * 用于在后台执行 JavaScript 任务
 */
class TaskExecutionHeadlessService : HeadlessJsTaskService() {
    companion object {
        private const val TAG = "TaskExecutionHeadless"
        private const val NOTIFICATION_ID = 1002
        private const val CHANNEL_ID = "headless_task_channel"
        private const val CHANNEL_NAME = "后台任务执行"
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Headless JS 服务已创建")
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Headless JS 服务已启动")
        
        try {
            // 启动前台服务，确保服务不会被系统杀死
            // Android 13+ (包括 Android 15、16) 需要传递前台服务类型
            // 注意：Android 15 的前台服务时间限制主要针对媒体处理服务，
            // 我们的 specialUse 类型不受此限制影响
            val notification = createNotification("后台任务执行中...")
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Android 13+ (API 33+) 包括 Android 15 (API 35) 和 Android 16 (API 36)
                // 需要指定前台服务类型
                ServiceCompat.startForeground(
                    this,
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                )
                Log.d(TAG, "前台服务已启动（Android 13+），常驻通知已显示")
            } else {
                startForeground(NOTIFICATION_ID, notification)
                Log.d(TAG, "前台服务已启动，常驻通知已显示")
            }
        } catch (e: Exception) {
            Log.e(TAG, "启动前台服务失败", e)
            // 即使前台服务启动失败，也尝试继续执行任务
            // 在某些情况下（如权限问题），服务可能仍然可以运行
        }
        
        // 调用父类方法启动 Headless JS 任务
        return super.onStartCommand(intent, flags, startId)
    }

    /**
     * 获取任务配置
     * 这个方法会在服务启动时被调用
     */
    @Nullable
    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        if (intent == null) {
            Log.e(TAG, "Intent 为空")
            return null
        }
        
        // 从 Intent 中获取任务数据
        val taskData = intent.getStringExtra("taskData")
        if (taskData == null) {
            Log.e(TAG, "任务数据为空")
            return null
        }

        Log.d(TAG, "任务数据: $taskData")

        // 创建任务配置
        // 将任务数据（JSON 字符串）传递给 JavaScript
        // JavaScript 端会解析 JSON 字符串
        return HeadlessJsTaskConfig(
            "TaskExecution", // 任务名称，对应 index.js 中注册的任务名
            Arguments.createMap().apply {
                putString("taskData", taskData)
            },
            0, // 超时时间（0 表示无超时，任务可以一直运行直到完成）
            true // 允许在后台执行
        )
    }

    /**
     * 创建通知渠道（Android 8.0+ 必需）
     */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "显示后台任务执行状态"
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
            Log.d(TAG, "通知渠道已创建: $CHANNEL_NAME")
        }
    }

    /**
     * 创建通知
     */
    private fun createNotification(statusText: String): Notification {
        val iconRes = try {
            packageManager.getApplicationInfo(packageName, 0).icon
        } catch (e: Exception) {
            android.R.drawable.ic_dialog_info
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("后台任务执行中")
            .setContentText(statusText)
            .setSmallIcon(iconRes)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setShowWhen(false)
            .setAutoCancel(false)
            .build()
    }
}

