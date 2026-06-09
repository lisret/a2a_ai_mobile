/**
 * 服务管理模块
 * 负责管理前台服务和后台任务服务
 */

package com.awesomeproject.utils

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.awesomeproject.service.TaskExecutionService
import com.awesomeproject.service.TaskExecutionHeadlessService

class ServiceManager(private val context: Context) {
    /**
     * 启动任务执行前台服务
     */
    fun startTaskExecutionService(statusText: String): Boolean {
        return try {
            val intent = Intent(context, TaskExecutionService::class.java).apply {
                putExtra("statusText", statusText)
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // Android 8.0+ 必须使用 startForegroundService
                context.startForegroundService(intent)
                Log.d("ServiceManager", "任务执行前台服务已启动（Android 8.0+）")
            } else {
                context.startService(intent)
                Log.d("ServiceManager", "任务执行前台服务已启动（Android 8.0 以下）")
            }
            true
        } catch (e: IllegalStateException) {
            // Android 11+ 后台启动限制异常
            val errorMsg = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                "无法在后台启动前台服务。请确保应用在前台时启动任务。错误: ${e.message}"
            } else {
                "启动前台服务失败: ${e.message}"
            }
            Log.e("ServiceManager", errorMsg, e)
            false
        } catch (e: SecurityException) {
            // 权限相关异常
            val errorMsg = "启动前台服务权限不足。请检查应用权限设置。错误: ${e.message}"
            Log.e("ServiceManager", errorMsg, e)
            false
        } catch (e: Exception) {
            Log.e("ServiceManager", "启动前台服务失败", e)
            false
        }
    }

    /**
     * 更新任务执行前台服务通知
     */
    fun updateTaskExecutionService(statusText: String): Boolean {
        return try {
            val intent = Intent(context, TaskExecutionService::class.java).apply {
                putExtra("statusText", statusText)
            }
            context.startService(intent)
            true
        } catch (e: Exception) {
            Log.e("ServiceManager", "更新前台服务失败", e)
            false
        }
    }

    /**
     * 停止任务执行前台服务
     */
    fun stopTaskExecutionService(): Boolean {
        return try {
            val intent = Intent(context, TaskExecutionService::class.java)
            context.stopService(intent)
            Log.d("ServiceManager", "任务执行前台服务已停止")
            true
        } catch (e: Exception) {
            Log.e("ServiceManager", "停止前台服务失败", e)
            false
        }
    }

    /**
     * 启动后台任务执行（使用 Headless JS）
     * @param taskData 任务数据（JSON 字符串）
     */
    fun startBackgroundTask(taskData: String): Boolean {
        return try {
            Log.d("ServiceManager", "启动后台任务执行")
            
            val intent = Intent(context, TaskExecutionHeadlessService::class.java).apply {
                putExtra("taskData", taskData)
            }
            
            // 使用 startForegroundService 启动 Headless JS 服务
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
                Log.d("ServiceManager", "后台任务已启动（Android 8.0+）")
            } else {
                context.startService(intent)
                Log.d("ServiceManager", "后台任务已启动（Android 8.0 以下）")
            }
            true
        } catch (e: IllegalStateException) {
            // Android 11+ 后台启动限制异常
            val errorMsg = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                "无法在后台启动前台服务。请确保应用在前台时启动任务。错误: ${e.message}"
            } else {
                "启动后台任务失败: ${e.message}"
            }
            Log.e("ServiceManager", errorMsg, e)
            false
        } catch (e: SecurityException) {
            // 权限相关异常
            val errorMsg = "启动后台任务权限不足。请检查应用权限设置。错误: ${e.message}"
            Log.e("ServiceManager", errorMsg, e)
            false
        } catch (e: Exception) {
            Log.e("ServiceManager", "启动后台任务失败", e)
            false
        }
    }
}

