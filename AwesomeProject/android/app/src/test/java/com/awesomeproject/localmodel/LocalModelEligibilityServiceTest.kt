package com.awesomeproject.localmodel

import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.security.MessageDigest

fun main() {
    defaultFixtureIsVersionedAndVisual()
    selfTestUsesExactInjectedFixtureAndTimeout()
    rejectsWrongTokenSchemaAndTimeout()
    containsRuntimeAndReleaseFailures()
    containsRuntimeOutOfMemoryFailures()
    invalidationClearsReadyFingerprint()
}

private fun defaultFixtureIsVersionedAndVisual() {
    check(DEFAULT_SELF_TEST_FIXTURE.version == "phase1-v1")
    check(DEFAULT_SELF_TEST_FIXTURE.prompt.isNotBlank())
    check(DEFAULT_SELF_TEST_FIXTURE.imageBytes.isNotEmpty())
    val pngSignature = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    check(DEFAULT_SELF_TEST_FIXTURE.imageBytes.copyOfRange(0, pngSignature.size).contentEquals(pngSignature))

    val exposedFixtureBytes = DEFAULT_SELF_TEST_FIXTURE.imageBytes
    exposedFixtureBytes[0] = 0
    check(DEFAULT_SELF_TEST_FIXTURE.imageBytes.copyOfRange(0, pngSignature.size).contentEquals(pngSignature)) {
        "Fixture image getter must return a defensive copy"
    }

    val request = DEFAULT_SELF_TEST_FIXTURE.request()
    request.imageBytes[1] = 0
    check(DEFAULT_SELF_TEST_FIXTURE.request().imageBytes.copyOfRange(0, pngSignature.size).contentEquals(pngSignature)) {
        "Each self-test request must own its image bytes"
    }
}

private fun selfTestUsesExactInjectedFixtureAndTimeout() {
    val fixture = SelfTestFixture(
        version = "test-v7",
        prompt = "fixed visual prompt v7",
        imageBytes = "deterministic-image-v7".toByteArray(StandardCharsets.UTF_8),
        expectedToken = "TOKEN_V7",
        schemaMarker = "schema-v7",
    )
    withService(
        runtime = RecordingRuntime(inferResult = LocalVisionResult(true, "TOKEN_V7", "schema-v7")),
        selfTestFixture = fixture,
    ) { service, runtime ->
        val result = service.runSelfTest()
        check(result.state == LocalModelEligibilityState.READY)
        check(runtime.lastRequest?.prompt == fixture.prompt)
        check(runtime.lastRequest?.imageBytes?.contentEquals(fixture.imageBytes) == true)
        check(runtime.lastTimeoutMs == 15_000L)
        check(runtime.releaseCount == 1)
    }
}

private fun rejectsWrongTokenSchemaAndTimeout() {
    assertSelfTestFailure(LocalVisionResult(true, "WRONG", DEFAULT_SELF_TEST_FIXTURE.schemaMarker), "self_test_token_invalid")
    assertSelfTestFailure(LocalVisionResult(true, DEFAULT_SELF_TEST_FIXTURE.expectedToken, "wrong-schema"), "self_test_schema_invalid")
    assertSelfTestFailure(LocalVisionResult(false, reason = "self_test_timeout"), "self_test_timeout")
}

private fun containsRuntimeAndReleaseFailures() {
    withService(
        RecordingRuntime(
            loadResult = RuntimeResult(false, "native_load_failed"),
            releaseFailure = IllegalStateException("release-secret"),
        ),
    ) { service, runtime ->
        val result = service.runSelfTest()
        check(result.state == LocalModelEligibilityState.FAILED && result.reason == "native_load_failed")
        check(runtime.releaseCount == 1)
    }
    withService(RecordingRuntime(loadFailure = IllegalStateException("secret-load-message"))) { service, runtime ->
        val result = service.runSelfTest()
        check(result.state == LocalModelEligibilityState.FAILED && result.reason == "runtime_load_exception")
        check(runtime.releaseCount == 1)
    }
    withService(RecordingRuntime(inferFailure = IllegalStateException("secret-infer-message"))) { service, runtime ->
        val result = service.runSelfTest()
        check(result.state == LocalModelEligibilityState.FAILED && result.reason == "runtime_infer_exception")
        check(runtime.releaseCount == 1)
    }
    withService(
        RecordingRuntime(
            inferResult = LocalVisionResult(false, reason = "self_test_timeout"),
            releaseFailure = IllegalStateException("release-secret"),
        ),
    ) { service, runtime ->
        val result = service.runSelfTest()
        check(result.state == LocalModelEligibilityState.FAILED && result.reason == "self_test_timeout") {
            "Release failure must not replace the primary failure"
        }
        check(runtime.releaseCount == 1)
    }
    withService(
        RecordingRuntime(
            inferResult = LocalVisionResult(
                true,
                DEFAULT_SELF_TEST_FIXTURE.expectedToken,
                DEFAULT_SELF_TEST_FIXTURE.schemaMarker,
            ),
            releaseFailure = IllegalStateException("release-secret"),
        ),
    ) { service, runtime ->
        val result = service.runSelfTest()
        check(result.state == LocalModelEligibilityState.FAILED && result.reason == "runtime_release_exception")
        check(runtime.releaseCount == 1)
    }
}

