package com.awesomeproject.lanmcp

/**
 * Process-wide LAN MCP service state, shared between the foreground service and the
 * React Native module. It never holds the connection code and never exposes it:
 * [snapshot] contains only `codeConfigured`, never the code itself.
 */
object LanMcpState {

    @Volatile
    var running: Boolean = false
        internal set

    @Volatile
    var endpoint: String? = null
        internal set

    @Volatile
    var bindAddress: String? = null
        internal set

    @Volatile
    var lastMessage: String? = null
        internal set

    /** Stable code for the most recent failure, used to reject promise calls precisely. */
    @Volatile
    var lastErrorCode: String? = null
        internal set

    val generation = StopGeneration()
    val actionSerializer = ActionSerializer()

    fun reset(code: String?, message: String) {
        running = false
        endpoint = null
        bindAddress = null
        lastErrorCode = code
        lastMessage = message
    }

    @Synchronized
    fun beginStart(): Long = generation.markStarted()

    @Synchronized
    fun cancelStart() {
        generation.markStopped()
        running = false
    }

    /** Publication and timeout revocation share a monitor: neither can revive the other. */
    @Synchronized
    fun markRunningIfCurrent(captured: Long, address: String, port: Int): Boolean {
        if (!generation.isCurrent(captured)) return false
        markRunning(address, port)
        return true
    }

    private fun markRunning(address: String, port: Int) {
        bindAddress = address
        endpoint = LanNetwork.endpointFor(address, port)
        lastErrorCode = null
        lastMessage = null
        running = true
    }

    /**
     * Exact `getStatus()` payload: `{running, endpoint, codeConfigured, message?}`.
     * The optional `message` is present only when there is something to report.
     */
    fun snapshot(codeConfigured: Boolean): LinkedHashMap<String, Any?> {
        val payload = LinkedHashMap<String, Any?>()
        payload["running"] = running
        payload["endpoint"] = if (running) endpoint else null
        payload["codeConfigured"] = codeConfigured
        lastMessage?.let { payload["message"] = it }
        if (!running && DeviceControlOwnership.remoteActive()) {
            payload["message"] = "正在停止，等待已受理动作结束。"
        }
        return payload
    }
}
