package com.awesomeproject.lanmcp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HttpGateTest {

    @Test
    fun rejectsAnyOriginHeader() {
        assertTrue(HttpGate.originRejected("http://evil.example"))
        assertTrue(HttpGate.originRejected("null"))
        assertFalse(HttpGate.originRejected(null))
    }

    @Test
    fun hostMustMatchTheBoundAddressAndPortExactly() {
        assertTrue(HttpGate.hostMatches("192.168.1.20:8765", "192.168.1.20", 8765))
        assertTrue(HttpGate.hostMatches("  192.168.1.20:8765 ", "192.168.1.20", 8765))
        assertFalse(HttpGate.hostMatches("192.168.1.20:8766", "192.168.1.20", 8765))
        assertFalse(HttpGate.hostMatches("192.168.1.21:8765", "192.168.1.20", 8765))
        assertFalse(HttpGate.hostMatches("192.168.1.20", "192.168.1.20", 8765))
        assertFalse(HttpGate.hostMatches("localhost:8765", "192.168.1.20", 8765))
        assertFalse(HttpGate.hostMatches(null, "192.168.1.20", 8765))
        assertFalse(HttpGate.hostMatches("   ", "192.168.1.20", 8765))
    }

    @Test
    fun onlyTheMcpPathIsServed() {
        assertTrue(HttpGate.pathMatches("/mcp"))
        assertFalse(HttpGate.pathMatches("/mcp/"))
        assertFalse(HttpGate.pathMatches("/"))
        assertFalse(HttpGate.pathMatches("/mcpx"))
        assertFalse(HttpGate.pathMatches(null))
    }

    @Test
    fun contentTypeToleratesAbsenceButRejectsOtherTypes() {
        assertTrue(HttpGate.contentTypeIsJson(null))
        assertTrue(HttpGate.contentTypeIsJson(""))
        assertTrue(HttpGate.contentTypeIsJson("application/json"))
        assertTrue(HttpGate.contentTypeIsJson("Application/JSON; charset=utf-8"))
        assertFalse(HttpGate.contentTypeIsJson("text/plain"))
        assertFalse(HttpGate.contentTypeIsJson("application/x-www-form-urlencoded"))
    }

    @Test
    fun acceptMustPermitJson() {
        assertTrue(HttpGate.acceptAllowsJson(null))
        assertTrue(HttpGate.acceptAllowsJson(""))
        assertTrue(HttpGate.acceptAllowsJson("application/json"))
        assertTrue(HttpGate.acceptAllowsJson("text/html, application/json;q=0.9"))
        assertTrue(HttpGate.acceptAllowsJson("*/*"))
        assertTrue(HttpGate.acceptAllowsJson("application/*"))
        assertFalse(HttpGate.acceptAllowsJson("text/html"))
        assertFalse(HttpGate.acceptAllowsJson("text/event-stream"))
    }

    @Test
    fun onlyIdentityTransferEncodingIsSupported() {
        assertTrue(HttpGate.transferEncodingSupported(null))
        assertTrue(HttpGate.transferEncodingSupported(""))
        assertTrue(HttpGate.transferEncodingSupported("identity"))
        assertTrue(HttpGate.transferEncodingSupported("  IDENTITY "))
        assertFalse(HttpGate.transferEncodingSupported("chunked"))
        assertFalse(HttpGate.transferEncodingSupported("gzip"))
    }

    @Test
    fun contentLengthParsingDistinguishesAbsentInvalidAndDeclared() {
        assertEquals(ContentLength.Absent, HttpGate.parseContentLength(null))
        assertEquals(ContentLength.Declared(0L), HttpGate.parseContentLength("0"))
        assertEquals(ContentLength.Declared(1024L), HttpGate.parseContentLength(" 1024 "))
        assertEquals(ContentLength.Invalid, HttpGate.parseContentLength(""))
        assertEquals(ContentLength.Invalid, HttpGate.parseContentLength("-1"))
        assertEquals(ContentLength.Invalid, HttpGate.parseContentLength("12a"))
        assertEquals(ContentLength.Invalid, HttpGate.parseContentLength("1.5"))
        assertEquals(ContentLength.Invalid, HttpGate.parseContentLength("999999999999999999999"))
    }

    @Test
    fun bodyLimitIsSixtyFourKiB() {
        assertEquals(65536, HttpGate.MAX_BODY_BYTES)
    }
}
