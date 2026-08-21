package com.awesomeproject.localmodel

private const val GB = 1024L * 1024L * 1024L

fun main() {
    val evaluator = EligibilityEvaluator()
    val capableDevice = DeviceFacts(26, "arm64-v8a", 6L * GB, 3L * GB, "Pixel")
    val manifest = LocalModelManifest(
        modelId = "minicpm-v",
        version = "1",
        modelFileName = "model.gguf",
        modelByteLength = 100L,
        modelSha256 = "model-hash",
        mmprojFileName = "mmproj.gguf",
        mmprojByteLength = 10L,
        mmprojSha256 = "mmproj-hash",
        nativeRuntimeVersion = "runtime-1",
    )

    assertState(LocalModelEligibilityState.UNSUPPORTED, evaluator.evaluate(DeviceFacts(25, "arm64-v8a", 8L * GB, 4L * GB), manifest, true, true, RuntimeAvailability(true)))
    assertState(LocalModelEligibilityState.UNSUPPORTED, evaluator.evaluate(DeviceFacts(26, "x86_64", 8L * GB, 4L * GB), manifest, true, true, RuntimeAvailability(true)))
    assertState(LocalModelEligibilityState.UNSUPPORTED, evaluator.evaluate(DeviceFacts(26, "arm64-v8a", 4L * GB, 4L * GB), manifest, true, true, RuntimeAvailability(true)))
    assertState(LocalModelEligibilityState.UNSUPPORTED, evaluator.evaluate(DeviceFacts(26, "arm64-v8a", 8L * GB, 2L * GB), manifest, true, true, RuntimeAvailability(true)))
    assertState(LocalModelEligibilityState.NEEDS_DOWNLOAD, evaluator.evaluate(capableDevice, manifest, false, false, RuntimeAvailability(true)))
    assertState(LocalModelEligibilityState.FAILED, evaluator.evaluate(capableDevice, manifest, true, false, RuntimeAvailability(true)))
    assertState(LocalModelEligibilityState.FAILED, evaluator.evaluate(capableDevice, manifest, true, true, RuntimeAvailability(false, "native_runtime_unavailable")))
    assertState(LocalModelEligibilityState.NEEDS_TEST, evaluator.evaluate(capableDevice, manifest, true, true, RuntimeAvailability(true)))
    assertState(LocalModelEligibilityState.FAILED, evaluator.evaluateSelfTest(SelfTestResult(false, "self_test_timeout")))
    assertState(LocalModelEligibilityState.READY, evaluator.evaluateSelfTest(SelfTestResult(true)))

    val fingerprint = evaluator.fingerprint(FingerprintInput("Pixel", "arm64-v8a", 8, "runtime-1", "1", "model-hash", "mmproj-hash"))
    val changedFingerprint = evaluator.fingerprint(FingerprintInput("Pixel", "arm64-v8a", 8, "runtime-1", "2", "model-hash", "mmproj-hash"))
    check(fingerprint != changedFingerprint) { "model version must invalidate the fingerprint" }
}

private fun assertState(expected: LocalModelEligibilityState, actual: LocalModelEligibility) {
    check(actual.state == expected) { "Expected $expected, got ${actual.state}: ${actual.reason}" }
}
