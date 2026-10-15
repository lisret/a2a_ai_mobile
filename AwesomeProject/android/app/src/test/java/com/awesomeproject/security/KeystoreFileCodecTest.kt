package com.awesomeproject.security

fun main() {
    roundTripsVersionIvAndCiphertext()
    rejectsTruncatedPayload()
    rejectsUnsupportedVersion()
}

private fun roundTripsVersionIvAndCiphertext() {
    val iv = ByteArray(12) { it.toByte() }
    val ciphertext = byteArrayOf(9, 8, 7, 6)

    val decoded = KeystoreFileCodec.decode(KeystoreFileCodec.encode(1, iv, ciphertext))

    check(decoded.version == 1)
    check(decoded.iv.contentEquals(iv))
    check(decoded.ciphertext.contentEquals(ciphertext))
}

private fun rejectsTruncatedPayload() {
    assertIllegalArgument {
        KeystoreFileCodec.decode(byteArrayOf(1, 0, 1))
    }
}

private fun rejectsUnsupportedVersion() {
    assertIllegalArgument {
        KeystoreFileCodec.decode(byteArrayOf(2) + ByteArray(12) + byteArrayOf(1))
    }
}

private fun assertIllegalArgument(block: () -> Unit) {
    try {
        block()
        error("Expected IllegalArgumentException")
    } catch (_: IllegalArgumentException) {
    }
}
