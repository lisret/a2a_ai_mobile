package com.awesomeproject.lanmcp

/**
 * Connection-code policy for the LAN MCP service.
 *
 * A connection code is the Bearer credential for every HTTP request. It is
 * validated here (pure, unit-testable) and stored on device through
 * `AndroidKeystoreCredentialStore` under [SECRET_REF]. It is never logged, never
 * returned by `getStatus` and never written into an exported guide.
 */
object ConnectionCode {

    const val MIN_LENGTH = 12
    const val MAX_LENGTH = 128

    /** Hard cap checked before the regex so a huge input cannot force regex work. */
    private const val HARD_INPUT_CAP = 512

    private val ALLOWED = Regex("^[A-Za-z0-9_-]+$")

    /** Secret reference understood by `AndroidKeystoreCredentialStore`. */
    const val SECRET_REF = "lanmcp:connection-code"

    fun isValid(code: String?): Boolean {
        if (code == null) return false
        if (code.length < MIN_LENGTH || code.length > MAX_LENGTH) return false
        if (code.length > HARD_INPUT_CAP) return false
        for (ch in code) {
            if (!(ch in 'a'..'z' || ch in 'A'..'Z' || ch in '0'..'9' || ch == '-' || ch == '_')) return false
        }
        return ALLOWED.matches(code)
    }

    /** Returns null when valid, otherwise a stable error code. */
    fun validate(code: String?): String? {
        if (code == null || code.isEmpty()) return Codes.INVALID_CODE
        if (code.length < MIN_LENGTH || code.length > MAX_LENGTH) return Codes.INVALID_CODE
        if (!isValid(code)) return Codes.INVALID_CODE
        return null
    }

    fun describePolicy(): String =
        "$MIN_LENGTH-$MAX_LENGTH characters, matching $ALLOWED (ASCII letters, digits, '-' and '_')"
}
