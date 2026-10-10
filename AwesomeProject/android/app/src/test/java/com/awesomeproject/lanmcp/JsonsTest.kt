package com.awesomeproject.lanmcp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class JsonsTest {

    @Suppress("UNCHECKED_CAST")
    private fun asObject(value: Any?): Map<String, Any?> = value as Map<String, Any?>

    @Suppress("UNCHECKED_CAST")
    private fun asArray(value: Any?): List<Any?> = value as List<Any?>

    @Test
    fun roundTripsObjectWithAllScalarTypes() {
        val original = Jsons.obj(
            "int" to 1L,
            "text" to "quote\"back\\slash\nnewline\ttab",
            "flag" to true,
            "nothing" to null,
            "items" to listOf(1L, 2L, 3L),
            "nested" to Jsons.obj("inner" to "value"),
        )
        val parsed = asObject(Jsons.parse(Jsons.write(original)))

        assertEquals(1L, parsed["int"])
        assertEquals("quote\"back\\slash\nnewline\ttab", parsed["text"])
        assertEquals(true, parsed["flag"])
        assertNull(parsed["nothing"])
        assertEquals(listOf<Any?>(1L, 2L, 3L), asArray(parsed["items"]))
        assertEquals("value", asObject(parsed["nested"])["inner"])
    }

    @Test
    fun preservesObjectKeyOrder() {
        val written = Jsons.write(Jsons.obj("b" to 1L, "a" to 2L, "c" to 3L))
        assertEquals("{\"b\":1,\"a\":2,\"c\":3}", written)
    }

    @Test
    fun decodesIntegralNumbersAsLongAndFractionsAsDouble() {
        assertEquals(12L, Jsons.parse("12"))
        assertEquals(-7L, Jsons.parse("-7"))
        assertEquals(0L, Jsons.parse("-0"))
        assertEquals(1.5, Jsons.parse("1.5"))
        assertEquals(150.0, Jsons.parse("1.5e2"))
    }

    @Test
    fun writesIntegralDoublesWithoutFraction() {
        assertEquals("3", Jsons.write(3.0))
        assertEquals("2.5", Jsons.write(2.5))
    }

    @Test
    fun escapesControlCharacters() {
        assertEquals("\"\\u0001\"", Jsons.write("\u0001"))
        assertEquals("\"\\n\\r\\t\\b\\f\"", Jsons.write("\n\r\t\b\u000C"))
    }

    @Test
    fun decodesUnicodeEscapes() {
        assertEquals("A", Jsons.parse("\"\\u0041\""))
    }

    @Test
    fun parsesEmptyContainers() {
        assertEquals(0, asObject(Jsons.parse("{}")).size)
        assertEquals(0, asArray(Jsons.parse("[]")).size)
    }

    @Test
    fun rejectsMalformedInput() {
        assertThrowsJson { Jsons.parse("") }
        assertThrowsJson { Jsons.parse("{") }
        assertThrowsJson { Jsons.parse("{\"a\":1,}") }
        assertThrowsJson { Jsons.parse("[1,]") }
        assertThrowsJson { Jsons.parse("{\"a\" 1}") }
        assertThrowsJson { Jsons.parse("01") }
        assertThrowsJson { Jsons.parse("1.2.3") }
        assertThrowsJson { Jsons.parse("tru") }
        assertThrowsJson { Jsons.parse("\"unterminated") }
        assertThrowsJson { Jsons.parse("\"bad\\qescape\"") }
        assertThrowsJson { Jsons.parse("{\"a\":1}trailing") }
    }

    @Test
    fun rejectsRawControlCharactersInsideStrings() {
        assertThrowsJson { Jsons.parse("\"line\nbreak\"") }
    }

    @Test
    fun enforcesDepthLimit() {
        val deep = "[".repeat(Jsons.MAX_DEPTH + 5) + "]".repeat(Jsons.MAX_DEPTH + 5)
        assertThrowsJson { Jsons.parse(deep) }
        val allowed = "[".repeat(3) + "]".repeat(3)
        assertTrue(Jsons.parse(allowed) is List<*>)
    }

    @Test
    fun asMapRejectsNonObjectValues() {
        assertNull(Jsons.asMap("text"))
        assertNull(Jsons.asMap(null))
        assertNull(Jsons.asMap(listOf(1L)))
        assertEquals("v", Jsons.asMap(Jsons.obj("k" to "v"))?.get("k"))
    }

    @Test
    fun rejectsNonFiniteNumbersOnWrite() {
        assertThrowsJson { Jsons.write(Double.NaN) }
        assertThrowsJson { Jsons.write(Double.POSITIVE_INFINITY) }
    }

    private fun assertThrowsJson(body: () -> Unit) {
        try {
            body()
            fail("expected JsonException")
        } catch (expected: JsonException) {
            // expected
        }
    }
}
