package com.awesomeproject.localmodel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UnavailableLocalModelOperationsTest {
    private val operations = UnavailableLocalModelOperations()

    @Test
    fun eligibilityOperationsStayUnsupportedWithStableReason() {
        val results = listOf(
            operations.getEligibility("minicpm-v-4.6"),
            operations.verifyAndSelfTest("minicpm-v-4.6"),
            operations.invalidateAfterRuntimeFailure("runtime_crash"),
        )

        results.forEach { result ->
            assertEquals(LocalModelEligibilityState.UNSUPPORTED, result.state)
            assertEquals("native_runtime_not_integrated", result.reason)
            assertNull(result.fingerprint)
        }
    }

    @Test
    fun downloadOperationsFailWithoutStartingNativeWork() {
        val start = operations.startDownload(
            "minicpm-v-4.6",
            LocalModelDownloadUrls(
                modelUrl = "https://example.invalid/model.gguf",
                mmprojUrl = "https://example.invalid/mmproj.gguf",
            ),
        )
        val cancel = operations.cancelDownload("minicpm-v-4.6")

        listOf(start, cancel).forEach { result ->
            assertEquals("failed", result.state)
            assertEquals("native_runtime_not_integrated", result.reason)
            assertEquals(0L, result.downloadedBytes)
            assertEquals(0L, result.totalBytes)
        }
    }
}
