package com.awesomeproject.security

object KeystoreFileCodec {
    const val CURRENT_VERSION: Int = 1
    const val IV_SIZE_BYTES: Int = 12

    data class Payload(
        val version: Int,
        val iv: ByteArray,
        val ciphertext: ByteArray,
    )

    fun encode(version: Int, iv: ByteArray, ciphertext: ByteArray): ByteArray {
        require(version == CURRENT_VERSION) { "Unsupported credential payload version" }
        require(iv.size == IV_SIZE_BYTES) { "Invalid AES-GCM IV length" }
        require(ciphertext.isNotEmpty()) { "Missing ciphertext" }

        return byteArrayOf(version.toByte()) + iv + ciphertext
    }

    fun decode(payload: ByteArray): Payload {
        require(payload.size > 1 + IV_SIZE_BYTES) { "Truncated credential payload" }

        val version = payload[0].toInt() and 0xff
        require(version == CURRENT_VERSION) { "Unsupported credential payload version" }

        return Payload(
            version = version,
            iv = payload.copyOfRange(1, 1 + IV_SIZE_BYTES),
            ciphertext = payload.copyOfRange(1 + IV_SIZE_BYTES, payload.size),
        )
    }
}
