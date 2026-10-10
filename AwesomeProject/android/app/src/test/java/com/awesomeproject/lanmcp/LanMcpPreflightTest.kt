package com.awesomeproject.lanmcp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Regression tests for the early gate: every body-independent refusal must be decidable from
 * headers alone (so no body byte is read), and because the body is then left unread the
 * connection must be closed instead of reused.
 */
class LanMcpPreflightTest {

    private val code = "abcdefghijkl"
    private val actions = FakeDeviceActions()
    private val generation = StopGeneration()
    private lateinit var router: LanMcpHttpRouter

    private var running = true

    @Before
    fun setUp() {
        running = true
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
            concurrency = ConcurrencyGate(2),
            authenticate = { header -> BearerAuth.authorize(header, code.toByteArray(Charsets.UTF_8)) },
            isRunning = { running },
        )
    }

    @Test
    fun aWellFormedAuthenticatedRequestPassesTheGateWithoutABody() {
        val headersOnly = request(declaredLength = 2L)

        assertNull(router.preflight(headersOnly))
        assertEquals("the gate must not consume a body", 0, headersOnly.body.bytes.size)
    }

    @Test
    fun theGateUsesTheRealMethodAndPath() {
        assertEquals(405, router.preflight(request(method = "GET"))!!.status)
        assertEquals(405, router.preflight(request(method = "DELETE"))!!.status)
        assertEquals(404, router.preflight(request(path = "/other"))!!.status)
        assertEquals(404, router.preflight(request(path = "/mcp/"))!!.status)
        assertNull(router.preflight(request(path = HttpGate.MCP_PATH)))
    }

    @Test
    fun aStoppedServiceIsRefusedFirst() {
        running = false

        assertEquals(503, router.preflight(request())?.status)
    }

    @Test
    fun theGateRefusesEverythingElseItCanDecideFromHeaders() {
        assertEquals(403, router.preflight(request(origin = "http://evil.example"))?.status)
        assertEquals(403, router.preflight(request(host = "evil.example:8765"))?.status)
        assertEquals(403, router.preflight(request(host = "$BIND_ADDRESS:9999"))?.status)
        assertEquals(400, router.preflight(request(host = null))?.status)
        assertEquals(415, router.preflight(request(contentType = "text/plain"))?.status)
        assertEquals(406, router.preflight(request(accept = "text/html"))?.status)
        assertEquals(401, router.preflight(request(auth = null))?.status)
        assertEquals(401, router.preflight(request(auth = "Bearer wrongwrongwr"))?.status)
        assertEquals(400, router.preflight(request(protocolVersionHeader = "1900-01-01"))?.status)
        assertNull(router.preflight(request(protocolVersionHeader = McpVersions.PINNED)))
    }

    @Test
    fun anOversizedDeclaredBodyIsRefusedWithoutBeingRead() {
        val oversized = request(declaredLength = 10L * 1024 * 1024 * 1024)

        val reply = router.preflight(oversized)

        assertEquals(413, reply?.status)
        assertEquals("nothing may be read for an oversized body", 0, oversized.body.bytes.size)
    }

    @Test
    fun unsupportedFramingAndInvalidContentLengthAreRefusedFromHeaders() {
        assertEquals(400, router.preflight(request(unsupportedTransferEncoding = true))?.status)
        assertEquals(400, router.preflight(request(contentLengthValid = false))?.status)
    }

    @Test
    fun everyGateRefusalClosesTheConnectionBecauseTheBodyIsUnread() {
        val refusals = listOf(
            request(origin = "http://evil.example"),
            request(host = "evil.example:8765"),
            request(host = null),
            request(path = "/other"),
            request(method = "GET"),
            request(contentType = "text/plain"),
            request(accept = "text/html"),
            request(unsupportedTransferEncoding = true),
            request(contentLengthValid = false),
            request(declaredLength = 10L * 1024 * 1024 * 1024),
            request(auth = null),
            request(protocolVersionHeader = "1900-01-01"),
        )
        for (refusal in refusals) {
            val reply = router.preflight(refusal)
            assertTrue("expected a refusal for $refusal", reply != null)
            assertEquals("close", reply!!.headers["Connection"])
        }
    }

    @Test
    fun anAcceptedRequestKeepsTheConnectionAlive() {
        val reply = router.handle(request(body = """{"jsonrpc":"2.0","id":1,"method":"ping"}"""), generation.markStarted())

        assertEquals(200, reply.status)
        assertFalse(reply.headers.containsKey("Connection"))
    }

    @Test
    fun theGateAlsoRefusesWhenTheBodyWasAlreadyReadByTheCaller() {
        // handle() re-runs the same gate, so a caller that already read a body gets the same verdict.
        assertEquals(401, router.handle(request(auth = null, body = "{}"), 0L).status)
        assertEquals(405, router.handle(request(method = "GET", body = "{}"), 0L).status)
        assertEquals(413, router.handle(request(declaredLength = 10L * 1024 * 1024 * 1024), 0L).status)
    }

    @Test
    fun headersOnlyBodyViewMarksTheDeclaredSizeWithoutReadingAnything() {
        val small = HttpBodyRead.headersOnly(16L, contentLengthValid = true, unsupportedTransferEncoding = false)
        assertEquals(0, small.bytes.size)
        assertFalse(small.tooLarge)
        assertFalse(small.incomplete)
        assertEquals(16L, small.declaredLength)

        val large = HttpBodyRead.headersOnly(
            (HttpGate.MAX_BODY_BYTES + 1).toLong(),
            contentLengthValid = true,
            unsupportedTransferEncoding = false,
        )
        assertEquals(0, large.bytes.size)
        assertTrue(large.tooLarge)

        val absent = HttpBodyRead.headersOnly(null, contentLengthValid = true, unsupportedTransferEncoding = false)
        assertFalse(absent.tooLarge)
        assertNull(absent.declaredLength)
    }

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
        declaredLength: Long? = null,
        contentLengthValid: Boolean = true,
        unsupportedTransferEncoding: Boolean = false,
    ): HttpRequestInfo {
        val headerOnly = declaredLength != null || !contentLengthValid || unsupportedTransferEncoding
        return HttpRequestInfo(
            method = method,
            path = path,
            hostHeader = host,
            originHeader = origin,
            authorizationHeader = auth,
            contentTypeHeader = contentType,
            acceptHeader = accept,
            protocolVersionHeader = protocolVersionHeader,
            body = if (headerOnly) {
                HttpBodyRead.headersOnly(declaredLength, contentLengthValid, unsupportedTransferEncoding)
            } else {
                HttpBodyRead(
                    bytes = body.toByteArray(Charsets.UTF_8),
                    declaredLength = body.length.toLong(),
                    contentLengthValid = true,
                    tooLarge = false,
                    incomplete = false,
                    unsupportedTransferEncoding = false,
                )
            },
        )
    }

    private companion object {
        const val BIND_ADDRESS = "192.168.1.20"
        const val PORT = 8765
    }
}
