package com.awesomeproject.security

import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

fun main() {
    initializesOnlyOnceUnderConcurrentAccess()
    concurrentPublicationLeavesOneCompletePayload()
    missingReadsReturnNull()
    failedReplacementZerosUnownedCandidate()
}

private fun initializesOnlyOnceUnderConcurrentAccess() = withTemporaryDirectory { root ->
    val publisher = testPublisher()
    val target = File(root, "nested/wrapped-key.bin")
    val initializerCalls = AtomicInteger(0)
    val workers = 8
    val ready = CountDownLatch(workers)
    val start = CountDownLatch(1)
    val executor = Executors.newFixedThreadPool(workers)
    try {
        val futures = (0 until workers).map {
            executor.submit<ByteArray> {
                ready.countDown()
                check(start.await(5, TimeUnit.SECONDS))
                publisher.loadOrInitialize(target) {
                    initializerCalls.incrementAndGet()
                    ByteArray(32) { 0x2a }
                }
            }
        }
        check(ready.await(5, TimeUnit.SECONDS))
        start.countDown()
        val results = futures.map { it.get(5, TimeUnit.SECONDS) }

        check(initializerCalls.get() == 1)
        check(results.all { it.contentEquals(results.first()) })
        check(target.readBytes().contentEquals(results.first()))
        check(target.parentFile?.isDirectory == true)
    } finally {
        executor.shutdownNow()
    }
}

private fun concurrentPublicationLeavesOneCompletePayload() = withTemporaryDirectory { root ->
    val publisher = testPublisher()
    val target = File(root, "credential.bin")
    val preExistingTemporary = File(root, "${target.name}.tmp").apply {
        writeBytes(byteArrayOf(7, 7, 7))
    }
    val payloads = (0 until 8).map { value -> ByteArray(4096) { value.toByte() } }
    val ready = CountDownLatch(payloads.size)
    val start = CountDownLatch(1)
    val executor = Executors.newFixedThreadPool(payloads.size)
    try {
        val futures = payloads.map { payload ->
            executor.submit {
                ready.countDown()
                check(start.await(5, TimeUnit.SECONDS))
                publisher.publish(target, payload)
            }
        }
        check(ready.await(5, TimeUnit.SECONDS))
        start.countDown()
        futures.forEach { it.get(5, TimeUnit.SECONDS) }

        val published = target.readBytes()
        check(payloads.any { it.contentEquals(published) })
        check(preExistingTemporary.readBytes().contentEquals(byteArrayOf(7, 7, 7)))
        check(root.listFiles().orEmpty().none { it.name.startsWith("${target.name}.tmp.") })
    } finally {
        executor.shutdownNow()
    }
}

private fun missingReadsReturnNull() = withTemporaryDirectory { root ->
    val publisher = testPublisher()
    check(publisher.readOrNull(File(root, "missing.bin")) == null)
}

private fun failedReplacementZerosUnownedCandidate() = withTemporaryDirectory { root ->
    val candidate = ByteArray(32) { 0x5a }
    val publisher = KeystoreFilePublisher { _, _ ->
        throw IOException("replacement failed")
    }

    val failure = runCatching {
        publisher.loadOrInitialize(File(root, "wrapped-key.bin")) { candidate }
    }

    check(failure.isFailure)
    check(candidate.all { it == 0.toByte() })
}

private fun testPublisher(): KeystoreFilePublisher = KeystoreFilePublisher { source, target ->
    Files.move(
        source.toPath(),
        target.toPath(),
        StandardCopyOption.ATOMIC_MOVE,
        StandardCopyOption.REPLACE_EXISTING,
    )
}

private fun withTemporaryDirectory(block: (File) -> Unit) {
    val directory = Files.createTempDirectory("a2a-keystore-publisher-test").toFile()
    try {
        block(directory)
    } finally {
        directory.deleteRecursively()
    }
}
