package com.awesomeproject.bridge

import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors
import javax.net.ssl.HttpsURLConnection
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import org.json.JSONArray

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

    /**
     * 从 APK assets 的 [assetDir] 安装一个包：按 pins 的 name/bytes/sha256 逐文件校验拷贝。
     * 若目标文件已存在且哈希匹配则跳过（首页 focus 可重复调用，命中即 no-op）。
     * assetDir 相对 `assets/`（如 `nono-asr/builtin`），fileName 必须扁平。
     */
    @ReactMethod
    fun installFromAssets(
        kind: String,
        id: String,
        assetDir: String,
        filesJson: String,
        promise: Promise,
    ) {
        io.execute {
            try {
                val dir = root(kind, id)
                dir.mkdirs()
                val files = JSONArray(filesJson)
                val assets = reactApplicationContext.assets
                for (i in 0 until files.length()) {
                    val entry = files.getJSONObject(i)
                    val name = entry.getString("name")
                    val expectedBytes = entry.getLong("bytes")
                    val expectedSha = entry.getString("sha256")
                    val target = fileIn(dir, name)
                    if (target.isFile &&
                        target.length() == expectedBytes &&
                        sha256Of(target) == expectedSha
                    ) {
                        continue
                    }
                    val part = File(dir, "$name.part")
                    if (part.exists()) part.delete()
                    val digest = MessageDigest.getInstance("SHA-256")
                    var total = 0L
                    assets.open("$assetDir/$name").use { input ->
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
                    val hex = digest.digest().joinToString("") { "%02x".format(it) }
                    if (total != expectedBytes || hex != expectedSha) {
                        part.delete()
                        throw IllegalStateException(CODE_HASH_MISMATCH)
                    }
                    if (!part.renameTo(target)) {
                        part.delete()
                        throw IllegalStateException(CODE_RENAME_FAILED)
                    }
                }
                promise.resolve(null)
            } catch (error: IllegalArgumentException) {
                promise.reject(CODE_INVALID_ARG, error.message, error)
            } catch (error: Exception) {
                promise.reject(CODE_FAILURE, error.message, error)
            }
        }
    }

    /**
     * 下载 tar.bz2 到 `nono/{kind}/{id}.part`（与 avatars 的包内 `{id}.part` 不冲突），
     * 校验 archive 字节数 + SHA-256 后，仅解压 pins 声明的文件到 pack 目录并逐一校验。
     * 任一文件缺失/不符即删除整包并 reject —— 绝不留下半损坏的升级目录。
     */
    @ReactMethod
    fun installArchiveFromUrl(
        kind: String,
        id: String,
        url: String,
        bytes: Double,
        sha256: String,
        filesJson: String,
        promise: Promise,
    ) {
        io.execute {
            val dir = root(kind, id)
            val part = File(dir.parentFile, "$id.part")
            try {
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
                val pins = JSONArray(filesJson)

                dir.parentFile?.mkdirs()
                if (part.exists()) part.delete()

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
                val hex = digest.digest().joinToString("") { "%02x".format(it) }
                if (hex != sha256) {
                    throw IllegalStateException(CODE_HASH_MISMATCH)
                }

                dir.deleteRecursively()
                dir.mkdirs()
                val wanted = HashSet<String>()
                for (i in 0 until pins.length()) {
                    wanted.add(pins.getJSONObject(i).getString("name"))
                }
                FileInputStream(part).use { fis ->
                    BZip2CompressorInputStream(fis).use { bz ->
                        TarArchiveInputStream(bz).use { tar ->
                            var e = tar.nextTarEntry
                            while (e != null) {
                                if (!e.isDirectory) {
                                    val flat = e.name.substringAfterLast('/')
                                    if (wanted.contains(flat)) {
                                        val out = fileIn(dir, flat)
                                        out.outputStream().use { tar.copyTo(it) }
                                    }
                                }
                                e = tar.nextTarEntry
                            }
                        }
                    }
                }
                part.delete()

                for (i in 0 until pins.length()) {
                    val entry = pins.getJSONObject(i)
                    val name = entry.getString("name")
                    val file = fileIn(dir, name)
                    if (!file.isFile ||
                        file.length() != entry.getLong("bytes") ||
                        sha256Of(file) != entry.getString("sha256")
                    ) {
                        throw IllegalStateException(CODE_HASH_MISMATCH)
                    }
                }
                promise.resolve(null)
            } catch (error: IllegalArgumentException) {
                part.delete()
                promise.reject(CODE_INVALID_ARG, error.message, error)
            } catch (error: Exception) {
                part.delete()
                dir.deleteRecursively()
                promise.reject(CODE_FAILURE, error.message, error)
            }
        }
    }

    private fun sha256Of(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(BUFFER_SIZE)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
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
