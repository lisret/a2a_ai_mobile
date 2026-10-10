package com.awesomeproject.lanmcp

/**
 * Outcome of handling one parsed HTTP request body.
 *
 *  - [Accepted]  -> HTTP 202 with an empty body (notification, nothing executed)
 *  - [Body]      -> HTTP [Body.status] with the JSON-RPC payload: 200 for results and
 *                   JSON-RPC errors from a well-formed request, 400 for a body the
 *                   server refuses before dispatch (unparseable JSON, batch array)
 */
sealed class ProtocolReply {
    object Accepted : ProtocolReply()
    data class Body(val status: Int, val payload: Map<String, Any?>) : ProtocolReply()
}

/**
 * Stateless Streamable-HTTP MCP server core (revisions 2025-11-25 / 2025-06-18 /
 * 2025-03-26).
 *
 * Supported methods: `initialize`, `ping`, `tools/list`, `tools/call`. Any notification
 * method whose name starts with `notifications/` (including `notifications/initialized`)
 * and any request without an `id` is accepted as a notification and NEVER executed.
 * Batches are refused (removed from the MCP revision this server pins). Unknown methods
 * answer with a JSON-RPC `-32601`. `initialize` negotiates down to a supported revision
 * instead of failing. There is no server-to-client request feature and no session state:
 * every request is self-contained.
 */
class McpProtocol(
    private val serverName: String = "awesomeproject-lan-mcp",
    private val serverVersion: String = "1.0.0",
    private val executor: ToolExecutor,
) {

    fun handle(text: String, dispatchGeneration: Long): ProtocolReply {
        val parsed = try {
            Jsons.parse(text)
        } catch (error: JsonException) {
            return rejected(null, Codes.RPC_PARSE_ERROR, "Parse error: ${error.message}")
        }
        if (parsed is List<*>) {
            return rejected(null, Codes.RPC_INVALID_REQUEST, "Batch requests are not supported")
        }
        val request = parsed as? Map<String, Any?>
            ?: return body(null, Codes.RPC_INVALID_REQUEST, "Request must be a JSON object")

        val id = request["id"]
        if (id != null && id !is String && id !is Long && id !is Double) {
            return body(null, Codes.RPC_INVALID_REQUEST, "Request id must be a string or a number")
        }
        if (request["jsonrpc"] != "2.0") {
            return body(id, Codes.RPC_INVALID_REQUEST, "jsonrpc must be exactly \"2.0\"")
        }
        val method = request["method"] as? String
        if (method.isNullOrEmpty()) {
            return body(id, Codes.RPC_INVALID_REQUEST, "method must be a non-empty string")
        }
        val rawParams = request["params"]
        if (rawParams != null && rawParams !is Map<*, *>) {
            return body(id, Codes.RPC_INVALID_PARAMS, "params must be a JSON object")
        }
        val params: Map<String, Any?> = (rawParams as? Map<String, Any?>) ?: emptyMap()

        // Notifications are never executed and never answered.
        if (method.startsWith("notifications/")) return ProtocolReply.Accepted
        if (id == null) return ProtocolReply.Accepted

        return when (method) {
            "initialize" -> initialize(id, params)
            "ping" -> ok(id, Jsons.obj())
            "tools/list" -> ok(id, Jsons.obj("tools" to ToolCatalog.describe()))
            "tools/call" -> callTool(id, params, dispatchGeneration)
            else -> body(id, Codes.RPC_METHOD_NOT_FOUND, "Method not found: $method")
        }
    }

    /**
     * `initialize` never fails on a revision mismatch. An unsupported (including newer)
     * requested revision is negotiated to the latest revision this server speaks, as the
     * MCP lifecycle requires the server to answer with a revision it supports; only a
     * malformed (non-string) value is a JSON-RPC invalid-params error.
     */
    private fun initialize(id: Any?, params: Map<String, Any?>): ProtocolReply {
        val rawVersion = params["protocolVersion"]
        if (rawVersion != null && rawVersion !is String) {
            return ProtocolReply.Body(
                400,
                errorPayload(id, Codes.RPC_INVALID_PARAMS, "protocolVersion must be a string", null),
            )
        }
        val negotiated = McpVersions.negotiate(rawVersion as? String)
        return ProtocolReply.Body(
            200,
            Jsons.obj(
                "jsonrpc" to "2.0",
                "id" to id,
                "result" to Jsons.obj(
                    "protocolVersion" to negotiated,
                    "capabilities" to Jsons.obj("tools" to Jsons.obj("listChanged" to false)),
                    "serverInfo" to Jsons.obj("name" to serverName, "version" to serverVersion),
                    "instructions" to INSTRUCTIONS,
                ),
            ),
        )
    }

    private fun callTool(id: Any?, params: Map<String, Any?>, dispatchGeneration: Long): ProtocolReply {
        val name = params["name"] as? String
        if (name.isNullOrEmpty()) {
            return ProtocolReply.Body(
                200,
                resultPayload(id, ToolResult.failure(Codes.INVALID_PARAMS, "tools/call requires a tool name")),
            )
        }
        val rawArguments = params["arguments"]
        if (rawArguments != null && rawArguments !is Map<*, *>) {
            return ProtocolReply.Body(
                200,
                resultPayload(id, ToolResult.failure(Codes.INVALID_PARAMS, "arguments must be a JSON object")),
            )
        }
        val arguments: Map<String, Any?> = (rawArguments as? Map<String, Any?>) ?: emptyMap()
        val result = when (val resolution = ToolCatalog.resolve(name, arguments)) {
            is ToolResolution.Invalid -> ToolResult.failure(resolution.code, resolution.message)
            is ToolResolution.Valid -> executor.execute(resolution.invocation, dispatchGeneration)
        }
        return ProtocolReply.Body(200, resultPayload(id, result))
    }

    private fun ok(id: Any?, result: Map<String, Any?>): ProtocolReply =
        ProtocolReply.Body(200, Jsons.obj("jsonrpc" to "2.0", "id" to id, "result" to result))

    /** A structurally valid JSON-RPC request with a JSON-RPC error: HTTP 200. */
    private fun body(id: Any?, code: Int, message: String): ProtocolReply =
        ProtocolReply.Body(200, errorPayload(id, code, message, null))

    /**
     * A request refused before JSON-RPC dispatch (unparseable body, batch array):
     * HTTP 400 with a JSON-RPC error carrying the offending id when one exists.
     */
    private fun rejected(id: Any?, code: Int, message: String): ProtocolReply =
        ProtocolReply.Body(400, errorPayload(id, code, message, null))

    private fun errorPayload(id: Any?, code: Int, message: String, data: Map<String, Any?>?): Map<String, Any?> {
        val error = LinkedHashMap<String, Any?>()
        error["code"] = code.toLong()
        error["message"] = message
        if (data != null) error["data"] = data
        return Jsons.obj("jsonrpc" to "2.0", "id" to id, "error" to error)
    }

    private fun resultPayload(id: Any?, result: ToolResult): Map<String, Any?> = Jsons.obj(
        "jsonrpc" to "2.0",
        "id" to id,
        "result" to Jsons.obj(
            "content" to result.content,
            "isError" to result.isError,
        ),
    )

    companion object {
        const val INSTRUCTIONS =
            "Local LAN-only MCP server for this Android device. Every request needs " +
                "\"Authorization: Bearer <connection code>\". Tools control the device only through its " +
                "accessibility service; taps and swipes are not reversible. The transport is plain HTTP on a " +
                "trusted private Wi-Fi network and is not encrypted."
    }
}
