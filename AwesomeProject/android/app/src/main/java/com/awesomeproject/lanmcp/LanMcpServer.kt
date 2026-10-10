package com.awesomeproject.lanmcp

import fi.iki.elonen.NanoHTTPD
import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream
import java.util.Locale

/**
 * NanoHTTPD 2.3.1 adapter for the LAN MCP endpoint.
 *
 * This class contains NO protocol, auth or policy logic: it runs the router's early gate
 * from headers alone, reads a bounded body only when the gate lets the request through,
 * and converts the resulting [HttpReply] into a NanoHTTPD response. No hand-written HTTP
 * parsing exists anywhere in this module, and the body reader is capped at
 * [HttpGate.MAX_BODY_BYTES].
 *
 * The default NanoHTTPD runner would spawn one unbounded thread per accepted socket
 * before any of those limits apply, so a [BoundedRequestRunner] is installed instead:
 * at most [maxConcurrentConnections] handlers run at once, work is never queued, and a
 * rejected socket is closed immediately.
 */
class LanMcpServer(
    bindAddress: String,
    port: Int,
    private val router: LanMcpHttpRouter,
    private val dispatchGeneration: () -> Long,
    maxConcurrentConnections: Int = DEFAULT_MAX_CONNECTIONS,
) : NanoHTTPD(bindAddress, port) {

    private val connections = BoundedRequestRunner<NanoHTTPD.ClientHandler>(maxConcurrentConnections, THREAD_NAME)

    @Throws(IOException::class)
    fun startServer() {
        // Must be installed before start(): the runner is chosen while the listener starts.
        setAsyncRunner(NanoHttpdAsyncRunner())
        // daemon = true so the listener thread can never keep a dying process alive.
        start(NanoHTTPD.SOCKET_READ_TIMEOUT, true)
    }

    /**
     * Stops accepting requests and forcibly closes keep-alive sockets so the port is
     * released immediately rather than after the socket read timeout. Also shuts the
     * bounded runner down, so no handler thread outlives the server.
     */
    fun stopServer() {
        try {
            closeAllConnections()
        } catch (_: Throwable) {
        }
        try {
            stop()
        } catch (_: Throwable) {
        }
        connections.shutdown { closeHandlerQuietly(it) }
    }

    /** Diagnostics/tests: accepted handlers currently running. */
    fun activeConnections(): Int = connections.activeCount()

    override fun serve(session: NanoHTTPD.IHTTPSession?): NanoHTTPD.Response {
        val reply = try {
            if (session == null) {
                HttpReply.httpError(500, Codes.HTTP_INTERNAL_ERROR, "missing HTTP session")
            } else {
                val headers = readHeaders(session)
                val declared = HttpGate.parseContentLength(headers["content-length"])
                val headerOnly = headerOnlyRequest(
                    method = (session.method?.name ?: "GET").uppercase(Locale.US),
                    path = (session.uri ?: HttpGate.MCP_PATH).substringBefore('?'),
                    headers = headers,
                    declared = declared,
                )
                // Early gate: no body byte is consumed for a request that is already refused.
                val refusal = router.preflight(headerOnly)
                if (refusal != null) {
                    refusal
                } else {
                    router.handle(
                        headerOnly.copy(
                            body = readBody(session, headers["transfer-encoding"], declared),
                        ),
                        dispatchGeneration(),
                    )
                }
            }
        } catch (error: Throwable) {
            HttpReply.httpError(500, Codes.HTTP_INTERNAL_ERROR, "internal error")
        }
        return toNanoResponse(reply)
    }

    private fun toNanoResponse(reply: HttpReply): NanoHTTPD.Response {
        val status = NanoHTTPD.Response.Status.lookup(reply.status) ?: NanoHTTPD.Response.Status.INTERNAL_ERROR
        val response = NanoHTTPD.newFixedLengthResponse(
            status,
            reply.mimeType,
            ByteArrayInputStream(reply.body),
            reply.body.size.toLong(),
        )
        for ((name, value) in reply.headers) {
            response.addHeader(name, value)
        }
        response.addHeader("Cache-Control", "no-store")
        response.addHeader("X-Content-Type-Options", "nosniff")
        if (reply.headers["Connection"].equals("close", ignoreCase = true)) {
            response.closeConnection(true)
        }
        return response
    }

    private fun readHeaders(session: NanoHTTPD.IHTTPSession): Map<String, String> =
        session.headers ?: emptyMap()

    /** Builds the request view that carries the real method/path/headers but no body. */
    private fun headerOnlyRequest(
        method: String,
        path: String,
        headers: Map<String, String>,
        declared: ContentLength,
    ): HttpRequestInfo {
        return HttpRequestInfo(
            method = method,
            path = path,
            hostHeader = headers["host"],
            originHeader = headers["origin"],
            authorizationHeader = headers["authorization"],
            contentTypeHeader = headers["content-type"],
            acceptHeader = headers["accept"],
            protocolVersionHeader = headers["mcp-protocol-version"],
            body = HttpBodyRead.headersOnly(
                declaredLength = (declared as? ContentLength.Declared)?.value,
                contentLengthValid = declared !is ContentLength.Invalid,
                unsupportedTransferEncoding = !HttpGate.transferEncodingSupported(headers["transfer-encoding"]),
            ),
        )
    }

    /**
     * Reads at most [HttpGate.MAX_BODY_BYTES] bytes, honouring Content-Length exactly.
     * A declared oversized body is NOT drained (draining would be unbounded work); the
     * early gate answers 413 and the connection is closed.
     */
    private fun readBody(
        session: NanoHTTPD.IHTTPSession,
        transferEncoding: String?,
        declared: ContentLength,
    ): HttpBodyRead {
        if (!HttpGate.transferEncodingSupported(transferEncoding)) {
            return HttpBodyRead(ByteArray(0), null, true, false, false, true)
        }
        return when (declared) {
            is ContentLength.Absent -> HttpBodyRead(ByteArray(0), null, true, false, false, false)
            is ContentLength.Invalid -> HttpBodyRead(ByteArray(0), null, false, false, false, false)
            is ContentLength.Declared -> {
                if (declared.value < 0) {
                    HttpBodyRead(ByteArray(0), declared.value, false, false, false, false)
                } else if (declared.value > HttpGate.MAX_BODY_BYTES) {
                    HttpBodyRead(ByteArray(0), declared.value, true, true, false, false)
                } else {
                    val (bytes, complete) = readExactly(session.inputStream, declared.value.toInt())
                    HttpBodyRead(bytes, declared.value, true, false, !complete, false)
                }
            }
        }
    }

    private fun readExactly(stream: InputStream?, length: Int): Pair<ByteArray, Boolean> {
        if (length == 0) return ByteArray(0) to true
        if (stream == null) return ByteArray(0) to false
        val buffer = ByteArray(length)
        var read = 0
        while (read < length) {
            val count = try {
                stream.read(buffer, read, length - read)
            } catch (error: IOException) {
                -1
            }
            if (count <= 0) break
            read += count
        }
        return if (read == length) buffer to true else buffer.copyOf(read) to false
    }

    private fun closeHandlerQuietly(handler: NanoHTTPD.ClientHandler) {
        try {
            handler.close()
        } catch (_: Throwable) {
        }
    }

    /** Adapts the bounded runner to NanoHTTPD's pluggable strategy. */
    private inner class NanoHttpdAsyncRunner : NanoHTTPD.AsyncRunner {
        override fun exec(code: NanoHTTPD.ClientHandler) {
            val accepted = connections.submit(code) { code.run() }
            if (!accepted) {
                // Fail closed: refuse the connection instead of queueing it.
                closeHandlerQuietly(code)
            }
        }

        override fun closed(clientHandler: NanoHTTPD.ClientHandler) {
            // Lifetime is tracked by the runner itself.
        }

        override fun closeAll() {
            connections.shutdown { closeHandlerQuietly(it) }
        }
    }

    companion object {
        /** Socket-level bound: at most this many request handlers exist at any moment. */
        const val DEFAULT_MAX_CONNECTIONS = 8

        private const val THREAD_NAME = "lan-mcp-http"
    }
}
