package com.awesomeproject.localmodel

/**
 * Safe registered fallback until the MiniCPM native runtime is integrated.
 * It never reports local vision as runnable and never starts network or JNI work.
 */
class UnavailableLocalModelOperations : LocalModelOperations {
    override fun getEligibility(modelId: String): LocalModelEligibility = unsupported()

    override fun startDownload(
        modelId: String,
        urls: LocalModelDownloadUrls,
    ): LocalModelDownloadStatus = downloadFailed()

    override fun cancelDownload(modelId: String): LocalModelDownloadStatus = downloadFailed()

    override fun verifyAndSelfTest(modelId: String): LocalModelEligibility = unsupported()

    override fun invalidateAfterRuntimeFailure(errorCode: String): LocalModelEligibility = unsupported()

    private fun unsupported() = LocalModelEligibility(
        state = LocalModelEligibilityState.UNSUPPORTED,
        reason = REASON,
    )

    private fun downloadFailed() = LocalModelDownloadStatus(
        state = "failed",
        reason = REASON,
    )

    private companion object {
        const val REASON = "native_runtime_not_integrated"
    }
}
