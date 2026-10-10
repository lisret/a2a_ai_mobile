package com.awesomeproject.lanmcp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ConnectionCodeTest {

    @Test
    fun acceptsMinimumLength() {
        assertTrue(ConnectionCode.isValid("abcdefghijkl"))
        assertNull(ConnectionCode.validate("abcdefghijkl"))
    }

    @Test
    fun acceptsMaximumLength() {
        assertTrue(ConnectionCode.isValid("a".repeat(128)))
        assertNull(ConnectionCode.validate("a".repeat(128)))
    }

    @Test
    fun rejectsLengthsOutsideBounds() {
        assertFalse(ConnectionCode.isValid("a".repeat(11)))
        assertFalse(ConnectionCode.isValid("a".repeat(129)))
        assertFalse(ConnectionCode.isValid(""))
        assertFalse(ConnectionCode.isValid(null))
        assertEquals(Codes.INVALID_CODE, ConnectionCode.validate("a".repeat(11)))
        assertEquals(Codes.INVALID_CODE, ConnectionCode.validate("a".repeat(129)))
        assertEquals(Codes.INVALID_CODE, ConnectionCode.validate(null))
        assertEquals(Codes.INVALID_CODE, ConnectionCode.validate(""))
    }

    @Test
    fun acceptsHyphenAndUnderscore() {
        assertTrue(ConnectionCode.isValid("abc-def_ghij"))
        assertTrue(ConnectionCode.isValid("-".repeat(12)))
        assertTrue(ConnectionCode.isValid("_".repeat(12)))
        assertTrue(ConnectionCode.isValid("a-b_c-d_e-f_"))
    }

    @Test
    fun rejectsCharactersOutsideTheFrozenAlphabet() {
        assertFalse(ConnectionCode.isValid("abcdefghij k"))
        assertFalse(ConnectionCode.isValid("abcdefghijk!"))
        assertFalse(ConnectionCode.isValid("abcdefghij.k"))
        assertFalse(ConnectionCode.isValid("abcdefghij+k"))
        assertFalse(ConnectionCode.isValid("密码密码密码密码密码密码"))
        assertFalse(ConnectionCode.isValid("abcdefghijk\n"))
        assertFalse(ConnectionCode.isValid("abcdefghij\tk"))
    }

    @Test
    fun rejectsHugeInputWithoutRegexWork() {
        assertFalse(ConnectionCode.isValid("a".repeat(100_000)))
    }

    @Test
    fun documentsThePolicy() {
        assertTrue(ConnectionCode.describePolicy().contains("12-128"))
    }

    @Test
    fun secretReferenceMatchesTheKeystoreStoreContract() {
        // AndroidKeystoreCredentialStore requires ^[a-z0-9][a-z0-9:._-]{2,127}$ (case-insensitive).
        assertTrue(Regex("^[a-z0-9][a-z0-9:._-]{2,127}$", RegexOption.IGNORE_CASE).matches(ConnectionCode.SECRET_REF))
    }
}
