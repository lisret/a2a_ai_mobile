package com.awesomeproject.localmodel

fun main() {
    val machine = DownloadStateMachine()
    check(machine.snapshot().state == DownloadState.IDLE)
    machine.start(100)
    check(machine.snapshot().state == DownloadState.DOWNLOADING)
    machine.reportProgress(40)
    machine.beginVerification()
    check(machine.snapshot().state == DownloadState.VERIFYING)
    machine.complete()
    check(machine.snapshot().state == DownloadState.COMPLETE)

    val cancelled = DownloadStateMachine()
    cancelled.start(100)
    cancelled.cancel()
    check(cancelled.snapshot().state == DownloadState.CANCELLED)

    val httpFailure = DownloadStateMachine()
    httpFailure.start(100)
    httpFailure.fail("http_503")
    check(httpFailure.snapshot().state == DownloadState.FAILED)
    check(httpFailure.snapshot().reason == "http_503")

    val regression = DownloadStateMachine()
    regression.start(100)
    regression.reportProgress(80)
    expectIllegalArgument { regression.reportProgress(79) }

    val idleCommit = DownloadStateMachine()
    idleCommit.commitPreparedCompletion()
    check(idleCommit.snapshot().state == DownloadState.IDLE)

    val failedAfterPreparation = DownloadStateMachine()
    failedAfterPreparation.start(10)
    failedAfterPreparation.reportProgress(5)
    failedAfterPreparation.beginVerification()
    failedAfterPreparation.prepareCompletion()
    failedAfterPreparation.fail("activation_failed")
    failedAfterPreparation.commitPreparedCompletion()
    check(failedAfterPreparation.snapshot().state == DownloadState.FAILED)
    check(failedAfterPreparation.snapshot().downloadedBytes == 5L)
}

private fun expectIllegalArgument(block: () -> Unit) {
    try {
        block()
        error("Expected IllegalArgumentException")
    } catch (_: IllegalArgumentException) {
    }
}
