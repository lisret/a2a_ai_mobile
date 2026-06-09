package com.awesomeproject.service

import android.accessibilityservice.AccessibilityService
import android.media.projection.MediaProjection
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.graphics.Bitmap
import android.os.Build
import android.util.Log
import com.awesomeproject.accessibility.GestureHandler
import com.awesomeproject.accessibility.ScreenshotHandler

/**
 * AutoGLM 无障碍服务
 * 用于执行自动化操作（点击、滑动、输入等）
 * 重构后使用模块化设计，代码更清晰、易维护
 */
class AutoGLMAccessibilityService : AccessibilityService() {
    
    companion object {
        private const val TAG = "AutoGLMAccessibility"
        private var instance: AutoGLMAccessibilityService? = null
        private var mediaProjection: MediaProjection? = null
        
        fun getInstance(): AutoGLMAccessibilityService? = instance
        
        fun setMediaProjection(projection: MediaProjection?) {
            mediaProjection = projection
            Log.d(TAG, "MediaProjection 已设置: ${projection != null}")
        }
        
        fun getMediaProjection(): MediaProjection? = mediaProjection
    }

    // 模块化组件
    private lateinit var gestureHandler: GestureHandler
    private lateinit var screenshotHandler: ScreenshotHandler

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        gestureHandler = GestureHandler(this)
        screenshotHandler = ScreenshotHandler(this)
        Log.d(TAG, "无障碍服务已连接，实例已设置")
        
        try {
            val rootNode = rootInActiveWindow
            if (rootNode != null) {
                Log.d(TAG, "服务正常工作，当前窗口: ${rootNode.packageName}")
            } else {
                Log.w(TAG, "服务已连接，但无法获取根节点（可能窗口未准备好）")
            }
        } catch (e: Exception) {
            Log.w(TAG, "检查服务状态时出错", e)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        Log.d(TAG, "无障碍服务已销毁")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event != null) {
            Log.d(TAG, "收到无障碍事件: type=${event.eventType}, package=${event.packageName}")
        }
    }

    override fun onInterrupt() {
        Log.w(TAG, "无障碍服务被中断")
    }

    /**
     * 执行点击操作
     */
    fun performClick(x: Int, y: Int): Boolean {
        return gestureHandler.performClick(x, y)
    }

    /**
     * 执行长按操作
     */
    fun performLongPress(x: Int, y: Int, duration: Long = 800): Boolean {
        return gestureHandler.performLongPress(x, y, duration)
    }

    /**
     * 执行双击操作
     */
    fun performDoubleTap(x: Int, y: Int): Boolean {
        return gestureHandler.performDoubleTap(x, y)
    }

    /**
     * 执行滑动操作
     */
    fun performSwipe(startX: Int, startY: Int, endX: Int, endY: Int, duration: Long = 300): Boolean {
        return gestureHandler.performSwipe(startX, startY, endX, endY, duration)
    }

    /**
     * 执行文本输入
     */
    fun performTextInput(text: String): Boolean {
        return try {
            Log.d(TAG, "开始文本输入: \"$text\" (长度: ${text.length})")
            
            val clipboard = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
            val clip = android.content.ClipData.newPlainText("text", text)
            clipboard.setPrimaryClip(clip)
            Log.d(TAG, "文本已复制到剪贴板")
            
            val rootNode = rootInActiveWindow
            if (rootNode == null) {
                Log.w(TAG, "无法获取根节点（rootInActiveWindow 为 null）")
                Log.w(TAG, "提示：请确保已点击输入框，或使用 ADB Keyboard 进行输入")
                return false
            }
            
            Log.d(TAG, "查找焦点输入框节点...")
            val focusedNode = rootNode.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            
            if (focusedNode != null) {
                Log.d(TAG, "找到焦点输入框节点，类名: ${focusedNode.className}")
                
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Log.d(TAG, "尝试使用 ACTION_SET_TEXT 直接设置文本...")
                    val arguments = android.os.Bundle().apply {
                        putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
                    }
                    val success = focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
                    focusedNode.recycle()
                    rootNode.recycle()
                    if (success) {
                        Log.d(TAG, "文本输入成功（直接设置）: \"$text\"")
                        return true
                    } else {
                        Log.w(TAG, "ACTION_SET_TEXT 操作返回 false，尝试粘贴操作...")
                    }
                } else {
                    Log.d(TAG, "Android 版本低于 6.0，跳过 ACTION_SET_TEXT，直接尝试粘贴")
                }
                
                Log.d(TAG, "尝试使用 ACTION_PASTE 粘贴文本...")
                val pasteSuccess = focusedNode.performAction(AccessibilityNodeInfo.ACTION_PASTE)
                focusedNode.recycle()
                rootNode.recycle()
                if (pasteSuccess) {
                    Log.d(TAG, "文本输入成功（粘贴）: \"$text\"")
                    return true
                } else {
                    Log.w(TAG, "ACTION_PASTE 操作返回 false")
                }
            } else {
                Log.w(TAG, "未找到焦点输入框节点（findFocus 返回 null）")
                Log.w(TAG, "提示：请确保已点击输入框，或使用 ADB Keyboard 进行输入")
                rootNode.recycle()
            }
            
            Log.w(TAG, "文本输入失败: \"$text\"")
            Log.w(TAG, "失败原因：未找到输入框节点或输入框不支持设置文本/粘贴操作")
            Log.w(TAG, "建议：1. 在执行 Type 操作前先执行 Tap 操作点击输入框")
            Log.w(TAG, "     2. 确保输入框已获得焦点")
            Log.w(TAG, "     3. 如果问题持续，系统将自动使用 ADB 回退")
            false
        } catch (e: Exception) {
            Log.e(TAG, "文本输入异常", e)
            Log.e(TAG, "异常信息: ${e.message}")
            e.printStackTrace()
            false
        }
    }

    /**
     * 执行返回操作
     */
    fun performBack(): Boolean {
        return performGlobalAction(GLOBAL_ACTION_BACK)
    }

    /**
     * 执行Home操作（回到桌面）
     */
    fun performHome(): Boolean {
        return performGlobalAction(GLOBAL_ACTION_HOME)
    }

    /**
     * 获取屏幕截图
     */
    fun captureScreen(): Bitmap? {
        return screenshotHandler.captureScreen(mediaProjection)
    }

    /**
     * 获取根节点信息
     */
    fun getRootNodeInfo(): AccessibilityNodeInfo? {
        return rootInActiveWindow
    }

    /**
     * 根据文本查找节点
     */
    fun findNodeByText(text: String): AccessibilityNodeInfo? {
        val rootNode = rootInActiveWindow ?: return null
        return findNodeByTextRecursive(rootNode, text)
    }

    private fun findNodeByTextRecursive(
        node: AccessibilityNodeInfo,
        text: String
    ): AccessibilityNodeInfo? {
        if (node.text?.toString()?.contains(text) == true) {
            return node
        }
        
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val found = findNodeByTextRecursive(child, text)
            if (found != null) {
                return found
            }
        }
        
        return null
    }
}

