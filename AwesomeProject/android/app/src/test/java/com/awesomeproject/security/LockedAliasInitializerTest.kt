package com.awesomeproject.security

import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

fun main() {
    concurrentMissingLookupsCreateAliasOnceInsideLock()
    existingAliasSkipsLockAndCreate()
}

private fun concurrentMissingLookupsCreateAliasOnceInsideLock() = withAliasTestDirectory { root ->
    val workers = 8
    val initialLookups = CountDownLatch(workers)
    val releaseInitialLookups = CountDownLatch(1)
    val insideLock = ThreadLocal.withInitial { false }
    val createdAlias = AtomicReference<String?>(null)
    val createCalls = AtomicInteger(0)
    val publisher = aliasTestPublisher()
    val lockTarget = File(root, "aes-alias-initialization")
    val initializer = LockedAliasInitializer(
        lookup = {
            if (!insideLock.get()) {
                initialLookups.countDown()
                check(releaseInitialLookups.await(5, TimeUnit.SECONDS))
                null
            } else {
                createdAlias.get()
            }
        },
        lockBoundary = { action ->
            publisher.withLock(lockTarget) {
                insideLock.set(true)
                try {
                    action()
                } finally {
                    insideLock.remove()
                }
            }
        },
        create = {
            check(insideLock.get())
            createCalls.incrementAndGet()
            "aes-key".also(createdAlias::set)
        },
    )

    val executor = Executors.newFixedThreadPool(workers)
    try {
        val futures = (0 until workers).map {
            executor.submit<String> { initializer.getOrCreate() }
        }
        check(initialLookups.await(5, TimeUnit.SECONDS))
        releaseInitialLookups.countDown()
        val results = futures.map { it.get(5, TimeUnit.SECONDS) }

        check(results.all { it == "aes-key" })
        check(createCalls.get() == 1)
    } finally {
        executor.shutdownNow()
    }
}

private fun existingAliasSkipsLockAndCreate() {
    val lockCalls = AtomicInteger(0)
    val createCalls = AtomicInteger(0)
    val initializer = LockedAliasInitializer(
        lookup = { "existing-key" },
        lockBoundary = { action ->
            lockCalls.incrementAndGet()
            action()
        },
        create = {
            createCalls.incrementAndGet()
            "new-key"
        },
    )

    check(initializer.getOrCreate() == "existing-key")
    check(lockCalls.get() == 0)
    check(createCalls.get() == 0)
}

private fun aliasTestPublisher(): KeystoreFilePublisher =
    KeystoreFilePublisher { source, target ->
        Files.move(
            source.toPath(),
            target.toPath(),
            StandardCopyOption.ATOMIC_MOVE,
            StandardCopyOption.REPLACE_EXISTING,
        )
    }

private fun withAliasTestDirectory(block: (File) -> Unit) {
    val directory = Files.createTempDirectory("a2a-alias-initializer-test").toFile()
    try {
        block(directory)
    } finally {
        directory.deleteRecursively()
    }
}
