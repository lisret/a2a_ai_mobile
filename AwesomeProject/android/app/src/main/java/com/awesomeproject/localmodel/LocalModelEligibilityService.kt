package com.awesomeproject.localmodel

class LocalModelEligibilityService(
    private val deviceFactsProvider: () -> DeviceFacts,
    private val manifest: LocalModelManifest,
    private val store: MiniCpmModelStore,
    private val verifier: MiniCpmModelVerifier,
    private val runtime: MiniCpmRuntime,
    private val evaluator: EligibilityEvaluator = EligibilityEvaluator(),
    private val selfTestFixture: SelfTestFixture = DEFAULT_SELF_TEST_FIXTURE,
) {
    private var lastSelfTestFingerprint: String? = null
    private var publishedState: LocalModelEligibility? = null

    fun eligibility(): LocalModelEligibility {
        val device = deviceFactsProvider()
        if (!evaluator.isStaticallyEligible(device)) {
            return publish(evaluator.evaluate(device, manifest, false, false, RuntimeAvailability(true)))
        }
        val activeDir = store.activeDir(manifest)
            ?: return publish(evaluator.evaluate(device, manifest, false, false, RuntimeAvailability(true)))
        val verification = verifier.verify(activeDir, manifest)
        val evaluated = evaluator.evaluate(
            device,
            manifest,
            verification.filesPresent,
            verification.valid,
            try {
                runtime.availability()
            } catch (_: OutOfMemoryError) {
                RuntimeAvailability(false, RUNTIME_OUT_OF_MEMORY)
            },
        )
        if (evaluated.state == LocalModelEligibilityState.NEEDS_TEST && evaluated.fingerprint == lastSelfTestFingerprint) {
            return publish(evaluated.copy(state = LocalModelEligibilityState.READY))
        }
        return publish(evaluated)
    }

    fun runSelfTest(): LocalModelEligibility {
        val current = eligibility()
        if (current.state != LocalModelEligibilityState.NEEDS_TEST) return current
        val fingerprint = current.fingerprint
        publish(LocalModelEligibility(LocalModelEligibilityState.TESTING, fingerprint = fingerprint))
        val activeDir = store.activeDir(manifest)
            ?: return publish(LocalModelEligibility(LocalModelEligibilityState.FAILED, "model_files_missing", fingerprint = fingerprint))

        var outcome = failed("runtime_load_exception", fingerprint)
        try {
            outcome = try {
                val load = runtime.load(activeDir, manifest)
                if (!load.success) {
                    failed(load.reason ?: "runtime_load_failed", fingerprint)
                } else {
                    runInference(fingerprint)
                }
            } catch (_: OutOfMemoryError) {
                failed(RUNTIME_OUT_OF_MEMORY, fingerprint)
            } catch (_: Exception) {
                failed("runtime_load_exception", fingerprint)
            }
        } finally {
            val releaseFailure = try {
                runtime.release()
                null
            } catch (_: OutOfMemoryError) {
                RUNTIME_OUT_OF_MEMORY
            } catch (_: Exception) {
                "runtime_release_exception"
            }
            if (releaseFailure != null && outcome.state == LocalModelEligibilityState.READY) {
                outcome = failed(releaseFailure, fingerprint)
            }
        }
        if (outcome.state == LocalModelEligibilityState.READY) {
            lastSelfTestFingerprint = fingerprint
        }
        return publish(outcome)
    }

    fun invalidateAfterRuntimeFailure(errorCode: String): LocalModelEligibility {
        require(errorCode.isNotBlank()) { "Runtime failure code is required" }
        lastSelfTestFingerprint = null
        return eligibility()
    }

    fun latestPublishedState(): LocalModelEligibility? = publishedState

    private fun runInference(fingerprint: String?): LocalModelEligibility {
        val result = try {
            runtime.infer(selfTestFixture.request(), SELF_TEST_TIMEOUT_MS)
        } catch (_: OutOfMemoryError) {
            return failed(RUNTIME_OUT_OF_MEMORY, fingerprint)
        } catch (_: Exception) {
            return failed("runtime_infer_exception", fingerprint)
        }
        val reason = when {
            !result.success -> result.reason ?: "self_test_failed"
            result.token != selfTestFixture.expectedToken -> "self_test_token_invalid"
            result.schemaMarker != selfTestFixture.schemaMarker -> "self_test_schema_invalid"
            else -> null
        }
        return if (reason == null) {
            evaluator.evaluateSelfTest(SelfTestResult(true), fingerprint)
        } else {
            failed(reason, fingerprint)
        }
    }

    private fun failed(reason: String, fingerprint: String?): LocalModelEligibility =
        evaluator.evaluateSelfTest(SelfTestResult(false, reason), fingerprint)

    private fun publish(value: LocalModelEligibility): LocalModelEligibility {
        publishedState = value
        return value
    }

    private companion object {
        const val RUNTIME_OUT_OF_MEMORY = "runtime_out_of_memory"
    }
}
