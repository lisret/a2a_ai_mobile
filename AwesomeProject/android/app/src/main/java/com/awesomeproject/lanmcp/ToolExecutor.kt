package com.awesomeproject.lanmcp

/**
 * One MCP tool result: a list of MCP content blocks plus the `isError` flag.
 *
 * Every tool-level problem (bad arguments, busy device, locked device, missing
 * accessibility permission, local task running, stop during execution) is reported
 * in-band with `isError = true`; it never becomes a JSON-RPC transport error.
 */
data class ToolResult(val content: List<Map<String, Any?>>, val isError: Boolean) {
    companion object {
        fun text(text: String, isError: Boolean = false): ToolResult =
            ToolResult(listOf(Jsons.obj("type" to "text", "text" to text)), isError)

        fun failure(code: String, message: String): ToolResult =
            text(ToolErrors.payload(code, message), true)

        fun image(data: String, mimeType: String): ToolResult =
            ToolResult(listOf(Jsons.obj("type" to "image", "data" to data, "mimeType" to mimeType)), false)
    }
}

/**
 * Executes validated tool invocations against [DeviceActions].
 *
 * Guarantees encoded here:
 *  - every device-touching tool (screenshot included) takes the single action slot, so
 *    captures and gestures can never overlap: no concurrent screenshots, no capture
 *    during a gesture, and therefore no stacked full-resolution bitmaps;
 *  - device-touching tools are refused (never queued) while a local automation task is
 *    running, while the device is locked, and while accessibility is unavailable;
 *  - execution happens inside [StopGeneration.runIfCurrent], which holds the dispatch
 *    boundary across the platform call, so a stop cannot slip between the generation
 *    check and the dispatch;
 *  - no result ever claims an executed action can be undone. Successful mutations report
 *    `"reversible": false`; a refusal reports `"dispatched": false`.
 *
 * Read-only status is always available and never touches the device.
 */
