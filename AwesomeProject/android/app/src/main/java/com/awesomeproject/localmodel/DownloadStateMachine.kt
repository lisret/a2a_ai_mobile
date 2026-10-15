package com.awesomeproject.localmodel

enum class DownloadState { IDLE, DOWNLOADING, VERIFYING, COMPLETE, FAILED, CANCELLED }

data class DownloadSnapshot(
    val state: DownloadState,
    val downloadedBytes: Long = 0L,
    val totalBytes: Long = 0L,
    val reason: String? = null,
)

class DownloadStateMachine {
    private var current = DownloadSnapshot(DownloadState.IDLE)
    private var pendingCompletion: DownloadSnapshot? = null

    fun snapshot(): DownloadSnapshot = current

    fun start(totalBytes: Long) {
        require(totalBytes >= 0) { "totalBytes must be non-negative" }
        require(current.state == DownloadState.IDLE) { "Download has already started" }
        pendingCompletion = null
        current = DownloadSnapshot(DownloadState.DOWNLOADING, totalBytes = totalBytes)
    }

    fun reportProgress(downloadedBytes: Long) {
        require(current.state == DownloadState.DOWNLOADING) { "Download is not active" }
        require(downloadedBytes >= current.downloadedBytes) { "Download progress cannot regress" }
        require(current.totalBytes == 0L || downloadedBytes <= current.totalBytes) { "Download progress exceeds total" }
        current = current.copy(downloadedBytes = downloadedBytes)
    }

    fun beginVerification() {
        require(current.state == DownloadState.DOWNLOADING) { "Download is not active" }
        current = current.copy(state = DownloadState.VERIFYING)
    }

    fun complete() {
        prepareCompletion()
        commitPreparedCompletion()
    }

    internal fun prepareCompletion() {
        require(current.state == DownloadState.VERIFYING) { "Verification is not active" }
        require(pendingCompletion == null) { "Completion is already prepared" }
        pendingCompletion = current.copy(state = DownloadState.COMPLETE)
    }

    /** No-op without a valid private preparation; otherwise a no-throw assignment after the move. */
    internal fun commitPreparedCompletion() {
        val prepared = pendingCompletion ?: return
        current = prepared
        pendingCompletion = null
    }

    fun fail(reason: String) {
        require(reason.isNotBlank()) { "failure reason is required" }
        require(current.state == DownloadState.DOWNLOADING || current.state == DownloadState.VERIFYING) { "Download is not active" }
        pendingCompletion = null
        current = current.copy(state = DownloadState.FAILED, reason = reason)
    }

    fun cancel() {
        require(current.state == DownloadState.DOWNLOADING || current.state == DownloadState.VERIFYING) { "Download is not active" }
        pendingCompletion = null
        current = current.copy(state = DownloadState.CANCELLED, reason = "cancelled")
    }
}
