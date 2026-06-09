/**
 * 提示音管理模块
 * 负责播放任务完成提示音
 * 使用 RingtoneManager 播放系统通知音，无需额外权限
 */

package com.awesomeproject.utils

import android.content.Context
import android.media.RingtoneManager
import android.util.Log

class SoundManager(private val context: Context) {
    private var currentRingtone: android.media.Ringtone? = null

    /**
     * 播放任务完成提示音
     * 使用系统默认通知音，无需权限
     * @return true 如果成功播放，false 如果失败
     */
    fun playTaskCompletionSound(): Boolean {
        return try {
            // 停止当前播放的提示音（如果有）
            stopSound()

            // 获取系统默认通知音
            val notificationUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            if (notificationUri == null) {
                Log.w("SoundManager", "无法获取系统默认通知音")
                return false
            }

            // 创建并播放提示音
            currentRingtone = RingtoneManager.getRingtone(context, notificationUri)
            currentRingtone?.play()

            Log.d("SoundManager", "任务完成提示音已播放")
            true
        } catch (e: Exception) {
            Log.e("SoundManager", "播放任务完成提示音失败", e)
            false
        }
    }

    /**
     * 停止当前播放的提示音
     */
    fun stopSound() {
        try {
            currentRingtone?.stop()
            currentRingtone = null
        } catch (e: Exception) {
            Log.e("SoundManager", "停止提示音失败", e)
        }
    }
}