class ToolExecutor(
    private val actions: DeviceActions,
    private val serializer: ActionSerializer,
    private val generation: StopGeneration,
    private val base64: (ByteArray) -> String,
    private val localTaskRunning: () -> Boolean,
) {

    fun execute(invocation: ToolInvocation, dispatchGeneration: Long): ToolResult = try {
        when (invocation) {
            is ToolInvocation.PhoneStatus -> status()
            is ToolInvocation.PhoneScreenshot -> screenshot(dispatchGeneration)
            is ToolInvocation.Tap -> tap(invocation, dispatchGeneration)
            is ToolInvocation.Swipe -> swipe(invocation, dispatchGeneration)
            is ToolInvocation.TypeText -> typeText(invocation, dispatchGeneration)
            is ToolInvocation.Key -> key(invocation, dispatchGeneration)
        }
    } catch (error: Throwable) {
        ToolResult.failure(Codes.INTERNAL, "tool execution failed: ${error.javaClass.simpleName}")
    }

    private fun status(): ToolResult {
        val size = actions.displaySize()
        return ToolResult.text(
            Jsons.write(
                Jsons.obj(
                    "serviceRunning" to generation.isRunning(),
                    "accessibilityConnected" to actions.accessibilityConnected(),
                    "deviceLocked" to actions.isDeviceLocked(),
                    "localTaskRunning" to localTaskRunning(),
                    "displayWidth" to (size?.getOrNull(0)),
                    "displayHeight" to (size?.getOrNull(1)),
                    "rotationDegrees" to actions.rotationDegrees(),
                    "transport" to "lan-http",
                    "reversibleActions" to false,
                ),
            ),
        )
    }

    /**
     * Screen capture is a device-touching operation: it needs accessibility, an unlocked
     * device and the single action slot, and it is discarded if the service stops while
     * the frame is being produced.
     */
    private fun screenshot(dispatchGeneration: Long): ToolResult {
        guardDeviceAccess(dispatchGeneration)?.let { return it }
        val size = actions.displaySize()
        if (size == null || size.size < 2 || size[0] <= 0 || size[1] <= 0) {
            return ToolResult.failure(Codes.DISPLAY_UNKNOWN, "the display size could not be determined")
        }
        return serialized(
            dispatchGeneration = dispatchGeneration,
            refusedMessage = "the LAN MCP service stopped before capture; no frame was taken",
        ) {
            val captured = actions.captureScreen()
            if (captured == null) {
                ToolResult.failure(Codes.SCREENSHOT_FAILED, "screen capture failed or returned no frame")
            } else if (!generation.isCurrent(dispatchGeneration)) {
                // A capture is not a device action: a frame produced after revocation is simply
                // discarded rather than handed to a client whose session was revoked.
                ToolResult.failure(
                    Codes.SERVICE_STOPPED,
                    "the LAN MCP service stopped during capture; the frame was discarded",
                )
            } else {
                val meta = Jsons.write(
                    Jsons.obj(
                        "width" to captured.width,
                        "height" to captured.height,
                        "mimeType" to "image/png",
                        "note" to "phone_tap and phone_swipe coordinates refer to this image's orientation and dimensions",
                    ),
                )
                ToolResult(
                    content = listOf(
                        Jsons.obj("type" to "text", "text" to meta),
                        Jsons.obj("type" to "image", "data" to base64(captured.png), "mimeType" to "image/png"),
                    ),
                    isError = false,
                )
            }
        }
    }

    private fun tap(invocation: ToolInvocation.Tap, dispatchGeneration: Long): ToolResult {
        guardDeviceAccess(dispatchGeneration)?.let { return it }
        boundsCheck(invocation.x, invocation.y)?.let { return it }
        return serialized(dispatchGeneration, DISPATCH_REFUSED) {
            val ok = actions.tap(invocation.x, invocation.y)
            mutationResult("tap", ok, Jsons.obj("x" to invocation.x, "y" to invocation.y))
        }
    }

    private fun swipe(invocation: ToolInvocation.Swipe, dispatchGeneration: Long): ToolResult {
        guardDeviceAccess(dispatchGeneration)?.let { return it }
        boundsCheck(invocation.startX, invocation.startY)?.let { return it }
        boundsCheck(invocation.endX, invocation.endY)?.let { return it }
        return serialized(dispatchGeneration, DISPATCH_REFUSED) {
            val ok = actions.swipe(
                invocation.startX,
                invocation.startY,
                invocation.endX,
                invocation.endY,
                invocation.durationMs,
            )
            mutationResult(
                "swipe",
                ok,
                Jsons.obj(
                    "startX" to invocation.startX,
                    "startY" to invocation.startY,
                    "endX" to invocation.endX,
                    "endY" to invocation.endY,
                    "durationMs" to invocation.durationMs,
                ),
            )
        }
    }

    private fun typeText(invocation: ToolInvocation.TypeText, dispatchGeneration: Long): ToolResult {
        guardDeviceAccess(dispatchGeneration)?.let { return it }
        return serialized(dispatchGeneration, DISPATCH_REFUSED) {
            val ok = actions.typeText(invocation.text)
            // Only the length is reported; the typed text never appears in any payload or log.
            mutationResult("type", ok, Jsons.obj("characters" to invocation.text.length))
        }
    }

    private fun key(invocation: ToolInvocation.Key, dispatchGeneration: Long): ToolResult {
        guardDeviceAccess(dispatchGeneration)?.let { return it }
        return serialized(dispatchGeneration, DISPATCH_REFUSED) {
            val ok = actions.globalKey(invocation.key)
            mutationResult("key", ok, Jsons.obj("key" to invocation.key))
        }
    }

    /**
     * Cheap, non-locking pre-checks that fail fast before the single action slot is taken.
     * The authoritative generation check happens again inside the dispatch boundary.
     */
    private fun guardDeviceAccess(dispatchGeneration: Long): ToolResult? {
        if (!generation.isCurrent(dispatchGeneration)) {
            return ToolResult.failure(
                Codes.SERVICE_STOPPED,
                "the LAN MCP service is not running for this request; nothing was dispatched",
            )
        }
        if (localTaskRunning()) {
            return ToolResult.failure(
                Codes.TASK_RUNNING,
                "a local automation task holds control of the device; nothing was dispatched",
            )
        }
        if (!actions.accessibilityConnected()) {
            return ToolResult.failure(
                Codes.NO_ACCESSIBILITY,
                "accessibility service is not connected; enable it in system settings before sending device actions",
            )
        }
        if (actions.isDeviceLocked()) {
            return ToolResult.failure(
                Codes.DEVICE_LOCKED,
                "the device is locked; unlock it before capturing the screen or sending device actions",
            )
        }
        return null
    }

    private fun boundsCheck(x: Int, y: Int): ToolResult? {
        val size = actions.displaySize()
        if (size == null || size.size < 2 || size[0] <= 0 || size[1] <= 0) {
            return ToolResult.failure(Codes.DISPLAY_UNKNOWN, "the display size could not be determined")
        }
        if (x >= size[0] || y >= size[1]) {
            return ToolResult.failure(
                Codes.OUT_OF_BOUNDS,
                "coordinate ($x, $y) is outside the current display ${size[0]}x${size[1]}",
            )
        }
        return null
    }

    /**
     * Takes the single action slot, then runs [body] inside
     * [StopGeneration.runIfCurrent] so the generation check and the platform dispatch are
     * atomic with respect to a concurrent stop. The slot is always released.
     */
    private fun serialized(dispatchGeneration: Long, refusedMessage: String, body: () -> ToolResult): ToolResult {
        if (!serializer.tryAcquire()) {
            return ToolResult.failure(
                Codes.TASK_RUNNING,
                "another device action or capture is already running; this request was refused rather than queued",
            )
        }
        try {
            return generation.runIfCurrent(
                captured = dispatchGeneration,
                refused = { ToolResult.failure(Codes.SERVICE_STOPPED, refusedMessage) },
                body = body,
            )
        } finally {
            serializer.release()
        }
    }

    private fun mutationResult(action: String, ok: Boolean, details: Map<String, Any?>): ToolResult {
        val payload = LinkedHashMap<String, Any?>(details)
        payload["action"] = action
        payload["dispatched"] = ok
        // Explicit: an action already handed to the platform cannot be rolled back.
        payload["reversible"] = false
        if (!ok) {
            payload["code"] = Codes.ACTION_FAILED
            payload["message"] = "the $action action was not completed by the accessibility service"
            return ToolResult.text(Jsons.write(payload), true)
        }
        return ToolResult.text(Jsons.write(payload))
    }

    private companion object {
        const val DISPATCH_REFUSED =
            "the LAN MCP service stopped before dispatch; nothing was dispatched"
    }
}
