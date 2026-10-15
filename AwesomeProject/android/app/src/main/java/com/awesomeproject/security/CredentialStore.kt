package com.awesomeproject.security

interface CredentialStore {
    fun isAvailable(): Boolean
    fun put(secretRef: String, plaintext: ByteArray)
    fun get(secretRef: String): ByteArray?
    fun delete(secretRef: String)
}

class CredentialStoreException(
    val code: String,
    cause: Throwable? = null,
) : RuntimeException(code, cause)
