package com.awesomeproject.lanmcp

/** A bounded HTTP request as seen by the router. */
data class HttpBodyRead(
    val bytes: ByteArray,
    val declaredLength: Long?,
    val contentLengthValid: Boolean,
    val tooLarge: Boolean,
    val incomplete: Boolean,
    val unsupportedTransferEncoding: Boolean,
) {
    companion object {
        /**
         * The header-derived view of a request whose body has deliberately NOT been read.
         * Used for the early gate: everything here is decidable before a single body byte
         * is consumed, so a refused request never pays for the body.
         */
        fun headersOnly(
            declaredLength: Long?,
            contentLengthValid: Boolean,
            unsupportedTransferEncoding: Boolean,
        ): HttpBodyRead = HttpBodyRead(
            bytes = ByteArray(0),
            declaredLength = declaredLength,
            contentLengthValid = contentLengthValid,
            tooLarge = declaredLength != null && declaredLength > HttpGate.MAX_BODY_BYTES,
            incomplete = false,
            unsupportedTransferEncoding = unsupportedTransferEncoding,
        )
    }
}

data class HttpRequestInfo(
    val method: String,
    val path: String,
    val hostHeader: String?,
    val originHeader: String?,
    val authorizationHeader: String?,
    val contentTypeHeader: String?,
    val acceptHeader: String?,
    val protocolVersionHeader: String?,
    val body: HttpBodyRead,
)

/** A concrete HTTP reply. [headers] are added verbatim; no CORS header is ever added. */
data class HttpReply(
    val status: Int,
    val mimeType: String,
    val body: ByteArray,
    val headers: Map<String, String>,
) {
    val bodyText: String get() = String(body, Charsets.UTF_8)

    companion object {
        fun json(status: Int, payload: Map<String, Any?>, extraHeaders: Map<String, String> = emptyMap()): HttpReply =
            HttpReply(status, "application/json; charset=utf-8", Jsons.writeBytes(payload), extraHeaders)

        fun empty(status: Int, extraHeaders: Map<String, String> = emptyMap()): HttpReply =
            HttpReply(status, "text/plain; charset=utf-8", ByteArray(0), extraHeaders)

        /** HTTP-level failure (not a JSON-RPC error): `{"error":code,"message":...}`. */
        fun httpError(
            status: Int,
            code: String,
            message: String,
            extraHeaders: Map<String, String> = emptyMap(),
        ): HttpReply = json(status, Jsons.obj("error" to code, "message" to message), extraHeaders)

        fun closeConnection(): Map<String, String> = mapOf("Connection" to "close")
    }
}

/**
 * HTTP policy and MCP dispatch for `POST /mcp`, split into an **early gate** and the
 * remaining work.
 *
 * [preflight] decides everything that does not need the request body, in this fixed order:
 *   1. service running                      -> 503
 *   2. any Origin header                    -> 403 (no CORS surface at all)
 *   3. Host must equal bindAddress:port     -> 400 when absent, 403 when different
 *   4. path must be exactly /mcp            -> 404
 *   5. method must be POST                  -> 405 (Allow: POST)
 *   6. declared content type must be JSON   -> 415
 *   7. Accept must permit JSON              -> 406
 *   8. bounded body framing/size            -> 400 / 413
 *   9. Bearer auth (constant time)          -> 401
 *  10. MCP-Protocol-Version header          -> 400 when unsupported
 *
 * The server calls [preflight] before reading a body, so a refused request consumes no
 * body bytes and no capture/concurrency budget. Because the body is then left unread,
 * **every** reply produced by the early gate asks for `Connection: close` — otherwise the
 * unconsumed body would be parsed as a pipelined request.
 *
 * [handle] re-runs the same gate (single source of truth) for callers that already have a
 * body, then applies the post-read checks:
 *  11. short body                           -> 400
 *  12. bounded concurrency                  -> 429 (rejected, never queued)
 *  13. MCP protocol                         -> 200 / 202 / 400
 *
 * Step 5 means an unauthenticated GET receives 405; it exposes no data and no MCP payload
 * is ever processed without auth.
 */
