package com.awesomeproject.lanmcp

/** A captured screen frame: encoded bytes plus the exact pixel dimensions of the frame. */
data class CapturedScreen(val png: ByteArray, val width: Int, val height: Int)

/**
 * Everything the MCP tools are allowed to do on the device.
 *
 * The production implementation is `AccessibilityDeviceActions`, which uses ONLY the
 * existing accessibility service (screenshot, gesture dispatch, global actions, text
 * input). There is no shell, no arbitrary file access and no ADB path here.
 */
interface DeviceActions {
    fun accessibilityConnected(): Boolean
    fun isDeviceLocked(): Boolean

    /** Current display size in the current orientation, or null when unavailable. */
    fun displaySize(): IntArray?

    /** Display rotation in degrees (0/90/180/270). */
    fun rotationDegrees(): Int

    /** Capture the screen, or null when capture failed. Read-only. */
    fun captureScreen(): CapturedScreen?

    fun tap(x: Int, y: Int): Boolean
    fun swipe(startX: Int, startY: Int, endX: Int, endY: Int, durationMs: Int): Boolean
    fun typeText(text: String): Boolean

    /** Global navigation key: "back" or "home". */
    fun globalKey(key: String): Boolean
}

/** Common shape of an MCP tool error payload. */
object ToolErrors {
    fun payload(code: String, message: String): String = Jsons.write(
        Jsons.obj(
            "code" to code,
            "message" to message,
        ),
    )
}
