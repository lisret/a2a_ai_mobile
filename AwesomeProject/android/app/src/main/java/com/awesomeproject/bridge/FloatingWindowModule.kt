/**
 * 悬浮窗模块
 * React Native 桥接模块，用于在 JavaScript 和 Kotlin 之间通信
 * 负责悬浮窗的显示、更新和隐藏功能
 */

package com.awesomeproject.bridge

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.awesomeproject.ui.FloatingWindowManager

class FloatingWindowModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val floatingWindowManager = FloatingWindowManager(reactApplicationContext)

    override fun getName(): String {
        return "FloatingWindowModule"
    }

    /**
     * 检查是否有悬浮窗权限
     */
    @ReactMethod
    fun canDrawOverlays(promise: Promise) {
        try {
            val result = floatingWindowManager.canDrawOverlays()
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e("FloatingWindowModule", "检查悬浮窗权限失败", e)
            promise.reject("ERROR", "检查悬浮窗权限失败: ${e.message}", e)
        }
    }

    /**
     * 打开悬浮窗权限设置页面
     */
    @ReactMethod
    fun openOverlayPermissionSettings(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
                intent.data = android.net.Uri.parse("package:${reactApplicationContext.packageName}")
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                reactApplicationContext.startActivity(intent)
                promise.resolve(true)
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            Log.e("FloatingWindowModule", "打开悬浮窗权限设置失败", e)
            promise.reject("ERROR", "打开悬浮窗权限设置失败: ${e.message}", e)
        }
    }

    /**
     * 显示悬浮窗
     */
    @ReactMethod
    fun showFloatingWindow(text: String, promise: Promise) {
        try {
            val success = floatingWindowManager.showFloatingWindow(text)
            if (success) {
                promise.resolve(true)
            } else {
                promise.reject("ERROR", "没有悬浮窗权限，请先授予权限")
            }
        } catch (e: Exception) {
            Log.e("FloatingWindowModule", "显示悬浮窗失败", e)
            promise.reject("ERROR", "显示悬浮窗失败: ${e.message}", e)
        }
    }

    /**
     * 更新悬浮窗文本
     */
    @ReactMethod
    fun updateFloatingWindowText(text: String, promise: Promise) {
        try {
            val success = floatingWindowManager.updateFloatingWindowText(text)
            if (success) {
                promise.resolve(true)
            } else {
                promise.reject("ERROR", "更新悬浮窗文本失败")
            }
        } catch (e: Exception) {
            Log.e("FloatingWindowModule", "更新悬浮窗文本失败", e)
            promise.reject("ERROR", "更新悬浮窗文本失败: ${e.message}", e)
        }
    }

    /**
     * 隐藏悬浮窗
     */
    @ReactMethod
    fun hideFloatingWindow(promise: Promise) {
        try {
            val success = floatingWindowManager.hideFloatingWindow()
            if (success) {
                promise.resolve(true)
            } else {
                promise.resolve(false) // 如果窗口不存在，也算成功
            }
        } catch (e: Exception) {
            Log.e("FloatingWindowModule", "隐藏悬浮窗失败", e)
            promise.reject("ERROR", "隐藏悬浮窗失败: ${e.message}", e)
        }
    }
}

