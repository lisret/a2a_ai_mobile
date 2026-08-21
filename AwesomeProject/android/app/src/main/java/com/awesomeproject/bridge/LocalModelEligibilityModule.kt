package com.awesomeproject.bridge

import com.awesomeproject.localmodel.LocalModelEligibility
import com.awesomeproject.localmodel.LocalModelDownloadStatus
import com.awesomeproject.localmodel.LocalModelDownloadUrls
import com.awesomeproject.localmodel.LocalModelOperations
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import java.util.Locale

/** Intentionally unregistered until MiniCPM native artifacts are integrated. */
class LocalModelEligibilityModule(
    reactContext: ReactApplicationContext,
    private val operations: LocalModelOperations,
) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "LocalModelEligibility"

    @ReactMethod
    fun getEligibility(modelId: String, promise: Promise) {
        resolveEligibility(promise) { operations.getEligibility(modelId) }
    }

    @ReactMethod
    fun startDownload(modelId: String, urls: ReadableMap, promise: Promise) {
        resolveDownload(promise) {
            operations.startDownload(
                modelId,
                LocalModelDownloadUrls(
                    requireNotNull(urls.getString("modelUrl")),
                    requireNotNull(urls.getString("mmprojUrl")),
                ),
            )
        }
    }

    @ReactMethod
    fun cancelDownload(modelId: String, promise: Promise) {
        resolveDownload(promise) { operations.cancelDownload(modelId) }
    }

    @ReactMethod
    fun verifyAndSelfTest(modelId: String, promise: Promise) {
        resolveEligibility(promise) { operations.verifyAndSelfTest(modelId) }
    }

    @ReactMethod
    fun invalidateAfterRuntimeFailure(errorCode: String, promise: Promise) {
        resolveEligibility(promise) { operations.invalidateAfterRuntimeFailure(errorCode) }
    }

    private fun resolveEligibility(promise: Promise, action: () -> LocalModelEligibility) {
        try {
            promise.resolve(action().toWritableMap())
        } catch (_: Exception) {
            promise.reject(BRIDGE_ERROR_CODE, BRIDGE_ERROR_MESSAGE)
        }
    }

    private fun resolveDownload(promise: Promise, action: () -> LocalModelDownloadStatus) {
        try {
            promise.resolve(action().toWritableMap())
        } catch (_: Exception) {
            promise.reject(BRIDGE_ERROR_CODE, BRIDGE_ERROR_MESSAGE)
        }
    }

    private fun LocalModelEligibility.toWritableMap(): WritableMap = Arguments.createMap().apply {
        putString("state", state.name.lowercase(Locale.US))
        putDouble("checkedAtEpochMs", checkedAtEpochMs.toDouble())
        reason?.let { putString("reason", it) }
        fingerprint?.let { putString("fingerprint", it) }
    }

    private fun LocalModelDownloadStatus.toWritableMap(): WritableMap = Arguments.createMap().apply {
        putString("state", state)
        putDouble("downloadedBytes", downloadedBytes.toDouble())
        putDouble("totalBytes", totalBytes.toDouble())
        reason?.let { putString("reason", it) }
    }

    private companion object {
        const val BRIDGE_ERROR_CODE = "LOCAL_MODEL_OPERATION_FAILED"
        const val BRIDGE_ERROR_MESSAGE = "Local model operation failed"
    }
}
