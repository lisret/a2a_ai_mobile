package com.awesomeproject.lanmcp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ExportPolicyTest {

    private val code = "abcdefghijkl"

    @Test
    fun acceptsOrdinaryGuideContent() {
        assertEquals(ExportVerdict.Ok, ExportPolicy.validate("# Connection guide\nBearer <CODE>", code))
        assertEquals(ExportVerdict.Ok, ExportPolicy.validate("content", null))
        assertEquals(ExportVerdict.Ok, ExportPolicy.validate("content", ""))
    }

    @Test
    fun rejectsEmptyContent() {
        assertRejected(Codes.EXPORT_EMPTY, ExportPolicy.validate(null, code))
        assertRejected(Codes.EXPORT_EMPTY, ExportPolicy.validate("", code))
    }

    @Test
    fun rejectsContentThatLeaksTheLiveConnectionCode() {
        assertRejected(
            Codes.EXPORT_CONTAINS_SECRET,
            ExportPolicy.validate("Authorization: Bearer $code\n", code),
        )
        assertRejected(
            Codes.EXPORT_CONTAINS_SECRET,
            ExportPolicy.validate("token=$code", code),
        )
    }

    @Test
    fun rejectsOversizedContent() {
        val oversized = "a".repeat(ExportPolicy.MAX_CONTENT_CHARS + 1)
        assertRejected(Codes.EXPORT_TOO_LARGE, ExportPolicy.validate(oversized, code))
        assertEquals(ExportVerdict.Ok, ExportPolicy.validate("a".repeat(ExportPolicy.MAX_CONTENT_CHARS), code))
    }

    @Test
    fun sanitizesFilenamesAgainstPathTraversal() {
        assertEquals("lan-mcp-connection-guide.md", ExportPolicy.sanitizeFilename(null))
        assertEquals("lan-mcp-connection-guide.md", ExportPolicy.sanitizeFilename(""))
        assertEquals("lan-mcp-connection-guide.md", ExportPolicy.sanitizeFilename("..."))
        assertEquals("etcpasswd.md", ExportPolicy.sanitizeFilename("../../etc/passwd"))
        assertEquals("my-guide.md", ExportPolicy.sanitizeFilename("my guide.md"))
        assertEquals("guide.md", ExportPolicy.sanitizeFilename("guide"))
        assertEquals("guide.md", ExportPolicy.sanitizeFilename("guide.md"))
        assertEquals("guide.MD", ExportPolicy.sanitizeFilename("guide.MD"))
        assertEquals("lan-mcp.md", ExportPolicy.sanitizeFilename("  lan mcp  "))
        assertFalse(ExportPolicy.sanitizeFilename("a/b\\c").contains("/"))
        assertFalse(ExportPolicy.sanitizeFilename("a/b\\c").contains("\\"))
    }

    @Test
    fun sanitizedNamesStayShortAndAlwaysMarkdown() {
        val name = ExportPolicy.sanitizeFilename("z".repeat(500))
        assertTrue(name.endsWith(".md"))
        assertTrue(name.length <= 103)
        assertTrue(ExportPolicy.sanitizeFilename("密码密码").endsWith(".md"))
    }

    private fun assertRejected(expectedCode: String, verdict: ExportVerdict) {
        assertTrue("expected a rejection, got $verdict", verdict is ExportVerdict.Rejected)
        assertEquals(expectedCode, (verdict as ExportVerdict.Rejected).code)
    }
}
