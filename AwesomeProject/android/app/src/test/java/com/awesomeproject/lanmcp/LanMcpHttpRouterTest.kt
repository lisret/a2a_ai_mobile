package com.awesomeproject.lanmcp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class LanMcpHttpRouterTest {

    private val code = "abcdefghijkl"
    private val actions = FakeDeviceActions()
    private val generation = StopGeneration()
    private lateinit var gate: ConcurrencyGate
    private lateinit var router: LanMcpHttpRouter

    private var running = true
    private var started: Long = 0L

    @Before
    fun setUp() {
        gate = ConcurrencyGate(2)
        started = generation.markStarted()
        router = LanMcpHttpRouter(
            config = LanMcpHttpRouter.ServerConfig(BIND_ADDRESS, PORT),
            protocol = McpProtocol(
                executor = ToolExecutor(
                    actions = actions,
                    serializer = ActionSerializer(),
                    generation = generation,
                    base64 = { bytes -> "b64:" + bytes.size },
                    localTaskRunning = { false },
                ),
            ),
            concurrency = gate,
            authenticate = { header -> BearerAuth.authorize(header, code.toByteArray(Charsets.UTF_8)) },
            isRunning = { running },
        )
    }

    @Test
    fun servesAnAuthenticatedToolsList() {
        val reply = handle(request(body = """{"jsonrpc":"2.0","id":1,"method":"tools/list"}"""))

        assertEquals(200, reply.status)
        assertTrue(reply.mimeType.startsWith("application/json"))
        assertTrue(reply.bodyText.contains("\"tools\""))
        assertFalse("no CORS surface is exposed", reply.headers.containsKey("Access-Control-Allow-Origin"))
        assertFalse(reply.bodyText.contains(code))
    }

    @Test
    fun refusesEverythingWhileStopped() {
        running = false

        val reply = handle(request(body = """{"jsonrpc":"2.0","id":1,"method":"ping"}"""))

        assertEquals(503, reply.status)
        assertTrue(reply.bodyText.contains(Codes.HTTP_SERVICE_NOT_RUNNING))
    }

    @Test
    fun refusesAnyOriginHeaderBeforeAnythingElse() {
        val reply = handle(request(origin = "http://evil.example"))

        assertEquals(403, reply.status)
        assertTrue(reply.bodyText.contains(Codes.HTTP_FORBIDDEN_ORIGIN))
        assertFalse(reply.headers.containsKey("Access-Control-Allow-Origin"))
    }

    @Test
    fun pinsTheHostHeaderToTheBoundAddressAndPort() {
        assertEquals(403, handle(request(host = "evil.example:8765")).status)
        assertTrue(handle(request(host = "evil.example:8765")).bodyText.contains(Codes.HTTP_HOST_MISMATCH))
        assertEquals(403, handle(request(host = "$BIND_ADDRESS:9999")).status)
        assertEquals(400, handle(request(host = null)).status)
        assertTrue(handle(request(host = null)).bodyText.contains(Codes.HTTP_HOST_REQUIRED))
        assertEquals(200, handle(request(host = "$BIND_ADDRESS:$PORT")).status)
    }

    @Test
    fun onlyServesTheMcpPath() {
        assertEquals(404, handle(request(path = "/")).status)
        assertEquals(404, handle(request(path = "/mcp/")).status)
        assertEquals(404, handle(request(path = "/other")).status)
    }

    @Test
    fun rejectsNonPostMethodsIncludingGetWithoutAuthentication() {
        val get = handle(request(method = "GET", auth = null))

        assertEquals(405, get.status)
        assertEquals("POST", get.headers["Allow"])
        assertTrue(get.bodyText.contains(Codes.HTTP_METHOD_NOT_ALLOWED))
        assertEquals(405, handle(request(method = "DELETE")).status)
        assertEquals(405, handle(request(method = "HEAD")).status)
    }

    @Test
    fun validatesContentTypeAndAccept() {
        val wrongType = handle(request(contentType = "text/plain"))
        assertEquals(415, wrongType.status)
        assertTrue(wrongType.bodyText.contains(Codes.HTTP_UNSUPPORTED_MEDIA_TYPE))

        val wrongAccept = handle(request(accept = "text/html"))
        assertEquals(406, wrongAccept.status)
        assertTrue(wrongAccept.bodyText.contains(Codes.HTTP_NOT_ACCEPTABLE))
    }

    @Test
    fun enforcesTheBodyLimitAndClosesTheConnection() {
        val reply = handle(request(tooLarge = true))

        assertEquals(413, reply.status)
        assertTrue(reply.bodyText.contains(Codes.HTTP_PAYLOAD_TOO_LARGE))
        assertEquals("close", reply.headers["Connection"])
    }

    @Test
    fun rejectsIncompleteAndInvalidBodies() {
        val incomplete = handle(request(incomplete = true))
        assertEquals(400, incomplete.status)
        assertTrue(incomplete.bodyText.contains(Codes.HTTP_INCOMPLETE_BODY))
        assertEquals("close", incomplete.headers["Connection"])

        val invalidLength = handle(request(contentLengthValid = false))
        assertEquals(400, invalidLength.status)
        assertTrue(invalidLength.bodyText.contains(Codes.HTTP_INVALID_CONTENT_LENGTH))

        val chunked = handle(request(unsupportedTransferEncoding = true))
        assertEquals(400, chunked.status)
        assertTrue(chunked.bodyText.contains(Codes.HTTP_UNSUPPORTED_TRANSFER_ENCODING))
    }

    @Test
    fun requiresConstantTimeBearerAuthentication() {
        val missing = handle(request(auth = null))
        assertEquals(401, missing.status)
        assertTrue(missing.headers["WWW-Authenticate"]!!.startsWith("Bearer"))
        assertTrue(missing.bodyText.contains(Codes.HTTP_UNAUTHORIZED))
        assertFalse("the challenge must not leak the code", missing.bodyText.contains(code))

        assertEquals(401, handle(request(auth = "Bearer wrongwrongwr")).status)
        assertEquals(401, handle(request(auth = "Basic $code")).status)
        assertEquals(401, handle(request(auth = "")).status)
    }

    @Test
    fun validatesTheMcpProtocolVersionHeader() {
        assertEquals(200, handle(request(protocolVersionHeader = McpVersions.PINNED)).status)
        assertEquals(200, handle(request(protocolVersionHeader = "2025-06-18")).status)

        val unsupported = handle(request(protocolVersionHeader = "1900-01-01"))
        assertEquals(400, unsupported.status)
        assertTrue(unsupported.bodyText.contains(Codes.HTTP_UNSUPPORTED_PROTOCOL_VERSION))
    }

    @Test
    fun notificationsAreAcceptedWith202AndAnEmptyBody() {
        val reply = handle(request(body = """{"jsonrpc":"2.0","method":"notifications/initialized"}"""))

        assertEquals(202, reply.status)
        assertEquals(0, reply.body.size)
    }

    @Test
    fun refusesInsteadOfQueueingWhenConcurrencyIsExhausted() {
        assertTrue(gate.tryAcquire())
        assertTrue(gate.tryAcquire())

        val reply = handle(request(body = """{"jsonrpc":"2.0","id":1,"method":"ping"}"""))

        assertEquals(429, reply.status)
        assertTrue(reply.bodyText.contains(Codes.HTTP_TOO_MANY_REQUESTS))
        assertEquals("1", reply.headers["Retry-After"])
        gate.release()
        gate.release()
    }

    @Test
    fun releasesTheConcurrencySlotAfterEachRequest() {
        handle(request(body = """{"jsonrpc":"2.0","id":1,"method":"ping"}"""))
        handle(request(body = """{"jsonrpc":"2.0","id":2,"method":"ping"}"""))
        assertEquals(0, gate.inFlight())
    }

    @Test
    fun malformedJsonIsRefusedWith400AndTheReplyCarriesNoSecret() {
        val reply = handle(request(body = "{not json"))

        assertEquals(400, reply.status)
        assertTrue(reply.bodyText.contains("Parse error"))
        assertFalse(reply.bodyText.contains(code))
    }

    @Test
    fun toolErrorsRideOnHttp200() {
        // 5000x5000 is outside the fake 1080x2400 display, so the tool must fail in-band.
        val reply = handle(
            request(body = """{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"phone_tap","arguments":{"x":5000,"y":5000}}}"""),
        )

        assertEquals(200, reply.status)
        assertTrue(reply.bodyText.contains("\"isError\":true"))
        assertTrue(reply.bodyText.contains(Codes.OUT_OF_BOUNDS))
    }

    @Test
    fun generationChangeAfterStopRefusesToolCalls() {
        generation.markStopped()

        val reply = handle(
            request(body = """{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"phone_tap","arguments":{"x":1,"y":1}}}"""),
        )

        assertEquals(200, reply.status)
        assertTrue(reply.bodyText.contains(Codes.SERVICE_STOPPED))
        assertEquals(0, actions.tapCalls)
    }

    private fun handle(request: HttpRequestInfo): HttpReply = router.handle(request, started)

    private fun request(
        method: String = "POST",
        path: String = "/mcp",
        host: String? = "$BIND_ADDRESS:$PORT",
        origin: String? = null,
        auth: String? = "Bearer $code",
        contentType: String? = "application/json",
        accept: String? = "application/json",
        protocolVersionHeader: String? = null,
        body: String = "{}",
        tooLarge: Boolean = false,
        incomplete: Boolean = false,
        contentLengthValid: Boolean = true,
        unsupportedTransferEncoding: Boolean = false,
    ): HttpRequestInfo = HttpRequestInfo(
        method = method,
        path = path,
        hostHeader = host,
        originHeader = origin,
        authorizationHeader = auth,
        contentTypeHeader = contentType,
        acceptHeader = accept,
        protocolVersionHeader = protocolVersionHeader,
        body = HttpBodyRead(
            bytes = if (tooLarge) ByteArray(0) else body.toByteArray(Charsets.UTF_8),
            declaredLength = if (tooLarge) (HttpGate.MAX_BODY_BYTES + 1).toLong() else null,
            contentLengthValid = contentLengthValid,
            tooLarge = tooLarge,
            incomplete = incomplete,
            unsupportedTransferEncoding = unsupportedTransferEncoding,
        ),
    )

    private companion object {
        const val BIND_ADDRESS = "192.168.1.20"
        const val PORT = 8765
    }
}
