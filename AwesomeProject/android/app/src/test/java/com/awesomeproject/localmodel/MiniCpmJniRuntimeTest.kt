package com.awesomeproject.localmodel

import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

fun main() {
    loadUnsatisfiedLinkErrorIsImmediatelyVisibleAcrossThreads()
    inferUnsatisfiedLinkErrorPreventsNativeRetry()
}

private fun loadUnsatisfiedLinkErrorIsImmediatelyVisibleAcrossThreads() {
    val nativeEntered = CountDownLatch(1)
    val allowFailure = CountDownLatch(1)
    val failureObserved = CountDownLatch(1)
    val availabilityObserved = CountDownLatch(1)
    val observedAvailability = AtomicReference<RuntimeAvailability>()
    val libraryLoads = AtomicInteger()
    val nativeLoads = AtomicInteger()
    val boundary = object : MiniCpmNativeBoundary {
        override fun loadLibrary() {
            libraryLoads.incrementAndGet()
        }

        override fun load(modelDir: String, modelFileName: String, mmprojFileName: String): Boolean {
            nativeLoads.incrementAndGet()
            nativeEntered.countDown()
            check(allowFailure.await(2, TimeUnit.SECONDS))
            throw UnsatisfiedLinkError("late native failure")
        }

        override fun infer(prompt: String, imageBytes: ByteArray, timeoutMs: Long) =
            LocalVisionResult(false)

        override fun release() = Unit
    }
    val runtime = MiniCpmJniRuntime(boundary)
    val loader = Thread {
        val result = runtime.load(File("/private/tmp/model"), manifest())
        check(!result.success && result.reason == "native_runtime_unavailable")
        failureObserved.countDown()
    }
    val observer = Thread {
        check(failureObserved.await(2, TimeUnit.SECONDS))
        observedAvailability.set(runtime.availability())
        availabilityObserved.countDown()
    }

    loader.start()
    check(nativeEntered.await(2, TimeUnit.SECONDS))
    observer.start()
    allowFailure.countDown()
    check(availabilityObserved.await(2, TimeUnit.SECONDS)) { "Second thread did not observe failure in bounded time" }
    loader.join(2_000)
    observer.join(2_000)

    check(observedAvailability.get() == RuntimeAvailability(false, "native_runtime_unavailable"))
    check(!runtime.load(File("/private/tmp/model"), manifest()).success)
    check(libraryLoads.get() == 1) { "Library loading must not retry" }
    check(nativeLoads.get() == 1) { "Native loading must not retry after ULE" }
}

private fun inferUnsatisfiedLinkErrorPreventsNativeRetry() {
    val inferCalls = AtomicInteger()
    val boundary = object : MiniCpmNativeBoundary {
        override fun loadLibrary() = Unit
        override fun load(modelDir: String, modelFileName: String, mmprojFileName: String) = true
        override fun infer(prompt: String, imageBytes: ByteArray, timeoutMs: Long): LocalVisionResult {
            inferCalls.incrementAndGet()
            throw UnsatisfiedLinkError("missing infer symbol")
        }
        override fun release() = Unit
    }
    val runtime = MiniCpmJniRuntime(boundary)
    check(!runtime.infer(LocalVisionRequest("prompt", byteArrayOf(1)), 15_000L).success)
    check(!runtime.availability().available)
    check(!runtime.infer(LocalVisionRequest("prompt", byteArrayOf(1)), 15_000L).success)
    check(inferCalls.get() == 1)
}

private fun manifest() = LocalModelManifest(
    "minicpm-v",
    "1",
    "model.gguf",
    1L,
    "hash",
    "mmproj.gguf",
    1L,
    "hash",
    "runtime-1",
)
