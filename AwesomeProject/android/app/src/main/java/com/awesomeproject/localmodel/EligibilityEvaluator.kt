package com.awesomeproject.localmodel

import java.nio.charset.StandardCharsets
import java.security.MessageDigest

class EligibilityEvaluator {
    fun evaluate(
        device: DeviceFacts,
        manifest: LocalModelManifest,
        filesPresent: Boolean,
        filesVerified: Boolean,
        runtimeAvailability: RuntimeAvailability,
    ): LocalModelEligibility {
        if (!isStaticallyEligible(device)) {
            return LocalModelEligibility(LocalModelEligibilityState.UNSUPPORTED, "device_constraints")
        }
        if (!filesPresent) {
            return LocalModelEligibility(LocalModelEligibilityState.NEEDS_DOWNLOAD)
        }
        if (!filesVerified) {
            return LocalModelEligibility(LocalModelEligibilityState.FAILED, "model_integrity_failed")
        }
        if (!runtimeAvailability.available) {
            return LocalModelEligibility(
                LocalModelEligibilityState.FAILED,
                runtimeAvailability.reason ?: "native_runtime_unavailable",
            )
        }
        return LocalModelEligibility(
            LocalModelEligibilityState.NEEDS_TEST,
            fingerprint = fingerprint(
                FingerprintInput(
                    device.deviceModel,
                    device.abi,
                    device.androidMajorVersion,
                    manifest.nativeRuntimeVersion,
                    manifest.version,
                    manifest.modelSha256,
                    manifest.mmprojSha256,
                ),
            ),
        )
    }

    fun evaluateSelfTest(result: SelfTestResult, fingerprint: String? = null): LocalModelEligibility =
        if (result.success) {
            LocalModelEligibility(LocalModelEligibilityState.READY, fingerprint = fingerprint)
        } else {
            LocalModelEligibility(LocalModelEligibilityState.FAILED, result.reason ?: "self_test_failed", fingerprint = fingerprint)
        }

    fun isStaticallyEligible(device: DeviceFacts): Boolean =
        device.apiLevel >= MIN_API_LEVEL &&
            device.abi == REQUIRED_ABI &&
            device.totalRamBytes >= MIN_RAM_BYTES &&
            device.freeStorageBytes >= MIN_STORAGE_BYTES

    fun fingerprint(input: FingerprintInput): String {
        val material = listOf(
            input.deviceModel,
            input.abi,
            input.androidMajorVersion.toString(),
            input.nativeRuntimeVersion,
            input.modelVersion,
            input.modelHash,
            input.mmprojHash,
        ).joinToString("\u0000")
        return MessageDigest.getInstance("SHA-256")
            .digest(material.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }

    companion object {
        const val MIN_API_LEVEL = 26
        const val REQUIRED_ABI = "arm64-v8a"
        const val MIN_RAM_BYTES = 6L * 1024L * 1024L * 1024L
        const val MIN_STORAGE_BYTES = 3L * 1024L * 1024L * 1024L
    }
}
