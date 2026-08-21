package com.awesomeproject.security

import android.content.Context
import android.os.Build
import android.security.KeyPairGeneratorSpec
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.SecureRandom
import java.util.Calendar
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import javax.security.auth.x500.X500Principal

internal class KeystoreCipher(private val context: Context) {
    private val keyStore: KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    private val random = SecureRandom()
    private val filePublisher = KeystoreFilePublisher(::replaceFileAtomically)
    private val aesAliasInitializationTarget = File(
        context.noBackupFilesDir,
        AES_ALIAS_INITIALIZATION_LOCK_TARGET,
    )
    private val aesAliasInitializer = LockedAliasInitializer(
        lookup = ::findAesKey,
        lockBoundary = { action ->
            filePublisher.withLock(aesAliasInitializationTarget, action)
        },
        create = ::createAesKey,
    )

    fun encrypt(plaintext: ByteArray): ByteArray {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return encryptWithProviderIv(getOrCreateAesKey(), plaintext)
        }

        val dataKey = getOrCreateLegacyDataKey()
        try {
            return encryptWithExplicitIv(SecretKeySpec(dataKey, AES_KEY_ALGORITHM), plaintext)
        } finally {
            dataKey.fill(0)
        }
    }

    private fun encryptWithProviderIv(key: SecretKey, plaintext: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(AES_GCM_TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val iv = cipher.iv
        require(iv.size == KeystoreFileCodec.IV_SIZE_BYTES) {
            "Invalid provider-generated AES-GCM IV length"
        }
        return encodeEncryptedPayload(cipher, plaintext, iv)
    }

    private fun encryptWithExplicitIv(key: SecretKey, plaintext: ByteArray): ByteArray {
        val iv = ByteArray(KeystoreFileCodec.IV_SIZE_BYTES)
        random.nextBytes(iv)
        val cipher = Cipher.getInstance(AES_GCM_TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, iv))
        return encodeEncryptedPayload(cipher, plaintext, iv)
    }

    private fun encodeEncryptedPayload(
        cipher: Cipher,
        plaintext: ByteArray,
        iv: ByteArray,
    ): ByteArray {
        var ciphertext: ByteArray? = null
        try {
            ciphertext = cipher.doFinal(plaintext)
            return KeystoreFileCodec.encode(
                KeystoreFileCodec.CURRENT_VERSION,
                iv,
                ciphertext,
            )
        } finally {
            iv.fill(0)
            ciphertext?.fill(0)
        }
    }

    fun decrypt(payload: ByteArray): ByteArray = withSecretKey { key ->
        val decoded = KeystoreFileCodec.decode(payload)
        try {
            val cipher = Cipher.getInstance(AES_GCM_TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, decoded.iv))
            cipher.doFinal(decoded.ciphertext)
        } finally {
            decoded.iv.fill(0)
            decoded.ciphertext.fill(0)
        }
    }

    private fun <T> withSecretKey(block: (SecretKey) -> T): T {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return block(getOrCreateAesKey())
        }

        val dataKey = getOrCreateLegacyDataKey()
        try {
            return block(SecretKeySpec(dataKey, AES_KEY_ALGORITHM))
        } finally {
            dataKey.fill(0)
        }
    }

    private fun getOrCreateAesKey(): SecretKey = aesAliasInitializer.getOrCreate()

    private fun findAesKey(): SecretKey? = keyStore.getKey(AES_KEY_ALIAS, null) as? SecretKey

    private fun createAesKey(): SecretKey {
        val generator = KeyGenerator.getInstance(AES_KEY_ALGORITHM, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                AES_KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(AES_KEY_SIZE_BITS)
                .build(),
        )
        return generator.generateKey()
    }

    private fun getOrCreateLegacyDataKey(): ByteArray {
        val wrappedKeyFile = File(context.noBackupFilesDir, WRAPPED_DATA_KEY_FILE)
        val wrappedDataKey = filePublisher.loadOrInitialize(wrappedKeyFile) {
            val dataKey = ByteArray(AES_KEY_SIZE_BYTES)
            random.nextBytes(dataKey)
            try {
                wrapDataKey(dataKey)
            } finally {
                dataKey.fill(0)
            }
        }
        return unwrapDataKey(wrappedDataKey)
    }

    private fun wrapDataKey(dataKey: ByteArray): ByteArray {
        val certificate = getOrCreateLegacyRsaKeyPair().certificate
        val cipher = Cipher.getInstance(RSA_TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, certificate.publicKey)
        return cipher.doFinal(dataKey)
    }

    private fun unwrapDataKey(wrappedDataKey: ByteArray): ByteArray {
        try {
            val privateKey = keyStore.getKey(LEGACY_RSA_KEY_ALIAS, null)
                ?: throw CredentialStoreException(CODE_UNAVAILABLE)
            val cipher = Cipher.getInstance(RSA_TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, privateKey)
            return cipher.doFinal(wrappedDataKey)
        } finally {
            wrappedDataKey.fill(0)
        }
    }

    private fun getOrCreateLegacyRsaKeyPair(): KeyStore.PrivateKeyEntry {
        val existing = keyStore.getEntry(LEGACY_RSA_KEY_ALIAS, null) as? KeyStore.PrivateKeyEntry
        if (existing != null) {
            return existing
        }

        val start = Calendar.getInstance()
        val end = Calendar.getInstance().apply { add(Calendar.YEAR, 30) }
        val spec = KeyPairGeneratorSpec.Builder(context)
            .setAlias(LEGACY_RSA_KEY_ALIAS)
            .setSubject(X500Principal("CN=$LEGACY_RSA_KEY_ALIAS"))
            .setSerialNumber(BigInteger.ONE)
            .setStartDate(start.time)
            .setEndDate(end.time)
            .build()
        KeyPairGenerator.getInstance(RSA_ALGORITHM, ANDROID_KEYSTORE).apply {
            initialize(spec)
            generateKeyPair()
        }
        return keyStore.getEntry(LEGACY_RSA_KEY_ALIAS, null) as? KeyStore.PrivateKeyEntry
            ?: throw CredentialStoreException(CODE_UNAVAILABLE)
    }

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val AES_KEY_ALGORITHM = "AES"
        private const val AES_KEY_ALIAS = "a2a_credential_aes_v1"
        private const val AES_ALIAS_INITIALIZATION_LOCK_TARGET = "a2a_credential_aes_v1.init"
        private const val AES_KEY_SIZE_BITS = 256
        private const val AES_KEY_SIZE_BYTES = AES_KEY_SIZE_BITS / 8
        private const val AES_GCM_TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_BITS = 128
        private const val LEGACY_RSA_KEY_ALIAS = "a2a_credential_rsa_v1"
        private const val RSA_ALGORITHM = "RSA"
        private const val RSA_TRANSFORMATION = "RSA/ECB/PKCS1Padding"
        private const val WRAPPED_DATA_KEY_FILE = "a2a_credential_data_key_v1.bin"
        private const val CODE_UNAVAILABLE = "E_KEYSTORE_UNAVAILABLE"
    }
}
