package com.awesomeproject.bridge

import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors
import javax.net.ssl.HttpsURLConnection

/**
 * 本地资源包管理原生模块 (Local Pack native module)
 *
 * 头像 / ASR 等离线资源包统一存放于应用私有目录：
 *   `context.filesDir/nono/{kind}/{id}/`
 *
 * [installFromUrl] 只允许 HTTPS，先写入 `{id}.part` 临时文件，
 * 校验字节数与小写 hex SHA-256 后原子 rename 为目标文件；
 * 任一步失败都会删除 part 文件，绝不留下半成品当成品。
 *
 * Downloads/stores offline packs under the app-private `nono` dir with
 * atomic, checksum-verified installs. Register in AccessibilityPackage.
 */
class LocalPackModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val io = Executors.newSingleThreadExecutor()

    override fun getName() = "LocalPackModule"

    @ReactMethod
    fun getFreeBytes(promise: Promise) {
        try {
            promise.resolve(reactApplicationContext.filesDir.usableSpace.toDouble())
        } catch (error: Exception) {
            promise.reject(CODE_FAILURE, error.message, error)
        }
    }

    @ReactMethod
    fun getNetworkType(promise: Promise) {
        try {
            val manager =
                reactApplicationContext.getSystemService(ReactApplicationContext.CONNECTIVITY_SERVICE)
                    as? ConnectivityManager
            val network = manager?.activeNetwork
            val capabilities = network?.let { manager.getNetworkCapabilities(it) }
            val type = when {
                manager == null || network == null || capabilities == null -> "none"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
                else -> "unknown"
            }
            promise.resolve(type)
        } catch (error: Exception) {
            promise.reject(CODE_FAILURE, error.message, error)
        }
    }

    @ReactMethod
    fun listFiles(kind: String, id: String, promise: Promise) {
        try {
            val dir = root(kind, id)
            val result = Arguments.createArray()
            if (dir.isDirectory) {
                dir.listFiles()
                    ?.filter { it.isFile }
                    ?.map { it.name }
                    ?.sorted()
                    ?.forEach { result.pushString(it) }
            }
            promise.resolve(result)
        } catch (error: IllegalArgumentException) {
            promise.reject(CODE_INVALID_ARG, error.message, error)
        } catch (error: Exception) {
            promise.reject(CODE_FAILURE, error.message, error)
        }
    }

    @ReactMethod
    fun getFileUri(kind: String, id: String, fileName: String, promise: Promise) {
        try {
            val file = fileIn(root(kind, id), fileName)
            if (!file.isFile) {
                promise.reject(CODE_NOT_FOUND, CODE_NOT_FOUND)
                return
            }
            promise.resolve("file://${file.absolutePath}")
        } catch (error: IllegalArgumentException) {
            promise.reject(CODE_INVALID_ARG, error.message, error)
        } catch (error: Exception) {
            promise.reject(CODE_FAILURE, error.message, error)
        }
    }

    @ReactMethod
    fun writeText(kind: String, id: String, fileName: String, body: String, promise: Promise) {
        try {
            val dir = root(kind, id)
            val file = fileIn(dir, fileName)
            dir.mkdirs()
            file.writeText(body, Charsets.UTF_8)
            promise.resolve(null)
        } catch (error: IllegalArgumentException) {
            promise.reject(CODE_INVALID_ARG, error.message, error)
        } catch (error: Exception) {
            promise.reject(CODE_FAILURE, error.message, error)
        }
    }

    @ReactMethod
    fun deletePack(kind: String, id: String, promise: Promise) {
        try {
            root(kind, id).deleteRecursively()
            promise.resolve(null)
        } catch (error: IllegalArgumentException) {
            promise.reject(CODE_INVALID_ARG, error.message, error)
        } catch (error: Exception) {
            promise.reject(CODE_FAILURE, error.message, error)
        }
    }

    @ReactMethod
    fun installFromUrl(
        kind: String,
        id: String,
        url: String,
        bytes: Double,
        sha256: String,
        fileName: String,
        promise: Promise,
    ) {
        io.execute {
            var part: File? = null
            try {
                val dir = root(kind, id)
                val target = fileIn(dir, fileName)
                if (!sha256.matches(SHA256_REGEX)) {
                    throw IllegalArgumentException(CODE_INVALID_SHA256)
                }
                val expectedBytes = bytes.toLong()
                if (expectedBytes <= 0L) {
                    throw IllegalArgumentException(CODE_INVALID_BYTES)
                }
                val parsed = URL(url)
                if (!parsed.protocol.equals("https", ignoreCase = true)) {
                    throw IllegalArgumentException(CODE_INVALID_URL)
                }

                dir.mkdirs()
                part = File(dir, "$id.part")
                if (part.exists()) {
                    part.delete()
                }

                val digest = MessageDigest.getInstance("SHA-256")
                var total = 0L
                val connection = parsed.openConnection() as HttpsURLConnection
                try {
                    connection.connectTimeout = CONNECT_TIMEOUT_MS
                    connection.readTimeout = READ_TIMEOUT_MS
                    connection.instanceFollowRedirects = true
                    connection.inputStream.use { input ->
                        part.outputStream().use { output ->
                            val buffer = ByteArray(BUFFER_SIZE)
                            while (true) {
                                val read = input.read(buffer)
                                if (read < 0) break
                                output.write(buffer, 0, read)
                                digest.update(buffer, 0, read)
                                total += read
                            }
                            output.flush()
                        }
                    }
                } finally {
                    connection.disconnect()
                }

                if (total != expectedBytes) {
                    throw IllegalStateException(CODE_SIZE_MISMATCH)
                }
                val actualHex = digest.digest().joinToString("") { "%02x".format(it) }
                if (actualHex != sha256) {
                    throw IllegalStateException(CODE_HASH_MISMATCH)
                }

                if (!part.renameTo(target)) {
                    throw IllegalStateException(CODE_RENAME_FAILED)
                }
                part = null
                promise.resolve(target.absolutePath)
            } catch (error: IllegalArgumentException) {
                part?.delete()
                promise.reject(CODE_INVALID_ARG, error.message, error)
            } catch (error: Exception) {
                part?.delete()
                promise.reject(CODE_FAILURE, error.message, error)
            }
        }
    }

    private fun root(kind: String, id: String): File {
        require(kind == "avatars" || kind == "asr")
        require(id.matches(ID_REGEX))
        return File(reactApplicationContext.filesDir, "nono/$kind/$id")
    }

    private fun fileIn(dir: File, fileName: String): File {
        require(fileName.matches(FILE_NAME_REGEX))
        require(fileName != "." && fileName != "..")
        require(!fileName.contains("..") && !fileName.contains("/"))
        return File(dir, fileName)
    }

    companion object {
        private val ID_REGEX = Regex("^[a-z0-9._-]+$")
        private val FILE_NAME_REGEX = Regex("^[A-Za-z0-9._-]+$")
        private val SHA256_REGEX = Regex("^[a-f0-9]{64}$")
        private const val BUFFER_SIZE = 8192
        private const val CONNECT_TIMEOUT_MS = 15000
        private const val READ_TIMEOUT_MS = 30000
        private const val CODE_FAILURE = "E_LOCAL_PACK_FAILURE"
        private const val CODE_INVALID_ARG = "E_INVALID_ARG"
        private const val CODE_NOT_FOUND = "E_NOT_FOUND"
        private const val CODE_INVALID_SHA256 = "invalid_sha256"
        private const val CODE_INVALID_URL = "invalid_url"
        private const val CODE_INVALID_BYTES = "invalid_bytes"
        private const val CODE_SIZE_MISMATCH = "E_SIZE_MISMATCH"
        private const val CODE_HASH_MISMATCH = "E_HASH_MISMATCH"
        private const val CODE_RENAME_FAILED = "E_RENAME_FAILED"
    }
}