private fun containsRuntimeOutOfMemoryFailures() {
    withService(RecordingRuntime(loadFailure = OutOfMemoryError("load oom"))) { service, runtime ->
        val result = service.runSelfTest()
        check(result.state == LocalModelEligibilityState.FAILED && result.reason == "runtime_out_of_memory")
        check(runtime.releaseCount == 1)
        check(service.eligibility().state == LocalModelEligibilityState.NEEDS_TEST)
    }
    withService(RecordingRuntime(inferFailure = OutOfMemoryError("infer oom"))) { service, runtime ->
        val result = service.runSelfTest()
        check(result.state == LocalModelEligibilityState.FAILED && result.reason == "runtime_out_of_memory")
        check(runtime.releaseCount == 1)
        check(service.eligibility().state == LocalModelEligibilityState.NEEDS_TEST)
    }
    withService(RecordingRuntime(releaseFailure = OutOfMemoryError("release oom"))) { service, runtime ->
        val result = service.runSelfTest()
        check(result.state == LocalModelEligibilityState.FAILED && result.reason == "runtime_out_of_memory")
        check(runtime.releaseCount == 1)
        check(service.eligibility().state == LocalModelEligibilityState.NEEDS_TEST)
    }
    withService(
        RecordingRuntime(
            loadResult = RuntimeResult(false, "native_load_failed"),
            releaseFailure = OutOfMemoryError("release oom"),
        ),
    ) { service, runtime ->
        val result = service.runSelfTest()
        check(result.state == LocalModelEligibilityState.FAILED && result.reason == "native_load_failed") {
            "Release OOM must not replace the primary failure"
        }
        check(runtime.releaseCount == 1)
    }
}

private fun invalidationClearsReadyFingerprint() {
    val runtime = RecordingRuntime(
        inferResult = LocalVisionResult(
            true,
            DEFAULT_SELF_TEST_FIXTURE.expectedToken,
            DEFAULT_SELF_TEST_FIXTURE.schemaMarker,
        ),
    )
    withService(runtime) { service, recording ->
        check(service.runSelfTest().state == LocalModelEligibilityState.READY)
        check(service.eligibility().state == LocalModelEligibilityState.READY)
        val inferCount = recording.inferCount

        check(service.invalidateAfterRuntimeFailure("runtime_crash").state == LocalModelEligibilityState.NEEDS_TEST)
        check(service.eligibility().state == LocalModelEligibilityState.NEEDS_TEST)
        check(recording.inferCount == inferCount) { "Invalidation must not silently rerun or bypass self-test" }
        check(service.runSelfTest().state == LocalModelEligibilityState.READY)
        check(recording.inferCount == inferCount + 1)
    }
}

private fun assertSelfTestFailure(result: LocalVisionResult, expectedReason: String) {
    withService(RecordingRuntime(inferResult = result)) { service, runtime ->
        val eligibility = service.runSelfTest()
        check(eligibility.state == LocalModelEligibilityState.FAILED && eligibility.reason == expectedReason)
        check(runtime.releaseCount == 1)
    }
}

private inline fun withService(
    runtime: RecordingRuntime,
    selfTestFixture: SelfTestFixture = DEFAULT_SELF_TEST_FIXTURE,
    block: (LocalModelEligibilityService, RecordingRuntime) -> Unit,
) {
    val root = Files.createTempDirectory("minicpm-service").toFile()
    try {
        val model = "model".toByteArray()
        val mmproj = "mmproj".toByteArray()
        val manifest = LocalModelManifest(
            "minicpm-v",
            "1",
            "model.gguf",
            model.size.toLong(),
            hash(model),
            "mmproj.gguf",
            mmproj.size.toLong(),
            hash(mmproj),
            "runtime-1",
        )
        val store = MiniCpmModelStore(root)
        val staging = store.createStagingDir(manifest)
        store.openNewArtifact(manifest, staging, manifest.modelFileName).use { it.write(model) }
        store.openNewArtifact(manifest, staging, manifest.mmprojFileName).use { it.write(mmproj) }
        val verifier = MiniCpmModelVerifier(store)
        val verification = verifier.verify(staging, manifest)
        check(verification is ModelVerification.Success)
        store.activateVerified(staging, manifest, verification)
        val service = LocalModelEligibilityService(
            deviceFactsProvider = { DeviceFacts(26, "arm64-v8a", 8L * GB, 4L * GB, "Pixel", 8) },
            manifest = manifest,
            store = store,
            verifier = verifier,
            runtime = runtime,
            selfTestFixture = selfTestFixture,
        )
        block(service, runtime)
    } finally {
        root.deleteRecursively()
    }
}

private class RecordingRuntime(
    private val inferResult: LocalVisionResult = LocalVisionResult(
        true,
        DEFAULT_SELF_TEST_FIXTURE.expectedToken,
        DEFAULT_SELF_TEST_FIXTURE.schemaMarker,
    ),
    private val loadFailure: Throwable? = null,
    private val loadResult: RuntimeResult = RuntimeResult(true),
    private val inferFailure: Throwable? = null,
    private val releaseFailure: Throwable? = null,
) : MiniCpmRuntime {
    var lastRequest: LocalVisionRequest? = null
    var lastTimeoutMs: Long? = null
    var inferCount = 0
    var releaseCount = 0

    override fun availability() = RuntimeAvailability(true)
    override fun load(modelDir: File, manifest: LocalModelManifest): RuntimeResult {
        loadFailure?.let { throw it }
        return loadResult
    }

    override fun infer(request: LocalVisionRequest, timeoutMs: Long): LocalVisionResult {
        inferCount += 1
        lastRequest = request
        lastTimeoutMs = timeoutMs
        inferFailure?.let { throw it }
        return inferResult
    }

    override fun release() {
        releaseCount += 1
        releaseFailure?.let { throw it }
    }
}

private fun hash(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
    .digest(bytes).joinToString("") { "%02x".format(it) }

private const val GB = 1024L * 1024L * 1024L
