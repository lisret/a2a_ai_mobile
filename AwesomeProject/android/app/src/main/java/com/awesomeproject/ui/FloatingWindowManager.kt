/**
 * 悬浮窗管理模块
 * 负责显示、更新和隐藏悬浮窗
 */

package com.awesomeproject.ui

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.provider.Settings
import android.text.TextUtils
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView

class FloatingWindowManager(private val context: Context) {
    private var floatingWindow: View? = null
    private var windowManager: WindowManager? = null
    private var statusText: TextView? = null

    init {
        windowManager = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
    }

    /**
     * 检查是否有悬浮窗权限
     */
    fun canDrawOverlays(): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(context)
            } else {
                true // Android 6.0 以下默认有权限
            }
        } catch (e: Exception) {
            Log.e("FloatingWindowManager", "检查悬浮窗权限失败", e)
            false
        }
    }

    /**
     * 显示悬浮窗
     */
    fun showFloatingWindow(text: String): Boolean {
        try {
            // 检查权限
            if (!canDrawOverlays()) {
                Log.e("FloatingWindowManager", "没有悬浮窗权限")
                return false
            }

            // 如果已经显示，先移除
            if (floatingWindow != null) {
                hideFloatingWindow()
            }

            val wm = windowManager ?: run {
                Log.e("FloatingWindowManager", "无法获取 WindowManager")
                return false
            }

            // 创建悬浮窗布局参数
            val layoutParams = WindowManager.LayoutParams().apply {
                type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                } else {
                    @Suppress("DEPRECATION")
                    WindowManager.LayoutParams.TYPE_PHONE
                }
                format = PixelFormat.TRANSLUCENT
                flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                width = WindowManager.LayoutParams.WRAP_CONTENT
                height = WindowManager.LayoutParams.WRAP_CONTENT
                gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL // 顶部居中
                x = 0
                y = 100 // 距离顶部100像素，避免遮挡状态栏和导航栏
            }

            // 创建 TextView 显示状态
            statusText = TextView(context).apply {
                this.text = text
                setTextColor(Color.WHITE)
                setBackgroundColor(Color.parseColor("#20000000")) // 更透明的黑色背景（alpha=0x20，约12.5%不透明度）
                setPadding(20, 15, 20, 15)
                textSize = 12f
                maxLines = 3
                ellipsize = TextUtils.TruncateAt.END
            }

            // 创建容器
            floatingWindow = FrameLayout(context).apply {
                addView(statusText)
                alpha = 0.85f // 设置整个悬浮窗的透明度（85%不透明度，15%透明）
            }

            wm.addView(floatingWindow, layoutParams)
            Log.d("FloatingWindowManager", "悬浮窗已显示: $text")
            return true
        } catch (e: Exception) {
            Log.e("FloatingWindowManager", "显示悬浮窗失败", e)
            return false
        }
    }

    /**
     * 更新悬浮窗文本
     */
    fun updateFloatingWindowText(text: String): Boolean {
        try {
            statusText?.text = text
            return true
        } catch (e: Exception) {
            Log.e("FloatingWindowManager", "更新悬浮窗文本失败", e)
            return false
        }
    }

    /**
     * 隐藏悬浮窗
     */
    fun hideFloatingWindow(): Boolean {
        try {
            floatingWindow?.let { view ->
                windowManager?.removeView(view)
                floatingWindow = null
                statusText = null
                Log.d("FloatingWindowManager", "悬浮窗已隐藏")
                return true
            }
            return false
        } catch (e: Exception) {
            Log.e("FloatingWindowManager", "隐藏悬浮窗异常", e)
            return false
        }
    }
}