class LanMcpHttpRouter(
    private val config: ServerConfig,
    private val protocol: McpProtocol,
    private val concurrency: ConcurrencyGate,
    private val authenticate: (String?) -> BearerAuth.Verdict,
    private val isRunning: () -> Boolean,
) {

    data class ServerConfig(val bindAddress: String, val port: Int)

    /**
     * Body-independent gate. Returns the refusal reply, or null when the request may
     * proceed to the body read.
     */
    fun preflight(request: HttpRequestInfo): HttpReply? = cheapRefusal(request)

    fun handle(request: HttpRequestInfo, dispatchGeneration: Long): HttpReply {
        cheapRefusal(request)?.let { return it }

        // Post-read check: only knowable after the body bytes were consumed.
        if (request.body.incomplete) {
            return refusal(
                400,
                Codes.HTTP_INCOMPLETE_BODY,
                "the request body ended before Content-Length bytes were received",
            )
        }

        if (!concurrency.tryAcquire()) {
            return HttpReply.httpError(
                429,
                Codes.HTTP_TOO_MANY_REQUESTS,
                "too many concurrent requests; requests are refused rather than queued",
                mapOf("Retry-After" to "1"),
            )
        }
        try {
            val bodyText = String(request.body.bytes, Charsets.UTF_8)
            return when (val reply = protocol.handle(bodyText, dispatchGeneration)) {
                is ProtocolReply.Accepted -> HttpReply.empty(202)
                is ProtocolReply.Body -> HttpReply.json(reply.status, reply.payload)
            }
        } catch (error: Throwable) {
            return HttpReply.httpError(500, Codes.HTTP_INTERNAL_ERROR, "internal error")
        } finally {
            concurrency.release()
        }
    }

    private fun cheapRefusal(request: HttpRequestInfo): HttpReply? {
        if (!isRunning()) {
            return refusal(503, Codes.HTTP_SERVICE_NOT_RUNNING, "the LAN MCP service is not running")
        }
        if (HttpGate.originRejected(request.originHeader)) {
            return refusal(
                403,
                Codes.HTTP_FORBIDDEN_ORIGIN,
                "requests carrying an Origin header are refused; this endpoint serves MCP clients only",
            )
        }
        if (!HttpGate.hostMatches(request.hostHeader, config.bindAddress, config.port)) {
            return if (request.hostHeader.isNullOrBlank()) {
                refusal(400, Codes.HTTP_HOST_REQUIRED, "the Host header is required")
            } else {
                refusal(
                    403,
                    Codes.HTTP_HOST_MISMATCH,
                    "the Host header does not match the bound address ${config.bindAddress}:${config.port}",
                )
            }
        }
        if (!HttpGate.pathMatches(request.path)) {
            return refusal(404, Codes.HTTP_NOT_FOUND, "only ${HttpGate.MCP_PATH} is served")
        }
        if (request.method != "POST") {
            return refusal(
                405,
                Codes.HTTP_METHOD_NOT_ALLOWED,
                "only POST is supported; this server has no GET/SSE stream and no DELETE session",
                mapOf("Allow" to "POST"),
            )
        }
        if (!HttpGate.contentTypeIsJson(request.contentTypeHeader)) {
            return refusal(415, Codes.HTTP_UNSUPPORTED_MEDIA_TYPE, "Content-Type must be application/json")
        }
        if (!HttpGate.acceptAllowsJson(request.acceptHeader)) {
            return refusal(406, Codes.HTTP_NOT_ACCEPTABLE, "only application/json responses are produced")
        }
        if (request.body.unsupportedTransferEncoding) {
            return refusal(
                400,
                Codes.HTTP_UNSUPPORTED_TRANSFER_ENCODING,
                "only identity or absent Transfer-Encoding is supported",
            )
        }
        if (!request.body.contentLengthValid) {
            return refusal(
                400,
                Codes.HTTP_INVALID_CONTENT_LENGTH,
                "Content-Length must be a non-negative decimal number",
            )
        }
        if (request.body.tooLarge || request.body.bytes.size > HttpGate.MAX_BODY_BYTES) {
            return refusal(
                413,
                Codes.HTTP_PAYLOAD_TOO_LARGE,
                "request bodies are limited to ${HttpGate.MAX_BODY_BYTES} bytes",
            )
        }
        if (authenticate(request.authorizationHeader) != BearerAuth.Verdict.Authorized) {
            return refusal(
                401,
                Codes.HTTP_UNAUTHORIZED,
                "a valid Bearer connection code is required",
                mapOf("WWW-Authenticate" to "Bearer realm=\"$REALM\""),
            )
        }
        val headerVersion = request.protocolVersionHeader
        if (headerVersion != null && !McpVersions.isSupported(headerVersion)) {
            return refusal(
                400,
                Codes.HTTP_UNSUPPORTED_PROTOCOL_VERSION,
                "unsupported MCP-Protocol-Version: $headerVersion " +
                    "(supported: ${McpVersions.SUPPORTED.joinToString(", ")})",
            )
        }
        return null
    }

    /**
     * Every early-gate refusal leaves the request body unread, so the connection must be
     * closed rather than reused; the same is true of a short body.
     */
    private fun refusal(
        status: Int,
        code: String,
        message: String,
        extraHeaders: Map<String, String> = emptyMap(),
    ): HttpReply {
        val headers = LinkedHashMap<String, String>(extraHeaders)
        headers["Connection"] = "close"
        return HttpReply.httpError(status, code, message, headers)
    }

    private companion object {
        const val REALM = "lan-mcp"
    }
}
