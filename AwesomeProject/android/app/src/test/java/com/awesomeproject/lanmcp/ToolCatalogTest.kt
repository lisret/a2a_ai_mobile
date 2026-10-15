package com.awesomeproject.lanmcp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ToolCatalogTest {

    @Test
    fun exposesExactlyTheSixFrozenTools() {
        assertEquals(
            listOf("phone_status", "phone_screenshot", "phone_tap", "phone_swipe", "phone_type", "phone_key"),
            ToolCatalog.NAMES,
        )
        val described = ToolCatalog.describe()
        assertEquals(6, described.size)
        assertEquals(ToolCatalog.NAMES, described.map { it["name"] })
        for (tool in described) {
            val schema = tool["inputSchema"] as Map<*, *>
            assertEquals("object", schema["type"])
            assertTrue(schema["required"] is List<*>)
            assertEquals(false, schema["additionalProperties"])
            assertTrue(tool["description"] is String)
        }
    }

    @Test
    fun tapSchemaRequiresBothCoordinates() {
        val tap = ToolCatalog.describe().first { it["name"] == ToolCatalog.TAP }
        val schema = tap["inputSchema"] as Map<*, *>
        assertEquals(listOf("x", "y"), schema["required"])
    }

    @Test
    fun swipeSchemaRequiresFiveParameters() {
        val swipe = ToolCatalog.describe().first { it["name"] == ToolCatalog.SWIPE }
        val schema = swipe["inputSchema"] as Map<*, *>
        assertEquals(listOf("startX", "startY", "endX", "endY", "durationMs"), schema["required"])
    }

    @Test
    fun keySchemaIsAStrictEnum() {
        val key = ToolCatalog.describe().first { it["name"] == ToolCatalog.KEY }
        val properties = (key["inputSchema"] as Map<*, *>)["properties"] as Map<*, *>
        val keySchema = properties["key"] as Map<*, *>
        assertEquals(listOf("back", "home"), keySchema["enum"])
    }

    @Test
    fun resolvesStatusAndScreenshotWithoutArguments() {
        assertEquals(ToolInvocation.PhoneStatus, valid(ToolCatalog.STATUS, emptyMap()))
        assertEquals(ToolInvocation.PhoneScreenshot, valid(ToolCatalog.SCREENSHOT, emptyMap()))
    }

    @Test
    fun ignoresUnknownExtraArguments() {
        assertEquals(ToolInvocation.Tap(5, 6), valid(ToolCatalog.TAP, mapOf("x" to 5L, "y" to 6L, "extra" to "ignored")))
    }

    @Test
    fun acceptsIntegralNumbersFromAnyJsonNumericType() {
        assertEquals(ToolInvocation.Tap(1, 2), valid(ToolCatalog.TAP, mapOf("x" to 1L, "y" to 2)))
        assertEquals(ToolInvocation.Tap(3, 4), valid(ToolCatalog.TAP, mapOf("x" to 3.0, "y" to 4L)))
    }

    @Test
    fun rejectsMissingAndMalformedCoordinates() {
        assertEquals(Codes.MISSING_PARAM, invalid(ToolCatalog.TAP, mapOf("x" to 1L)).code)
        assertEquals(Codes.INVALID_PARAMS, invalid(ToolCatalog.TAP, mapOf("x" to "1", "y" to 2L)).code)
        assertEquals(Codes.INVALID_PARAMS, invalid(ToolCatalog.TAP, mapOf("x" to 1.5, "y" to 2L)).code)
        assertEquals(Codes.INVALID_PARAMS, invalid(ToolCatalog.TAP, mapOf("x" to true, "y" to 2L)).code)
    }

    @Test
    fun rejectsCoordinatesOutsideSanityBounds() {
        assertEquals(Codes.OUT_OF_RANGE, invalid(ToolCatalog.TAP, mapOf("x" to -1L, "y" to 0L)).code)
        assertEquals(Codes.OUT_OF_RANGE, invalid(ToolCatalog.TAP, mapOf("x" to 0L, "y" to -5L)).code)
        assertEquals(
            Codes.OUT_OF_RANGE,
            invalid(ToolCatalog.TAP, mapOf("x" to (ToolCatalog.MAX_COORDINATE + 1).toLong(), "y" to 0L)).code,
        )
    }

    @Test
    fun resolvesSwipeAndValidatesDuration() {
        val args = mapOf<String, Any?>(
            "startX" to 100L,
            "startY" to 200L,
            "endX" to 300L,
            "endY" to 400L,
            "durationMs" to 250L,
        )
        assertEquals(ToolInvocation.Swipe(100, 200, 300, 400, 250), valid(ToolCatalog.SWIPE, args))
        assertEquals(Codes.OUT_OF_RANGE, invalid(ToolCatalog.SWIPE, args + ("durationMs" to 0L)).code)
        assertEquals(
            Codes.OUT_OF_RANGE,
            invalid(ToolCatalog.SWIPE, args + ("durationMs" to (ToolCatalog.MAX_DURATION_MS + 1).toLong())).code,
        )
        assertEquals(Codes.MISSING_PARAM, invalid(ToolCatalog.SWIPE, args - "endY").code)
    }

    @Test
    fun validatesTextInput() {
        assertEquals(ToolInvocation.TypeText("hello 世界"), valid(ToolCatalog.TYPE, mapOf("text" to "hello 世界")))
        assertEquals(Codes.INVALID_PARAMS, invalid(ToolCatalog.TYPE, mapOf("text" to "")).code)
        assertEquals(Codes.INVALID_PARAMS, invalid(ToolCatalog.TYPE, mapOf("text" to 5L)).code)
        assertEquals(Codes.MISSING_PARAM, invalid(ToolCatalog.TYPE, emptyMap()).code)
        assertEquals(
            Codes.TEXT_TOO_LONG,
            invalid(ToolCatalog.TYPE, mapOf("text" to "a".repeat(ToolCatalog.MAX_TEXT_CHARS + 1))).code,
        )
    }

    @Test
    fun keyAcceptsOnlyBackAndHome() {
        assertEquals(ToolInvocation.Key("back"), valid(ToolCatalog.KEY, mapOf("key" to "back")))
        assertEquals(ToolInvocation.Key("home"), valid(ToolCatalog.KEY, mapOf("key" to "home")))
        assertEquals(Codes.UNSUPPORTED_KEY, invalid(ToolCatalog.KEY, mapOf("key" to "Back")).code)
        assertEquals(Codes.UNSUPPORTED_KEY, invalid(ToolCatalog.KEY, mapOf("key" to "menu")).code)
        assertEquals(Codes.UNSUPPORTED_KEY, invalid(ToolCatalog.KEY, mapOf("key" to "power")).code)
        assertEquals(Codes.INVALID_PARAMS, invalid(ToolCatalog.KEY, mapOf("key" to 1L)).code)
        assertEquals(Codes.MISSING_PARAM, invalid(ToolCatalog.KEY, emptyMap()).code)
    }

    @Test
    fun rejectsUnknownToolNames() {
        assertEquals(Codes.UNKNOWN_TOOL, invalid("phone_shell", emptyMap()).code)
        assertEquals(Codes.UNKNOWN_TOOL, invalid("", emptyMap()).code)
        assertEquals(Codes.UNKNOWN_TOOL, invalid("PHONE_TAP", emptyMap()).code)
    }

    private fun valid(name: String, args: Map<String, Any?>): ToolInvocation {
        val resolution = ToolCatalog.resolve(name, args)
        assertTrue("expected a valid resolution, got $resolution", resolution is ToolResolution.Valid)
        return (resolution as ToolResolution.Valid).invocation
    }

    private fun invalid(name: String, args: Map<String, Any?>): ToolResolution.Invalid {
        val resolution = ToolCatalog.resolve(name, args)
        assertTrue("expected an invalid resolution, got $resolution", resolution is ToolResolution.Invalid)
        return resolution as ToolResolution.Invalid
    }
}
