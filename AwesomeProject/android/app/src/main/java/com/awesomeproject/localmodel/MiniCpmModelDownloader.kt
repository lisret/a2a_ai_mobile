package com.awesomeproject.localmodel

import java.io.ByteArrayInputStream
import java.io.Closeable
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URI
import java.util.concurrent.atomic.AtomicBoolean

fun interface ModelHttpClient {
    fun open(url: String): ModelHttpResponse
}

class ModelHttpResponse(
    val statusCode: Int,
    val contentLength: Long,
    val inputStream: InputStream,
    private val closeAction: () -> Unit = {},
) : Closeable {
    override fun close() {
        try {
            inputStream.close()
        } finally {
            closeAction()
        }
    }
}

class HttpUrlConnectionModelHttpClient : ModelHttpClient {
    override fun open(url: String): ModelHttpResponse {
        val connection = URI(url).toURL().openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.requestMethod = "GET"
            connection.instanceFollowRedirects = false
            connection.connect()
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream
            else connection.errorStream ?: ByteArrayInputStream(ByteArray(0))
            return ModelHttpResponse(status, connection.contentLengthLong, stream) { connection.disconnect() }
        } catch (error: Exception) {
            connection.disconnect()
            throw error
        }
    }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 15_000
        const val READ_TIMEOUT_MS = 60_000
    }
}

class DownloadCancelledException : Exception("download_cancelled")
class ModelDownloadException(val errorCode: String, cause: Throwable? = null) : Exception(errorCode, cause)

class MiniCpmModelDownloader(
    private val store: MiniCpmModelStore,
    private val verifier: MiniCpmModelVerifier,
    private val stateMachine: DownloadStateMachine,
    private val httpClient: ModelHttpClient = HttpUrlConnectionModelHttpClient(),
) {
    fun downloadAndInstall(
        manifest: LocalModelManifest,
        urls: LocalModelDownloadUrls,
        cancelled: AtomicBoolean,
        preparedStagingDir: java.io.File? = null,
        onProgress: (DownloadSnapshot) -> Unit = {},
    ): java.io.File {
        store.validateManifest(manifest)
        validateHttps(urls.modelUrl)
        validateHttps(urls.mmprojUrl)
        checkCancelled(cancelled)
        val staging = preparedStagingDir ?: store.createStagingDir(manifest)
        require(store.isExpectedStagingDir(manifest, staging)) { "Invalid staging directory" }
        var committed = false
        var mappedFailure: ModelDownloadException? = null
        try {
            stateMachine.start(expectedTotalBytes(manifest))
            notifySafely(onProgress)
            httpClient.open(urls.modelUrl).use { modelResponse ->
                checkCancelled(cancelled)
                httpClient.open(urls.mmprojUrl).use { mmprojResponse ->
                    requireSuccess(modelResponse, "model_http")
                    requireSuccess(mmprojResponse, "mmproj_http")
                    var downloaded = 0L
                    downloaded = streamArtifact(
                        modelResponse,
                        manifest,
                        staging,
                        manifest.modelFileName,
                        downloaded,
                        cancelled,
                        onProgress,
                    )
                    streamArtifact(
                        mmprojResponse,
                        manifest,
                        staging,
                        manifest.mmprojFileName,
                        downloaded,
                        cancelled,
                        onProgress,
                    )
                }
            }
            checkCancelled(cancelled)
            stateMachine.beginVerification()
            notifySafely(onProgress)
            val verification = verifier.verify(staging, manifest)
            if (verification !is ModelVerification.Success) {
                throw ModelDownloadException(verification.reason ?: "model_integrity_failed")
            }
            stateMachine.prepareCompletion()
            val active = store.activateVerified(staging, manifest, verification)
            committed = true
            stateMachine.commitPreparedCompletion()
            notifySafely(onProgress)
            return active
        } catch (error: Exception) {
            when (stateMachine.snapshot().state) {
                DownloadState.DOWNLOADING, DownloadState.VERIFYING -> {
                    if (error is DownloadCancelledException) stateMachine.cancel()
                    else stateMachine.fail(stableReason(error))
                    notifySafely(onProgress)
                }
                else -> Unit
            }
            mappedFailure = when (error) {
                is ModelDownloadException -> error
                is DownloadCancelledException -> ModelDownloadException("download_cancelled", error)
                else -> ModelDownloadException(stableReason(error), error)
            }
            throw mappedFailure
        } finally {
            if (!committed && store.isExpectedStagingDir(manifest, staging)) {
                try {
                    store.deleteStagingDir(manifest, staging)
                } catch (cleanupError: Exception) {
                    mappedFailure?.addSuppressed(cleanupError)
                }
            }
        }
    }

    private fun streamArtifact(
        response: ModelHttpResponse,
        manifest: LocalModelManifest,
        staging: java.io.File,
        fileName: String,
        initialDownloaded: Long,
        cancelled: AtomicBoolean,
        onProgress: (DownloadSnapshot) -> Unit,
    ): Long {
        var downloaded = initialDownloaded
        store.openNewArtifact(manifest, staging, fileName).use { output ->
            val buffer = ByteArray(BUFFER_SIZE)
            while (true) {
                checkCancelled(cancelled)
                val read = response.inputStream.read(buffer)
                if (read < 0) break
                output.write(buffer, 0, read)
                downloaded += read
                stateMachine.reportProgress(downloaded)
                notifySafely(onProgress)
            }
        }
        return downloaded
    }

    private fun validateHttps(url: String) {
        val uri = try {
            URI(url)
        } catch (error: Exception) {
            throw IllegalArgumentException("Invalid model URL", error)
        }
        require(uri.scheme.equals("https", ignoreCase = true) && uri.host != null) { "Only HTTPS model URLs are allowed" }
    }

    private fun requireSuccess(response: ModelHttpResponse, prefix: String) {
        if (response.statusCode !in 200..299) throw ModelDownloadException("${prefix}_${response.statusCode}")
    }

    private fun expectedTotalBytes(manifest: LocalModelManifest): Long {
        require(manifest.modelByteLength >= 0 && manifest.mmprojByteLength >= 0) {
            "Expected artifact lengths must be non-negative"
        }
        return try {
            Math.addExact(manifest.modelByteLength, manifest.mmprojByteLength)
        } catch (error: ArithmeticException) {
            throw IllegalArgumentException("Expected artifact lengths overflow", error)
        }
    }

    private fun checkCancelled(cancelled: AtomicBoolean) {
        if (cancelled.get()) throw DownloadCancelledException()
    }

    private fun stableReason(error: Exception): String = when (error) {
        is ModelDownloadException -> error.errorCode
        is DownloadCancelledException -> "download_cancelled"
        else -> "download_failed"
    }

    private fun notifySafely(onProgress: (DownloadSnapshot) -> Unit) {
        try {
            onProgress(stateMachine.snapshot())
        } catch (_: Exception) {
            // Progress observers cannot affect download, cleanup, or commit semantics.
        }
    }

    private companion object {
        const val BUFFER_SIZE = 64 * 1024
    }
}
