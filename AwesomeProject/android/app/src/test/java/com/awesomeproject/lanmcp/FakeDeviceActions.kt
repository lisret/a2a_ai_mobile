package com.awesomeproject.lanmcp

/** Configurable, in-memory [DeviceActions] used by the JVM tests. No Android involved. */
class FakeDeviceActions(
    var accessibility: Boolean = true,
    var locked: Boolean = false,
    var size: IntArray? = intArrayOf(1080, 2400),
    var rotation: Int = 0,
    var screen: CapturedScreen? = CapturedScreen(byteArrayOf(1, 2, 3), 1080, 2400),
    var tapResult: Boolean = true,
    var swipeResult: Boolean = true,
    var typeResult: Boolean = true,
    var keyResult: Boolean = true,
    /** Test hook invoked inside [tap] to simulate state changes mid-dispatch (e.g. a stop). */
    var onTap: (() -> Unit)? = null,
    /** Test hook invoked inside [captureScreen]. */
    var onCapture: (() -> Unit)? = null,
) : DeviceActions {

    var tapCalls: Int = 0
        private set
    var swipeCalls: Int = 0
        private set
    var typeCalls: Int = 0
        private set
    var keyCalls: Int = 0
        private set
    var captureCalls: Int = 0
        private set

    var lastKey: String? = null
        private set
    var lastText: String? = null
        private set

    override fun accessibilityConnected(): Boolean = accessibility

    override fun isDeviceLocked(): Boolean = locked

    override fun displaySize(): IntArray? = size

    override fun rotationDegrees(): Int = rotation

    override fun captureScreen(): CapturedScreen? {
        captureCalls++
        onCapture?.invoke()
        return screen
    }

    override fun tap(x: Int, y: Int): Boolean {
        tapCalls++
        onTap?.invoke()
        return tapResult
    }

    override fun swipe(startX: Int, startY: Int, endX: Int, endY: Int, durationMs: Int): Boolean {
        swipeCalls++
        return swipeResult
    }

    override fun typeText(text: String): Boolean {
        typeCalls++
        lastText = text
        return typeResult
    }

    override fun globalKey(key: String): Boolean {
        keyCalls++
        lastKey = key
        return keyResult
    }
}
