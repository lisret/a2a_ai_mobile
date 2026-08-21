package com.awesomeproject.security

import android.content.Context
import java.io.File
import java.security.MessageDigest
import java.util.Locale

class AndroidKeystoreCredentialStore(context: Context) : CredentialStore {
    private val applicationContext = context.applicationContext
    private val keystoreCipher = KeystoreCipher(applicationContext)
    private val credentialsDirectory = File(applicationContext.noBackupFilesDir, CREDENTIALS_DIRECTORY)
    private val filePublisher = KeystoreFilePublisher(::replaceFileAtomically)

    override fun isAvailable(): Boolean {
        val probe = byteArrayOf(0x41)
        var encrypted: ByteArray? = null
        var decrypted: ByteArray? = null
        return try {
            encrypted = keystoreCipher.encrypt(probe)
            decrypted = keystoreCipher.decrypt(encrypted)
            probe.contentEquals(decrypted)
        } catch (_: Throwable) {
            false
        } finally {
            probe.fill(0)
            encrypted?.fill(0)
            decrypted?.fill(0)
        }
    }

    override fun put(secretRef: String, plaintext: ByteArray) {
        validateSecretRef(secretRef)
        if (plaintext.isEmpty()) {
            throw CredentialStoreException(CODE_EMPTY_PLAINTEXT)
        }
        if (!isAvailable()) {
            throw CredentialStoreException(CODE_UNAVAILABLE)
        }

        var encrypted: ByteArray? = null
        try {
            encrypted = keystoreCipher.encrypt(plaintext)
            writeEncryptedValue(storageFile(secretRef), encrypted)
        } catch (error: CredentialStoreException) {
            throw error
        } catch (error: Exception) {
            throw CredentialStoreException(CODE_FAILURE, error)
        } finally {
            encrypted?.fill(0)
        }
    }

    override fun get(secretRef: String): ByteArray? {
        validateSecretRef(secretRef)
        if (!isAvailable()) {
            throw CredentialStoreException(CODE_UNAVAILABLE)
        }

        var encrypted: ByteArray? = null
        return try {
            encrypted = filePublisher.readOrNull(storageFile(secretRef)) ?: return null
            keystoreCipher.decrypt(encrypted)
        } catch (error: CredentialStoreException) {
            throw error
        } catch (error: Exception) {
            throw CredentialStoreException(CODE_FAILURE, error)
        } finally {
            encrypted?.fill(0)
        }
    }

    override fun delete(secretRef: String) {
        validateSecretRef(secretRef)
        try {
            if (!filePublisher.delete(storageFile(secretRef), ::deleteFileAndSync)) {
                throw CredentialStoreException(CODE_FAILURE)
            }
        } catch (error: CredentialStoreException) {
            throw error
        } catch (error: Exception) {
            throw CredentialStoreException(CODE_FAILURE, error)
        }
    }

    private fun validateSecretRef(secretRef: String) {
        if (!SECRET_REF_PATTERN.matches(secretRef)) {
            throw CredentialStoreException(CODE_INVALID_SECRET_REF)
        }
    }

    private fun storageFile(secretRef: String): File {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(secretRef.toByteArray(Charsets.UTF_8))
            .joinToString(separator = "") { byte ->
                String.format(Locale.US, "%02x", byte.toInt() and 0xff)
            }
        return File(credentialsDirectory, "$digest.bin")
    }

    private fun writeEncryptedValue(target: File, encrypted: ByteArray) {
        filePublisher.publish(target, encrypted)
    }

    companion object {
        private val SECRET_REF_PATTERN = Regex("^[a-z0-9][a-z0-9:._-]{2,127}$", RegexOption.IGNORE_CASE)
        private const val CREDENTIALS_DIRECTORY = "a2a_credentials"
        private const val CODE_INVALID_SECRET_REF = "E_INVALID_SECRET_REF"
        private const val CODE_EMPTY_PLAINTEXT = "E_EMPTY_PLAINTEXT"
        private const val CODE_UNAVAILABLE = "E_KEYSTORE_UNAVAILABLE"
        private const val CODE_FAILURE = "E_KEYSTORE_FAILURE"
    }
}
