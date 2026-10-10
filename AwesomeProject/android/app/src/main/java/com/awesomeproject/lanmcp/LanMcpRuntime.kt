package com.awesomeproject.lanmcp

import android.content.Context
import com.awesomeproject.security.AndroidKeystoreCredentialStore

/**
 * Shared access to the connection code and the exact `getStatus()` payload.
 *
 * The code lives only in the Android Keystore-backed store (never in SharedPreferences,
 * AsyncStorage or a log). [LanMcpState.snapshot] reports only whether a code exists.
 */
object LanMcpRuntime {

    /** Returns the stored code bytes, or null when no code is configured. */
    fun readCode(context: Context): ByteArray? {
        return try {
            AndroidKeystoreCredentialStore(context.applicationContext).get(ConnectionCode.SECRET_REF)
        } catch (error: Exception) {
            null
        }
    }

    /** Returns the stored code as text, or null. Callers must not persist or log it. */
    fun readCodeText(context: Context): String? {
        val bytes = readCode(context) ?: return null
        return try {
            String(bytes, Charsets.UTF_8)
        } finally {
            bytes.fill(0)
        }
    }

    /**
     * Stores a validated connection code. Throws `CredentialStoreException` when the
     * Keystore is unavailable or the write fails.
     */
    fun storeCode(context: Context, code: String) {
        val bytes = code.toByteArray(Charsets.UTF_8)
        try {
            AndroidKeystoreCredentialStore(context.applicationContext).put(ConnectionCode.SECRET_REF, bytes)
        } finally {
            bytes.fill(0)
        }
    }

    fun codeConfigured(context: Context): Boolean {
        val bytes = readCode(context) ?: return false
        bytes.fill(0)
        return true
    }

    fun status(context: Context): LinkedHashMap<String, Any?> = LanMcpState.snapshot(codeConfigured(context))

    /** Wi-Fi private IPv4 currently available for binding, or null. */
    fun currentBindAddress(context: Context): String? = LanNetwork.privateWifiIpv4(context.applicationContext)
}
