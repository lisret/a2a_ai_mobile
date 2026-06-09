/**
 * WakeLock 管理模块
 * 负责获取和释放 WakeLock（保持 CPU 唤醒，防止系统休眠）
 */

package com.awesomeproject.utils

import android.content.Context
import android.os.PowerManager
import android.util.Log

class WakeLockManager(private val context: Context) {
    private var wakeLock: PowerManager.WakeLock? = null

    /**
     * 获取 WakeLock（保持 CPU 唤醒，防止系统休眠）
     * 注意：必须在任务完成后释放，否则会耗电
     */
    fun acquireWakeLock(): Boolean {
        try {
            if (wakeLock != null && wakeLock!!.isHeld) {
                Log.d("WakeLockManager", "WakeLock 已持有")
                return true
            }

            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "AutoGLM::TaskExecutionWakeLock"
            ).apply {
                acquire(10 * 60 * 60 * 1000L) // 最多保持 10 小时（任务应该不会运行这么久）
            }
            
            Log.d("WakeLockManager", "WakeLock 已获取")
            return true
        } catch (e: Exception) {
            Log.e("WakeLockManager", "获取 WakeLock 失败", e)
            return false
        }
    }

    /**
     * 释放 WakeLock
     */
    fun releaseWakeLock(): Boolean {
        try {
            wakeLock?.let {
                if (it.isHeld) {
                    it.release()
                    Log.d("WakeLockManager", "WakeLock 已释放")
                }
                wakeLock = null
            }
            return true
        } catch (e: Exception) {
            Log.e("WakeLockManager", "释放 WakeLock 失败", e)
            // 即使释放失败，也尝试清理
            wakeLock = null
            return false
        }
    }

    /**
     * 清理资源
     */
    fun cleanup() {
        releaseWakeLock()
    }
}

