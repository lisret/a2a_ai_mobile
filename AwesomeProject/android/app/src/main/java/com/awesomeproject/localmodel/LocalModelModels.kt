package com.awesomeproject.localmodel

import java.io.File

enum class LocalModelEligibilityState { UNSUPPORTED, NEEDS_DOWNLOAD, NEEDS_TEST, TESTING, READY, FAILED }

data class DeviceFacts(
    val apiLevel: Int,
    val abi: String,
    val totalRamBytes: Long,
    val freeStorageBytes: Long,
    val deviceModel: String = "unknown",
    val androidMajorVersion: Int = apiLevel,
)

data class LocalModelManifest(
    val modelId: String,
    val version: String,
    val modelFileName: String,
    val modelByteLength: Long,
    val modelSha256: String,
    val mmprojFileName: String,
    val mmprojByteLength: Long,
    val mmprojSha256: String,
    val nativeRuntimeVersion: String,
)

data class LocalModelEligibility(
    val state: LocalModelEligibilityState,
    val reason: String? = null,
    val checkedAtEpochMs: Long = System.currentTimeMillis(),
    val fingerprint: String? = null,
)

data class RuntimeAvailability(val available: Boolean, val reason: String? = null)
data class RuntimeResult(val success: Boolean, val reason: String? = null)
data class LocalVisionRequest(val prompt: String, val imageBytes: ByteArray = ByteArray(0))
data class LocalVisionResult(
    val success: Boolean,
    val token: String? = null,
    val schemaMarker: String? = null,
    val reason: String? = null,
)
data class SelfTestResult(val success: Boolean, val reason: String? = null)

data class LocalModelDownloadUrls(val modelUrl: String, val mmprojUrl: String)
data class LocalModelDownloadStatus(
    val state: String,
    val downloadedBytes: Long = 0L,
    val totalBytes: Long = 0L,
    val reason: String? = null,
)

/** Unregistered operation boundary; a later registry will resolve model IDs to manifests. */
interface LocalModelOperations {
    fun getEligibility(modelId: String): LocalModelEligibility
    fun startDownload(modelId: String, urls: LocalModelDownloadUrls): LocalModelDownloadStatus
    fun cancelDownload(modelId: String): LocalModelDownloadStatus
    fun verifyAndSelfTest(modelId: String): LocalModelEligibility
    fun invalidateAfterRuntimeFailure(errorCode: String): LocalModelEligibility
}

data class FingerprintInput(
    val deviceModel: String,
    val abi: String,
    val androidMajorVersion: Int,
    val nativeRuntimeVersion: String,
    val modelVersion: String,
    val modelHash: String,
    val mmprojHash: String,
)

interface MiniCpmRuntime {
    fun availability(): RuntimeAvailability
    fun load(modelDir: File, manifest: LocalModelManifest): RuntimeResult
    fun infer(request: LocalVisionRequest, timeoutMs: Long): LocalVisionResult
    fun release()
}
