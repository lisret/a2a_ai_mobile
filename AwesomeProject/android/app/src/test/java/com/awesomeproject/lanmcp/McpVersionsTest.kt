package com.awesomeproject.lanmcp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class McpVersionsTest {

    @Test
    fun claimsOnlyTheStreamableHttpRevisionsItImplements() {
        assertEquals(listOf("2025-11-25", "2025-06-18", "2025-03-26"), McpVersions.SUPPORTED)
        assertFalse("2024-11-05 has a different transport", McpVersions.SUPPORTED.contains("2024-11-05"))
        assertEquals("2025-11-25", McpVersions.PINNED)
    }

    @Test
    fun echoesClaimedRevisions() {
        for (version in McpVersions.SUPPORTED) {
            assertEquals(version, McpVersions.negotiate(version))
            assertTrue(McpVersions.isSupported(version))
        }
    }

    @Test
    fun negotiatesEverythingElseToThePinnedRevision() {
        assertEquals(McpVersions.PINNED, McpVersions.negotiate("2099-01-01"))
        assertEquals(McpVersions.PINNED, McpVersions.negotiate("2024-11-05"))
        assertEquals(McpVersions.PINNED, McpVersions.negotiate(""))
        assertEquals(McpVersions.PINNED, McpVersions.negotiate(null))
        assertEquals(McpVersions.PINNED, McpVersions.negotiate("2025-06-18 "))
        assertFalse(McpVersions.isSupported("2024-11-05"))
        assertFalse(McpVersions.isSupported(null))
    }
}
