package com.awesomeproject.lanmcp

import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import org.junit.Assert.*
import org.junit.Test

/** Real TCP/HTTP adapter exercise on loopback; device actions remain explicit test doubles. */
class LanMcpServerIntegrationTest {
    @Test
    fun actualHttpSessionRequiresAuthDiscoversToolsAndStopsListening() {
        val port = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { it.localPort }
        val generation = StopGeneration()
        val started = generation.markStarted()
        val code = "test-only-code-123"
        val actions = FakeDeviceActions()
        val router = LanMcpHttpRouter(
            LanMcpHttpRouter.ServerConfig("127.0.0.1", port),
            McpProtocol(executor = ToolExecutor(actions, ActionSerializer(), generation, { "AQID" }, { false })),
            ConcurrencyGate(4),
            { BearerAuth.authorize(it, code.toByteArray()) },
            { generation.isRunning() },
        )
        val server = LanMcpServer("127.0.0.1", port, router, dispatchGeneration = { started })
        server.startServer()
        try {
            val init = """{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}"""
            assertEquals(401, post(port, init, null).first)
            assertEquals(401, post(port, init, "wrong-code").first)
            val initialized = post(port, init, code)
            assertEquals(200, initialized.first)
            assertTrue(initialized.second.contains("2025-11-25"))
            assertFalse(initialized.second.contains(code))
            assertEquals(202, post(port, """{"jsonrpc":"2.0","method":"notifications/initialized"}""", code).first)
            val listed = post(port, """{"jsonrpc":"2.0","id":2,"method":"tools/list"}""", code)
            assertEquals(200, listed.first)
            val parsed = Jsons.parse(listed.second) as Map<*, *>
            val names = ((parsed["result"] as Map<*, *>)["tools"] as List<*>).map { (it as Map<*, *>)["name"] }
            assertEquals(ToolCatalog.NAMES, names)
            val tap = """{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"phone_tap","arguments":{"x":12,"y":24}}}"""
            assertTrue(post(port, tap, code).second.contains("\"isError\":false"))
            assertEquals(1, actions.tapCalls)
            actions.locked = true
            assertTrue(post(port, tap, code).second.contains(Codes.DEVICE_LOCKED))
            assertEquals(1, actions.tapCalls)
            assertEquals(400, post(port, "{invalid", code).first)
            generation.markStopped()
            assertEquals(503, post(port, tap, code).first)
            assertEquals(1, actions.tapCalls)
        } finally {
            generation.markStopped()
            server.stopServer()
        }
        try {
            Socket("127.0.0.1", port).use { fail("Stopped server still accepts connections") }
        } catch (_: java.net.ConnectException) {
            // Expected: the listening socket has actually been closed.
        }
        val restartedGeneration = generation.markStarted()
        val restarted = LanMcpServer("127.0.0.1", port, router, dispatchGeneration = { restartedGeneration })
        try {
            restarted.startServer()
            assertEquals(200, post(port, """{"jsonrpc":"2.0","id":4,"method":"ping"}""", code).first)
        } finally {
            generation.markStopped()
            restarted.stopServer()
        }
    }

    private fun post(port: Int, body: String, code: String?): Pair<Int, String> {
        val connection = URL("http://127.0.0.1:$port/mcp").openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 2000
            connection.readTimeout = 3000
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json, text/event-stream")
            connection.setRequestProperty("MCP-Protocol-Version", "2025-11-25")
            if (code != null) connection.setRequestProperty("Authorization", "Bearer $code")
            val bytes = body.toByteArray(Charsets.UTF_8)
            connection.setFixedLengthStreamingMode(bytes.size)
            connection.outputStream.use { it.write(bytes) }
            val status = connection.responseCode
            val stream = if (status >= 400) connection.errorStream else connection.inputStream
            return status to (stream?.bufferedReader()?.use { it.readText() } ?: "")
        } finally {
            connection.disconnect()
        }
    }
}
