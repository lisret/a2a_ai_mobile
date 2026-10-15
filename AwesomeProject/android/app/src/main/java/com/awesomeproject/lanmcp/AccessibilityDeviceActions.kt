package com.awesomeproject.lanmcp

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import android.view.accessibility.AccessibilityNodeInfo
import com.awesomeproject.service.AutoGLMAccessibilityService
import java.io.ByteArrayOutputStream

/**
 * [DeviceActions] implemented strictly on top of the existing accessibility service.
 *
 * Reused pre-existing code paths: `AutoGLMAccessibilityService.captureScreen()` (which
 * selects `takeScreenshot` on Android 11+ and MediaProjection below), `performClick`,
 * `performSwipe`, `performBack` and `performHome`. No shell command, no file API and no
 * ADB fallback is used anywhere in this class.
 *
 * Two deliberate deviations from the in-app helpers:
 *  - text input does NOT use `performTextInput`, which logs the plaintext and copies it to
 *    the clipboard; MCP uses `ACTION_SET_TEXT` on the focused editable node instead, with
 *    no content logging and no clipboard side effect;
 *  - the keyguard probe is fail-closed: if the lock state cannot be read it reports
 *    "locked", so capture/gestures are refused rather than allowed by accident.
 */
class AccessibilityDeviceActions(private val context: Context) : DeviceActions {

    override fun accessibilityConnected(): Boolean =
        try {
            AutoGLMAccessibilityService.getInstance() != null
        } catch (error: Exception) {
            false
        }

    /**
     * Fail-closed: an unavailable keyguard service or a failing probe is reported as
     * "locked", so the caller refuses the operation instead of assuming it is unlocked.
     */
    override fun isDeviceLocked(): Boolean {
        return try {
            val manager = context.getSystemService(Context.KEYGUARD_SERVICE) as? android.app.KeyguardManager
                ?: return true
            manager.isKeyguardLocked
        } catch (error: Exception) {
            true
        }
    }

    @Suppress("DEPRECATION")
    override fun displaySize(): IntArray? {
        return try {
            val manager = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return null
            val metrics = DisplayMetrics()
            manager.defaultDisplay.getRealMetrics(metrics)
            if (metrics.widthPixels <= 0 || metrics.heightPixels <= 0) {
                null
            } else {
                intArrayOf(metrics.widthPixels, metrics.heightPixels)
            }
        } catch (error: Exception) {
            null
        }
    }

    @Suppress("DEPRECATION")
    override fun rotationDegrees(): Int {
        return try {
            val manager = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
            val rotation = manager?.defaultDisplay?.rotation ?: 0
            when (rotation) {
                1 -> 90
                2 -> 180
                3 -> 270
                else -> 0
            }
        } catch (error: Exception) {
            0
        }
    }

    override fun captureScreen(): CapturedScreen? {
        val service = AutoGLMAccessibilityService.getInstance() ?: return null
        val hardwareBitmap = try {
            service.captureScreen()
        } catch (error: Exception) {
            Log.e(TAG, "captureScreen failed", error)
            null
        } ?: return null

        var source: Bitmap = hardwareBitmap
        var software: Bitmap? = null
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && hardwareBitmap.config == Bitmap.Config.HARDWARE) {
                // Hardware bitmaps cannot be read back; copy once to a software bitmap
                // so PNG encoding reads real pixels.
                software = hardwareBitmap.copy(Bitmap.Config.ARGB_8888, false)
                if (software != null) source = software
            }
            val buffer = ByteArrayOutputStream()
            val compressed = source.compress(Bitmap.CompressFormat.PNG, 100, buffer)
            if (!compressed) return null
            CapturedScreen(buffer.toByteArray(), source.width, source.height)
        } catch (error: Exception) {
            Log.e(TAG, "PNG encoding failed", error)
            null
        } finally {
            try {
                if (software != null && software !== hardwareBitmap) software.recycle()
            } catch (_: Exception) {
            }
            try {
                hardwareBitmap.recycle()
            } catch (_: Exception) {
            }
        }
    }

    override fun tap(x: Int, y: Int): Boolean = gesture(x, y, x, y, 100)

    override fun swipe(startX: Int, startY: Int, endX: Int, endY: Int, durationMs: Int): Boolean =
        gesture(startX, startY, endX, endY, durationMs)

    // Called on a HTTP worker. Wait for platform completion even when socket shutdown
    // interrupts this worker, so the ownership slot cannot be reused during a live gesture.
    private fun gesture(x: Int, y: Int, endX: Int, endY: Int, duration: Int): Boolean = withService { service ->
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return@withService false
        val path = Path().apply {
            moveTo(x.toFloat(), y.toFloat())
            if (x != endX || y != endY) lineTo(endX.toFloat(), endY.toFloat())
        }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, duration.toLong())).build()
        val completed = CountDownLatch(1)
        val success = AtomicBoolean(false)
        if (!service.dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
            override fun onCompleted(description: GestureDescription?) { success.set(true); completed.countDown() }
            override fun onCancelled(description: GestureDescription?) { completed.countDown() }
        }, null)) return@withService false
        val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(duration.toLong() + 1000)
        var interrupted = false
        try {
            while (completed.count > 0) {
                val remaining = deadline - System.nanoTime()
                if (remaining <= 0) break
                try { completed.await(remaining, TimeUnit.NANOSECONDS) }
                catch (_: InterruptedException) { interrupted = true }
            }
            success.get()
        } finally {
            if (interrupted) Thread.currentThread().interrupt()
        }
    }

    override fun typeText(text: String): Boolean = withService { service -> setTextOnFocusedNode(service, text) }

    override fun globalKey(key: String): Boolean = withService { service ->
        when (key) {
            "back" -> service.performBack()
            "home" -> service.performHome()
            else -> false
        }
    }

    /**
     * MCP-safe text input: `ACTION_SET_TEXT` on the focused editable node only.
     *
     * No clipboard use, no plaintext in logs or exceptions — failures are reported by
     * return value and only the node/permission facts are logged.
     */
    private fun setTextOnFocusedNode(service: AutoGLMAccessibilityService, text: String): Boolean {
        val root = try {
            service.rootInActiveWindow
        } catch (error: Exception) {
            Log.e(TAG, "text input: active window unavailable")
            null
        } ?: run {
            Log.w(TAG, "text input refused: no active window")
            return false
        }
        var focused: AccessibilityNodeInfo? = null
        return try {
            focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            if (focused == null) {
                Log.w(TAG, "text input refused: no focused input node")
                return false
            }
            if (!focused.isEditable) {
                Log.w(TAG, "text input refused: focused node is not editable")
                return false
            }
            val arguments = Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }
            focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
        } catch (error: Exception) {
            // Never include the text or the node dump in the log.
            Log.e(TAG, "text input failed: ${error.javaClass.simpleName}")
            false
        } finally {
            recycleQuietly(focused)
            recycleQuietly(root)
        }
    }

    @Suppress("DEPRECATION")
    private fun recycleQuietly(node: AccessibilityNodeInfo?) {
        try {
            node?.recycle()
        } catch (_: Exception) {
        }
    }

    private inline fun withService(body: (AutoGLMAccessibilityService) -> Boolean): Boolean {
        val service = AutoGLMAccessibilityService.getInstance() ?: return false
        return try {
            body(service)
        } catch (error: Exception) {
            Log.e(TAG, "accessibility action failed", error)
            false
        }
    }

    private companion object {
        const val TAG = "LanMcpDeviceActions"
    }
}
