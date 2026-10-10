package com.awesomeproject.lanmcp

import java.security.MessageDigest

/**
 * Bearer authentication for the LAN MCP endpoint.
 *
 * The supplied token is compared against the stored connection code with a
 * constant-time comparison over fixed-size SHA-256 digests, so neither content nor
 * length differences are observable through timing. The expected secret is held as
 * a byte array and wiped by the caller when the service stops.
 */
object BearerAuth {

    sealed class Verdict {
        object Authorized : Verdict()
        object MissingHeader : Verdict()
        object MalformedHeader : Verdict()
        object InvalidToken : Verdict()
    }

    private const val SCHEME = "bearer"

    /**
     * SHA-256 instance per thread. A [ThreadLocal] subclass is used instead of
     * `ThreadLocal.withInitial` (API 26+) so this keeps working on minSdk 21.
     */
    private val digestHolder = object : ThreadLocal<MessageDigest>() {
        override fun initialValue(): MessageDigest = MessageDigest.getInstance("SHA-256")
    }

    fun authorize(header: String?, expected: ByteArray?): Verdict {
        if (header == null || header.isBlank()) return Verdict.MissingHeader
        val trimmed = header.trim()
        val separator = trimmed.indexOf(' ')
        if (separator <= 0) return Verdict.MalformedHeader
        val scheme = trimmed.substring(0, separator)
        if (!scheme.equals(SCHEME, ignoreCase = true)) return Verdict.MalformedHeader
        val token = trimmed.substring(separator + 1).trim()
        if (token.isEmpty()) return Verdict.InvalidToken
        for (ch in token) {
            if (ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r') return Verdict.MalformedHeader
        }
        if (expected == null || expected.isEmpty()) return Verdict.InvalidToken
        val presented = token.toByteArray(Charsets.UTF_8)
        return try {
            if (constantTimeEquals(presented, expected)) Verdict.Authorized else Verdict.InvalidToken
        } finally {
            presented.fill(0)
        }
    }

    /** True when both byte arrays hash to the same 32-byte digest; leaks only equality. */
    fun constantTimeEquals(a: ByteArray, b: ByteArray): Boolean {
        if (a.isEmpty() || b.isEmpty()) return false
        val digestA = digest(a)
        val digestB = digest(b)
        return try {
            MessageDigest.isEqual(digestA, digestB)
        } finally {
            digestA.fill(0)
            digestB.fill(0)
        }
    }

    private fun digest(value: ByteArray): ByteArray {
        val instance = digestHolder.get() ?: MessageDigest.getInstance("SHA-256")
        instance.reset()
        return instance.digest(value)
    }
}
