package com.awesomeproject.lanmcp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BearerAuthTest {

    private val code = "abcdefghijkl"
    private val expected = code.toByteArray(Charsets.UTF_8)

    @Test
    fun authorizesExactToken() {
        assertEquals(BearerAuth.Verdict.Authorized, BearerAuth.authorize("Bearer $code", expected))
    }

    @Test
    fun schemeIsCaseInsensitiveAndWhitespaceTolerant() {
        assertEquals(BearerAuth.Verdict.Authorized, BearerAuth.authorize("bearer $code", expected))
        assertEquals(BearerAuth.Verdict.Authorized, BearerAuth.authorize("BEARER   $code  ", expected))
    }

    @Test
    fun reportsMissingHeader() {
        assertEquals(BearerAuth.Verdict.MissingHeader, BearerAuth.authorize(null, expected))
        assertEquals(BearerAuth.Verdict.MissingHeader, BearerAuth.authorize("", expected))
        assertEquals(BearerAuth.Verdict.MissingHeader, BearerAuth.authorize("   ", expected))
    }

    @Test
    fun reportsMalformedHeader() {
        assertEquals(BearerAuth.Verdict.MalformedHeader, BearerAuth.authorize("Bearer", expected))
        assertEquals(BearerAuth.Verdict.MalformedHeader, BearerAuth.authorize("Bearer ", expected))
        assertEquals(BearerAuth.Verdict.MalformedHeader, BearerAuth.authorize("Basic $code", expected))
        assertEquals(BearerAuth.Verdict.MalformedHeader, BearerAuth.authorize("Token$code", expected))
    }

    @Test
    fun rejectsTokensWithInternalWhitespace() {
        assertEquals(BearerAuth.Verdict.MalformedHeader, BearerAuth.authorize("Bearer abc def", expected))
        assertEquals(BearerAuth.Verdict.MalformedHeader, BearerAuth.authorize("Bearer abc\tdef", expected))
        assertEquals(BearerAuth.Verdict.MalformedHeader, BearerAuth.authorize("Bearer abc\ndef", expected))
    }

    @Test
    fun rejectsWrongTokenIncludingPrefixesAndSuffixes() {
        assertEquals(BearerAuth.Verdict.InvalidToken, BearerAuth.authorize("Bearer abcdefghijkm", expected))
        assertEquals(BearerAuth.Verdict.InvalidToken, BearerAuth.authorize("Bearer abcdefghijklm", expected))
        assertEquals(BearerAuth.Verdict.InvalidToken, BearerAuth.authorize("Bearer bcdefghijkl", expected))
        assertEquals(BearerAuth.Verdict.InvalidToken, BearerAuth.authorize("Bearer ABCDEFGHIJKL", expected))
    }

    @Test
    fun rejectsWhenNoCodeIsConfigured() {
        assertEquals(BearerAuth.Verdict.InvalidToken, BearerAuth.authorize("Bearer $code", null))
        assertEquals(BearerAuth.Verdict.InvalidToken, BearerAuth.authorize("Bearer $code", ByteArray(0)))
    }

    @Test
    fun constantTimeEqualsHandlesEqualDifferentAndUnequalLengths() {
        assertTrue(BearerAuth.constantTimeEquals("abc".toByteArray(), "abc".toByteArray()))
        assertTrue(BearerAuth.constantTimeEquals("密码".toByteArray(), "密码".toByteArray()))
        assertFalse(BearerAuth.constantTimeEquals("abc".toByteArray(), "abd".toByteArray()))
        assertFalse(BearerAuth.constantTimeEquals("abc".toByteArray(), "abcd".toByteArray()))
        assertFalse(BearerAuth.constantTimeEquals("abcd".toByteArray(), "abc".toByteArray()))
        assertFalse(BearerAuth.constantTimeEquals(ByteArray(0), ByteArray(0)))
        assertFalse(BearerAuth.constantTimeEquals(ByteArray(0), "a".toByteArray()))
    }

    @Test
    fun singleCharacterDifferenceIsDetectedAtEveryPosition() {
        val reference = "0123456789ab".toByteArray()
        for (index in reference.indices) {
            val mutated = reference.copyOf()
            mutated[index] = 'X'.code.toByte()
            assertFalse("difference at $index must be detected", BearerAuth.constantTimeEquals(reference, mutated))
        }
    }
}
