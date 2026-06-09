/**
 * 系统对话框管理模块
 * 负责显示系统级提示窗（类似 Toast 但更醒目）
 */

package com.awesomeproject.ui

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.TextUtils
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewOutlineProvider
import android.graphics.Outline
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class SystemDialogManager(private val context: Context) {
    private var completionTipWindow: View? = null
    private var windowManager: WindowManager? = null
    private var completionTipHandler: Handler? = null

    init {
        windowManager = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
    }

    /**
     * 显示系统级提示窗（类似 Toast 但更醒目，自动消失）
     * @param title 提示标题
     * @param message 提示内容
     * @param duration 显示时长（毫秒），默认 3000ms
     */
    fun showSystemDialog(title: String, message: String, buttonText: String): Boolean {
        try {
            // 检查悬浮窗权限
            val hasPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(context)
            } else {
                true
            }

            if (!hasPermission) {
                // 如果没有权限，使用 Toast 作为降级方案
                Log.w("SystemDialogManager", "没有悬浮窗权限，使用 Toast 代替")
                val toast = Toast.makeText(
                    context,
                    "$title: $message",
                    Toast.LENGTH_LONG
                )
                toast.show()
                return true
            }

            val wm = windowManager ?: run {
                // 降级到 Toast
                val toast = Toast.makeText(
                    context,
                    "$title: $message",
                    Toast.LENGTH_LONG
                )
                toast.show()
                return true
            }

            // 如果已经显示，先移除
            if (completionTipWindow != null) {
                hideSystemTipWindow()
            }

            // 创建提示窗布局参数
            val layoutParams = WindowManager.LayoutParams().apply {
                type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                } else {
                    @Suppress("DEPRECATION")
                    WindowManager.LayoutParams.TYPE_PHONE
                }
                format = PixelFormat.TRANSLUCENT
                flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                width = (320 * context.resources.displayMetrics.density).toInt() // maxWidth: 320dp
                height = WindowManager.LayoutParams.WRAP_CONTENT
                gravity = Gravity.CENTER // 屏幕中央
                x = 0
                y = 0
            }

            // 创建提示窗内容 - 使用与app内部ConfirmModal一致的样式
            val tipLayout = FrameLayout(context).apply {
                setPadding(0, 0, 0, 0)
            }

            // 创建主容器 - 白色背景，圆角，阴影
            val contentLayout = LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(
                    (24 * context.resources.displayMetrics.density).toInt(), // 24dp
                    (24 * context.resources.displayMetrics.density).toInt(), // 24dp
                    (24 * context.resources.displayMetrics.density).toInt(), // 24dp
                    (24 * context.resources.displayMetrics.density).toInt()  // 24dp
                )
                setBackgroundColor(Color.parseColor("#FFFFFF")) // 白色背景
                // 设置圆角
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    background = android.graphics.drawable.GradientDrawable().apply {
                        setColor(Color.parseColor("#FFFFFF"))
                        cornerRadius = 20f * context.resources.displayMetrics.density // 20dp圆角
                    }
                }
            }

            // 创建标题 TextView - 与ConfirmModal样式一致
            val titleView = TextView(context).apply {
                text = title
                textSize = 18f
                setTextColor(Color.parseColor("#111827")) // #111827
                setTypeface(null, android.graphics.Typeface.BOLD)
                gravity = Gravity.CENTER
                setPadding(0, 0, 0, (12 * context.resources.displayMetrics.density).toInt()) // 12dp marginBottom
            }

            // 创建内容 TextView - 与ConfirmModal样式一致
            val messageView = TextView(context).apply {
                text = message
                textSize = 15f
                setTextColor(Color.parseColor("#6B7280")) // #6B7280
                gravity = Gravity.CENTER
                setPadding(0, 0, 0, 0)
                maxLines = 5
                ellipsize = TextUtils.TruncateAt.END
                setLineSpacing(0f, 1.47f) // lineHeight: 22 / 15 ≈ 1.47
            }

            contentLayout.addView(titleView)
            contentLayout.addView(messageView)
            tipLayout.addView(contentLayout)

            // 添加阴影效果 - 与ConfirmModal一致
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                tipLayout.elevation = 5f // elevation: 5
                // 设置圆角轮廓
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    tipLayout.outlineProvider = object : ViewOutlineProvider() {
                        override fun getOutline(view: View, outline: Outline) {
                            val cornerRadius = 20f * context.resources.displayMetrics.density
                            outline.setRoundRect(0, 0, view.width, view.height, cornerRadius)
                        }
                    }
                    tipLayout.clipToOutline = true
                }
            }

            // 显示提示窗
            wm.addView(tipLayout, layoutParams)
            completionTipWindow = tipLayout

            // 创建 Handler 用于自动隐藏
            completionTipHandler = Handler(Looper.getMainLooper())
            completionTipHandler?.postDelayed({
                hideSystemTipWindow()
            }, 3000) // 3秒后自动隐藏

            Log.d("SystemDialogManager", "系统提示窗已显示: $title - $message")
            return true
        } catch (e: Exception) {
            Log.e("SystemDialogManager", "显示系统提示窗失败", e)
            // 降级到 Toast
            val toast = Toast.makeText(
                context,
                "$title: $message",
                Toast.LENGTH_LONG
            )
            toast.show()
            return true
        }
    }

    /**
     * 隐藏系统提示窗
     */
    private fun hideSystemTipWindow() {
        try {
            completionTipWindow?.let { view ->
                windowManager?.removeView(view)
                completionTipWindow = null
                completionTipHandler?.removeCallbacksAndMessages(null)
                completionTipHandler = null
                Log.d("SystemDialogManager", "系统提示窗已隐藏")
            }
        } catch (e: Exception) {
            Log.e("SystemDialogManager", "隐藏系统提示窗异常", e)
        }
    }
}

