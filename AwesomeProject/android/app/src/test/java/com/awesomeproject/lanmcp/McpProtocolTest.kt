package com.awesomeproject.lanmcp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class McpProtocolTest {

    private val actions = FakeDeviceActions()
    private val generation = StopGeneration()
    private val protocol = McpProtocol(
        executor = ToolExecutor(
            actions = actions,
            serializer = ActionSerializer(),
            generation = generation,
            base64 = { bytes -> "b64:" + bytes.size },
            localTaskRunning = { false },
        ),
    )

    private var started: Long = 0L

    @Before
    fun setUp() {
        started = generation.markStarted()
    }

    @Test
    fun initializeNegotiatesThePinnedRevision() {
        val reply = body(
            """{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"c","version":"1"}}}""",
        )

        assertEquals(200, reply.status)
        assertEquals("2.0", reply.payload["jsonrpc"])
        assertEquals(1L, reply.payload["id"])
        val result = asObject(reply.payload["result"])
        assertEquals(McpVersions.PINNED, result["protocolVersion"])
        assertEquals(false, asObject(asObject(result["capabilities"])["tools"])["listChanged"])
        assertEquals("awesomeproject-lan-mcp", asObject(result["serverInfo"])["name"])
        assertTrue(result["instructions"] is String)
        assertNull(reply.payload["error"])
    }

    @Test
    fun initializeWithoutARequestedRevisionUsesThePinnedOne() {
        val reply = body("""{"jsonrpc":"2.0","id":"abc","method":"initialize","params":{}}""")
        assertEquals(200, reply.status)
        assertEquals("abc", reply.payload["id"])
        assertEquals(McpVersions.PINNED, asObject(reply.payload["result"])["protocolVersion"])
    }

    @Test
    fun initializeEchoesSupportedOlderRevisions() {
        val reply = body(
            """{"jsonrpc":"2.0","id":2,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}""",
        )
        assertEquals(200, reply.status)
        assertEquals("2025-06-18", asObject(reply.payload["result"])["protocolVersion"])
    }

    @Test
    fun initializeNegotiatesAnUnsupportedNewerRevisionInsteadOfFailing() {
        val reply = body(
            """{"jsonrpc":"2.0","id":3,"method":"initialize","params":{"protocolVersion":"2099-01-01"}}""",
        )

        assertEquals("a newer revision must negotiate, not fail", 200, reply.status)
        assertNull(reply.payload["error"])
        assertEquals(McpVersions.PINNED, asObject(reply.payload["result"])["protocolVersion"])
    }

    @Test
    fun initializeNegotiatesThePreStreamableRevisionItDoesNotImplement() {
        // 2024-11-05 uses a different transport, so it is deliberately not claimed; the
        // server negotiates to the revision it actually speaks instead of claiming it.
        val reply = body(
            """{"jsonrpc":"2.0","id":31,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}""",
        )

        assertEquals(200, reply.status)
        assertEquals(McpVersions.PINNED, asObject(reply.payload["result"])["protocolVersion"])
        assertTrue(!McpVersions.SUPPORTED.contains("2024-11-05"))
    }

    @Test
    fun initializeEchoesEveryClaimedRevision() {
        for (version in McpVersions.SUPPORTED) {
            val reply = body(
                """{"jsonrpc":"2.0","id":32,"method":"initialize","params":{"protocolVersion":"$version"}}""",
            )
            assertEquals(200, reply.status)
            assertEquals(version, asObject(reply.payload["result"])["protocolVersion"])
        }
    }

    @Test
    fun initializeReportsTheSupportedSetWhenItNegotiates() {
        val reply = body(
            """{"jsonrpc":"2.0","id":33,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}""",
        )
        assertEquals(200, reply.status)
        assertEquals("2025-03-26", asObject(reply.payload["result"])["protocolVersion"])
    }

    @Test
    fun initializeRefusesNonStringRevision() {
        val reply = body("""{"jsonrpc":"2.0","id":4,"method":"initialize","params":{"protocolVersion":20251125}}""")
        assertEquals(400, reply.status)
        assertEquals(Codes.RPC_INVALID_PARAMS.toLong(), asObject(reply.payload["error"])["code"])
    }

    @Test
    fun pingReturnsAnEmptyResult() {
        val reply = body("""{"jsonrpc":"2.0","id":5,"method":"ping"}""")
        assertEquals(200, reply.status)
        assertEquals(0, asObject(reply.payload["result"]).size)
    }

    @Test
    fun toolsListReturnsTheSixFrozenTools() {
        val reply = body("""{"jsonrpc":"2.0","id":6,"method":"tools/list"}""")
        assertEquals(200, reply.status)
        val tools = asArray(asObject(reply.payload["result"])["tools"])
        assertEquals(6, tools.size)
        assertEquals(ToolCatalog.NAMES, tools.map { asObject(it)["name"] })
    }

    @Test
    fun toolsCallExecutesStatusInBand() {
        val reply = body(
            """{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"phone_status","arguments":{}}}""",
        )
        assertEquals(200, reply.status)
        val result = asObject(reply.payload["result"])
        assertEquals(false, result["isError"])
        val content = asArray(result["content"])
        assertEquals(1, content.size)
        assertEquals("text", asObject(content[0])["type"])
    }

    @Test
    fun toolsCallRejectsUnknownToolsAsAnInBandToolError() {
        val reply = body(
            """{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"phone_shell","arguments":{"cmd":"ls"}}}""",
        )
        assertEquals("unknown tools are tool errors, not transport errors", 200, reply.status)
        val result = asObject(reply.payload["result"])
        assertEquals(true, result["isError"])
        assertTrue(text(result).contains(Codes.UNKNOWN_TOOL))
    }

    @Test
    fun toolsCallReportsArgumentProblemsInBand() {
        val missing = asObject(
            body("""{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"phone_tap","arguments":{"x":1}}}""").payload["result"],
        )
        assertEquals(true, missing["isError"])
        assertTrue(text(missing).contains(Codes.MISSING_PARAM))

        val notAnObject = asObject(
            body("""{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"phone_tap","arguments":"nope"}}""").payload["result"],
        )
        assertEquals(true, notAnObject["isError"])
        assertTrue(text(notAnObject).contains(Codes.INVALID_PARAMS))

        val unnamed = asObject(
            body("""{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"arguments":{}}}""").payload["result"],
        )
        assertEquals(true, unnamed["isError"])
    }

    @Test
    fun toolsCallWithoutArgumentsIsTreatedAsAnEmptyObject() {
        val reply = body("""{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"phone_status"}}""")
        assertEquals(false, asObject(reply.payload["result"])["isError"])
    }

    @Test
    fun notificationRequestsAreAcceptedWith202AndNeverExecuted() {
        assertTrue(handle("""{"jsonrpc":"2.0","method":"notifications/initialized"}""") is ProtocolReply.Accepted)
        assertTrue(
            handle("""{"jsonrpc":"2.0","id":13,"method":"notifications/initialized"}""") is ProtocolReply.Accepted,
        )
        assertTrue(handle("""{"jsonrpc":"2.0","method":"ping"}""") is ProtocolReply.Accepted)
        assertEquals("notifications must not touch the device", 0, actions.tapCalls)
    }

    @Test
    fun batchesAreRefused() {
        val reply = body("""[{"jsonrpc":"2.0","id":1,"method":"ping"}]""")
        assertEquals(400, reply.status)
        assertEquals(Codes.RPC_INVALID_REQUEST.toLong(), asObject(reply.payload["error"])["code"])
    }

    @Test
    fun parseErrorsAreReportedAsRpcParseErrors() {
        val reply = body("""{"jsonrpc":"2.0","id":1,"method":""")
        assertEquals(400, reply.status)
        assertNull(reply.payload["id"])
        assertEquals(Codes.RPC_PARSE_ERROR.toLong(), asObject(reply.payload["error"])["code"])
    }

    @Test
    fun malformedRequestsAreRejectedWithoutExecution() {
        assertEquals(Codes.RPC_INVALID_REQUEST.toLong(), errorCode("""{"id":1,"method":"ping"}"""))
        assertEquals(Codes.RPC_INVALID_REQUEST.toLong(), errorCode("""{"jsonrpc":"1.0","id":1,"method":"ping"}"""))
        assertEquals(Codes.RPC_INVALID_REQUEST.toLong(), errorCode("""{"jsonrpc":"2.0","id":1}"""))
        assertEquals(Codes.RPC_INVALID_REQUEST.toLong(), errorCode("""{"jsonrpc":"2.0","id":true,"method":"ping"}"""))
        assertEquals("a non-object body is invalid", Codes.RPC_INVALID_REQUEST.toLong(), errorCode("\"text\""))
        assertEquals(Codes.RPC_INVALID_PARAMS.toLong(), errorCode("""{"jsonrpc":"2.0","id":1,"method":"ping","params":[]}"""))
    }

    @Test
    fun unknownMethodsReturnMethodNotFound() {
        val reply = body("""{"jsonrpc":"2.0","id":14,"method":"resources/list"}""")
        assertEquals(200, reply.status)
        assertEquals(Codes.RPC_METHOD_NOT_FOUND.toLong(), asObject(reply.payload["error"])["code"])
        assertEquals(14L, reply.payload["id"])
    }

    @Test
    fun everyToolErrorAfterStopIsRefused() {
        generation.markStopped()
        val reply = body(
            """{"jsonrpc":"2.0","id":15,"method":"tools/call","params":{"name":"phone_tap","arguments":{"x":1,"y":1}}}""",
        )
        val result = asObject(reply.payload["result"])
        assertEquals(true, result["isError"])
        assertTrue(text(result).contains(Codes.SERVICE_STOPPED))
        assertEquals(0, actions.tapCalls)
    }

    @Test
    fun repliesCarryNoConnectionCodeBecauseNoneIsEverProvided() {
        val reply = body("""{"jsonrpc":"2.0","id":16,"method":"tools/list"}""")
        assertFalse(Jsons.write(reply.payload).contains("Bearer "))
    }

    private fun handle(json: String): ProtocolReply = protocol.handle(json, started)

    private fun body(json: String): ProtocolReply.Body {
        val reply = handle(json)
        assertTrue("expected a body reply, got $reply", reply is ProtocolReply.Body)
        return reply as ProtocolReply.Body
    }

    private fun errorCode(json: String): Long {
        val reply = body(json)
        assertEquals(200, reply.status)
        return asObject(reply.payload["error"])["code"] as Long
    }

    private fun text(result: Map<String, Any?>): String =
        asObject(asArray(result["content"])[0])["text"] as String

    @Suppress("UNCHECKED_CAST")
    private fun asObject(value: Any?): Map<String, Any?> = value as Map<String, Any?>

    @Suppress("UNCHECKED_CAST")
    private fun asArray(value: Any?): List<Any?> = value as List<Any?>
}
