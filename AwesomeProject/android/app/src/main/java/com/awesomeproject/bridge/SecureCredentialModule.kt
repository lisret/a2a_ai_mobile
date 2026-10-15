package com.awesomeproject.bridge

import com.awesomeproject.security.AndroidKeystoreCredentialStore
import com.awesomeproject.security.CredentialStore
import com.awesomeproject.security.CredentialStoreException
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.FileNotFoundException

class SecureCredentialModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val credentialStore: CredentialStore = AndroidKeystoreCredentialStore(reactContext)

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(credentialStore.isAvailable())
    }

    @ReactMethod
    fun put(secretRef: String, plaintext: String, promise: Promise) {
        var bytes: ByteArray? = null
        try {
            bytes = plaintext.toByteArray(Charsets.UTF_8)
            credentialStore.put(secretRef, bytes)
            promise.resolve(null)
        } catch (error: Exception) {
            reject(promise, error)
        } finally {
            bytes?.fill(0)
        }
    }

    @ReactMethod
    fun get(secretRef: String, promise: Promise) {
        var bytes: ByteArray? = null
        try {
            bytes = credentialStore.get(secretRef)
            promise.resolve(bytes?.toString(Charsets.UTF_8))
        } catch (error: Exception) {
            reject(promise, error)
        } finally {
            bytes?.fill(0)
        }
    }

    @ReactMethod
    fun delete(secretRef: String, promise: Promise) {
        try {
            credentialStore.delete(secretRef)
            promise.resolve(null)
        } catch (error: Exception) {
            reject(promise, error)
        }
    }

    private fun reject(promise: Promise, error: Exception) {
        when (error) {
            is CredentialStoreException -> promise.reject(error.code, error.code)
            is IllegalArgumentException -> promise.reject(CODE_INVALID_SECRET_REF, CODE_INVALID_SECRET_REF)
            is FileNotFoundException -> promise.reject(CODE_SECRET_NOT_FOUND, CODE_SECRET_NOT_FOUND)
            else -> promise.reject(CODE_FAILURE, CODE_FAILURE)
        }
    }

    companion object {
        private const val MODULE_NAME = "SecureCredentialModule"
        private const val CODE_INVALID_SECRET_REF = "E_INVALID_SECRET_REF"
        private const val CODE_SECRET_NOT_FOUND = "E_SECRET_NOT_FOUND"
        private const val CODE_FAILURE = "E_KEYSTORE_FAILURE"
    }
}
