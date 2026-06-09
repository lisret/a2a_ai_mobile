/**
 * 通知管理模块
 * 负责显示任务完成通知
 */

package com.awesomeproject.ui

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager as AndroidNotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.awesomeproject.core.MainActivity

class NotificationManager(private val context: Context) {
    /**
     * 显示任务完成通知
     * @param title 通知标题
     * @param message 通知内容
     */
    fun showTaskCompletionNotification(title: String, message: String): Boolean {
        return try {
            Log.d("NotificationManager", "开始显示通知: $title - $message")
            Log.d("NotificationManager", "Android 版本: ${Build.VERSION.SDK_INT} (${Build.VERSION.RELEASE})")
            
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? AndroidNotificationManager
            if (notificationManager == null) {
                Log.e("NotificationManager", "无法获取通知管理器")
                return false
            }

            // ✅ Android 13+ (API 33+) 检查通知权限
            // ✅ Android 15 (API 35) 执行更严格，必须检查
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) { // API 33+
                val hasPermission = ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
                
                Log.d("NotificationManager", "通知权限状态: $hasPermission")
                
                if (!hasPermission) {
                    Log.w("NotificationManager", "通知权限未授予（Android ${Build.VERSION.SDK_INT}），无法显示通知")
                    Log.w("NotificationManager", "提示：Android 13+ 需要 POST_NOTIFICATIONS 权限才能显示通知")
                    Log.w("NotificationManager", "解决方案：请在应用设置中开启通知权限，或使用 openNotificationSettings() 引导用户")
                    return false
                }
                
                Log.d("NotificationManager", "通知权限已授予，可以显示通知")
            }

            // 创建通知渠道（Android 8.0+ 必需）
            val channelId = "task_completion_channel"
            val channelName = "任务完成通知"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // 检查通知渠道是否已存在
                val existingChannel = notificationManager.getNotificationChannel(channelId)
                if (existingChannel != null) {
                    Log.d("NotificationManager", "通知渠道已存在，重要性: ${existingChannel.importance}")
                    Log.d("NotificationManager", "通知渠道是否启用: ${existingChannel.importance != AndroidNotificationManager.IMPORTANCE_NONE}")
                    
                    // 检查渠道是否被禁用
                    if (existingChannel.importance == AndroidNotificationManager.IMPORTANCE_NONE) {
                        Log.w("NotificationManager", "通知渠道已被用户禁用，无法显示通知")
                        Log.w("NotificationManager", "解决方案：请在系统设置中开启应用的通知渠道")
                        return false
                    }
                } else {
                    Log.d("NotificationManager", "通知渠道不存在，将创建新渠道")
                }
                
                // 使用高重要性，确保通知能够显示
                val channel = NotificationChannel(
                    channelId,
                    channelName,
                    AndroidNotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "任务执行完成通知"
                    enableLights(true)
                    enableVibration(true)
                    setShowBadge(true)
                    // 设置声音（使用系统默认）
                    setSound(null, null)
                }
                notificationManager.createNotificationChannel(channel)
                Log.d("NotificationManager", "通知渠道已创建/更新: $channelName (重要性: ${channel.importance})")
            }

            // 创建点击通知打开应用的 Intent
            val mainIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                mainIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            // 获取应用图标
            val iconRes = try {
                context.packageManager.getApplicationInfo(context.packageName, 0).icon
            } catch (e: Exception) {
                android.R.drawable.ic_dialog_info
            }

            // 创建通知
            val notification = NotificationCompat.Builder(context, channelId)
                .setContentTitle(title)
                .setContentText(message)
                .setSmallIcon(iconRes)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true) // 点击后自动清除
                .setPriority(NotificationCompat.PRIORITY_HIGH) // 高优先级，确保显示
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setShowWhen(true)
                .setDefaults(NotificationCompat.DEFAULT_ALL) // 使用默认声音、震动等
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC) // 公开可见
                .build()

            // 显示通知（使用不同的通知ID，避免与前台服务通知冲突）
            notificationManager.notify(2001, notification)
            Log.d("NotificationManager", "通知已发送到系统: $title - $message")
            
            // 验证通知是否真的显示（Android 6.0+）
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val activeNotifications = notificationManager.activeNotifications
                val hasOurNotification = activeNotifications.any { it.id == 2001 }
                Log.d("NotificationManager", "通知是否在活动列表中: $hasOurNotification")
                
                if (!hasOurNotification) {
                    Log.w("NotificationManager", "警告：通知已发送但未出现在活动列表中")
                    Log.w("NotificationManager", "可能原因：1. 通知权限未授予 2. 通知渠道被禁用 3. 系统限制")
                }
            }
            
            Log.d("NotificationManager", "任务完成通知处理完成: $title - $message")
            true
        } catch (e: Exception) {
            Log.e("NotificationManager", "显示任务完成通知失败", e)
            Log.e("NotificationManager", "错误详情: ${e.message}", e)
            false
        }
    }
    
    /**
     * 检查通知权限是否已授予
     * @return true 如果权限已授予，false 如果未授予或不需要权限
     */
    fun hasNotificationPermission(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) { // API 33+
            val hasPermission = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            Log.d("NotificationManager", "通知权限检查: $hasPermission (Android ${Build.VERSION.SDK_INT})")
            return hasPermission
        }
        // Android 12 及以下不需要此权限
        return true
    }
    
    /**
     * 检查通知渠道是否被禁用
     * @param channelId 通知渠道ID
     * @return true 如果渠道可用，false 如果被禁用
     */
    fun isNotificationChannelEnabled(channelId: String): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? AndroidNotificationManager
            val channel = notificationManager?.getNotificationChannel(channelId)
            if (channel != null) {
                val isEnabled = channel.importance != AndroidNotificationManager.IMPORTANCE_NONE
                Log.d("NotificationManager", "通知渠道 $channelId 是否启用: $isEnabled (重要性: ${channel.importance})")
                return isEnabled
            }
        }
        return true
    }
}

