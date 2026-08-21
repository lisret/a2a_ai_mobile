package com.awesomeproject.localmodel

import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.nio.file.Files
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

fun main() {
    installsBothArtifactsAsOneLifecycle()
    cancellationDuringSecondArtifactPreservesActiveVersion()
    secondHttpFailurePreservesActiveVersion()
    hashFailurePreservesActiveVersion()
    verificationTokenRejectsMutationAndReplay()
    verificationTokenRejectsRecreatedStaging()
    networkOpenFailuresTransitionToFailedAndCloseResources()
    progressObserverFailuresCannotBreakCleanupOrCommit()
}

private fun installsBothArtifactsAsOneLifecycle() {
    withPrivateRoot { root ->
        val model = "model-one".toByteArray()
        val mmproj = "projector-one".toByteArray()
        val manifest = manifest("1", model, mmproj)
        val snapshots = mutableListOf<DownloadSnapshot>()
        val calls = mutableListOf<String>()
        val downloader = downloader(root, calls) { url ->
            if (url.endsWith("model")) response(model) else response(mmproj)
        }

        val active = downloader.downloadAndInstall(manifest, urls("1"), AtomicBoolean(false)) { snapshots += it }

        check(calls == listOf("https://example.test/1/model", "https://example.test/1/mmproj"))
        check(snapshots.first().state == DownloadState.DOWNLOADING)
        check(snapshots.first().totalBytes == model.size.toLong() + mmproj.size.toLong())
        check(snapshots.filter { it.state == DownloadState.VERIFYING }.size == 1)
        check(snapshots.last().state == DownloadState.COMPLETE)
        check(snapshots.last().downloadedBytes == model.size.toLong() + mmproj.size.toLong())
        check(File(active, manifest.modelFileName).readBytes().contentEquals(model))
        check(File(active, manifest.mmprojFileName).readBytes().contentEquals(mmproj))
        check(!File(active.parentFile, "staging-${manifest.version}").exists())
    }
}

private fun cancellationDuringSecondArtifactPreservesActiveVersion() {
    withPrivateRoot { root ->
        val oldActive = installVersion(root, "1")
        val cancelled = AtomicBoolean(false)
        val model = "model-two".toByteArray()
        val mmproj = "projector-two".toByteArray()
        val manifest = manifest("2", model, mmproj)
        val calls = mutableListOf<String>()
        val downloader = downloader(root, calls) { url ->
            if (url.endsWith("model")) response(model)
            else ModelHttpResponse(200, mmproj.size.toLong(), CancellingInputStream(mmproj, cancelled))
        }

        expectDownloadFailure { downloader.downloadAndInstall(manifest, urls("2"), cancelled) }

        check(oldActive.isDirectory)
        check(File(oldActive, "active-sentinel").readText() == "keep")
        check(!File(File(root, "minicpm/minicpm-v"), "staging-2").exists())
    }
}

private fun secondHttpFailurePreservesActiveVersion() {
    withPrivateRoot { root ->
        val oldActive = installVersion(root, "1")
        val bytes = "version-two".toByteArray()
        val manifest = manifest("2", bytes, bytes)
        val downloader = downloader(root, mutableListOf()) { url ->
            if (url.endsWith("model")) response(bytes) else ModelHttpResponse(503, 0L, ByteArrayInputStream(ByteArray(0)))
        }

        expectDownloadFailure { downloader.downloadAndInstall(manifest, urls("2"), AtomicBoolean(false)) }

        check(File(oldActive, "active-sentinel").readText() == "keep")
        check(!File(File(root, "minicpm/minicpm-v"), "staging-2").exists())
    }
}

private fun hashFailurePreservesActiveVersion() {
    withPrivateRoot { root ->
        val oldActive = installVersion(root, "1")
        val expected = "expected".toByteArray()
        val manifest = manifest("2", expected, expected)
        val downloader = downloader(root, mutableListOf()) { response("tampered".toByteArray()) }

        expectDownloadFailure { downloader.downloadAndInstall(manifest, urls("2"), AtomicBoolean(false)) }

        check(File(oldActive, "active-sentinel").readText() == "keep")
        check(!File(File(root, "minicpm/minicpm-v"), "staging-2").exists())
        check(File(File(root, "minicpm/minicpm-v"), "2").let { !it.exists() })
    }
}

private fun verificationTokenRejectsMutationAndReplay() {
    withPrivateRoot { root ->
        val bytes = "verified".toByteArray()
        val manifest = manifest("1", bytes, bytes)
        val store = MiniCpmModelStore(root)
        val staging = store.createStagingDir(manifest)
        store.openNewArtifact(manifest, staging, manifest.modelFileName).use { it.write(bytes) }
        store.openNewArtifact(manifest, staging, manifest.mmprojFileName).use { it.write(bytes) }
        val verifier = MiniCpmModelVerifier(store)
        val token = verifier.verify(staging, manifest)
        check(token is ModelVerification.Success)

        File(staging, manifest.modelFileName).writeText("tampered")
        expectStoreFailure { store.activateVerified(staging, manifest, token) }
        check(!File(staging.parentFile, manifest.version).exists())

        File(staging, manifest.modelFileName).writeBytes(bytes)
        expectStoreFailure { store.activateVerified(staging, manifest, token) }
        check(!File(staging.parentFile, manifest.version).exists()) { "Consumed verification token was replayed" }
    }
}

private fun verificationTokenRejectsRecreatedStaging() {
    withPrivateRoot { root ->
        val bytes = "verified".toByteArray()
        val manifest = manifest("1", bytes, bytes)
        val store = MiniCpmModelStore(root)
        val staging = store.createStagingDir(manifest)
        store.openNewArtifact(manifest, staging, manifest.modelFileName).use { it.write(bytes) }
        store.openNewArtifact(manifest, staging, manifest.mmprojFileName).use { it.write(bytes) }
        val token = MiniCpmModelVerifier(store).verify(staging, manifest)
        check(token is ModelVerification.Success)

        store.deleteStagingDir(manifest, staging)
        val replacement = store.createStagingDir(manifest)
        store.openNewArtifact(manifest, replacement, manifest.modelFileName).use { it.write(bytes) }
        store.openNewArtifact(manifest, replacement, manifest.mmprojFileName).use { it.write(bytes) }

        expectStoreFailure { store.activateVerified(replacement, manifest, token) }
        check(!File(replacement.parentFile, manifest.version).exists()) { "Recreated staging accepted a stale token" }
    }
}

private fun networkOpenFailuresTransitionToFailedAndCloseResources() {
    withPrivateRoot { root ->
        val bytes = "network".toByteArray()
        val manifest = manifest("1", bytes, bytes)
        val store = MiniCpmModelStore(root)
        val stateMachine = DownloadStateMachine()
        val downloader = MiniCpmModelDownloader(
            store,
            MiniCpmModelVerifier(store),
            stateMachine,
            ModelHttpClient { throw IOException("first open failed") },
        )

        expectDownloadFailure { downloader.downloadAndInstall(manifest, urls("1"), AtomicBoolean(false)) }
        check(stateMachine.snapshot().state == DownloadState.FAILED)
        check(!File(File(root, "minicpm/minicpm-v"), "staging-1").exists())
    }

    withPrivateRoot { root ->
        val bytes = "network".toByteArray()
        val manifest = manifest("1", bytes, bytes)
        val store = MiniCpmModelStore(root)
        val stateMachine = DownloadStateMachine()
        var opens = 0
        var firstClosed = false
        val downloader = MiniCpmModelDownloader(
            store,
            MiniCpmModelVerifier(store),
            stateMachine,
            ModelHttpClient {
                opens += 1
                if (opens == 1) {
                    ModelHttpResponse(200, bytes.size.toLong(), ByteArrayInputStream(bytes)) { firstClosed = true }
                } else {
                    throw IOException("second open failed")
                }
            },
        )

        expectDownloadFailure { downloader.downloadAndInstall(manifest, urls("1"), AtomicBoolean(false)) }
        check(stateMachine.snapshot().state == DownloadState.FAILED)
        check(firstClosed) { "First response leaked when the second open failed" }
        check(!File(File(root, "minicpm/minicpm-v"), "staging-1").exists())
    }
}

private fun progressObserverFailuresCannotBreakCleanupOrCommit() {
    withPrivateRoot { root ->
        val bytes = "failure".toByteArray()
        val manifest = manifest("1", bytes, bytes)
        val store = MiniCpmModelStore(root)
        val downloader = MiniCpmModelDownloader(
            store,
            MiniCpmModelVerifier(store),
            DownloadStateMachine(),
            ModelHttpClient { ModelHttpResponse(503, 0L, ByteArrayInputStream(ByteArray(0))) },
        )

        expectDownloadFailure {
            downloader.downloadAndInstall(manifest, urls("1"), AtomicBoolean(false)) { snapshot ->
                if (snapshot.state == DownloadState.FAILED) throw IllegalStateException("observer failed")
            }
        }
        check(!File(File(root, "minicpm/minicpm-v"), "staging-1").exists())
    }

    withPrivateRoot { root ->
        val bytes = "success".toByteArray()
        val manifest = manifest("1", bytes, bytes)
        val store = MiniCpmModelStore(root)
        val downloader = MiniCpmModelDownloader(
            store,
            MiniCpmModelVerifier(store),
            DownloadStateMachine(),
            ModelHttpClient { response(bytes) },
        )

        val active = downloader.downloadAndInstall(manifest, urls("1"), AtomicBoolean(false)) { snapshot ->
            if (snapshot.state == DownloadState.COMPLETE) throw IllegalStateException("observer failed")
        }
        check(active.isDirectory)
        check(File(active, manifest.modelFileName).isFile)
        check(File(active, manifest.mmprojFileName).isFile)
    }
}

private fun installVersion(root: File, version: String): File {
    val bytes = "active-$version".toByteArray()
    val manifest = manifest(version, bytes, bytes)
    val active = downloader(root, mutableListOf()) { response(bytes) }
        .downloadAndInstall(manifest, urls(version), AtomicBoolean(false))
    File(active, "active-sentinel").writeText("keep")
    return active
}

private fun downloader(
    root: File,
    calls: MutableList<String>,
    open: (String) -> ModelHttpResponse,
): MiniCpmModelDownloader {
    val store = MiniCpmModelStore(root)
    return MiniCpmModelDownloader(
        store,
        MiniCpmModelVerifier(store),
        DownloadStateMachine(),
        ModelHttpClient { url -> calls += url; open(url) },
    )
}

private fun response(bytes: ByteArray) = ModelHttpResponse(200, bytes.size.toLong(), ByteArrayInputStream(bytes))

private class CancellingInputStream(bytes: ByteArray, private val cancelled: AtomicBoolean) : InputStream() {
    private val delegate = ByteArrayInputStream(bytes)
    override fun read(): Int = delegate.read().also { if (it >= 0) cancelled.set(true) }
    override fun read(buffer: ByteArray, offset: Int, length: Int): Int =
        delegate.read(buffer, offset, length).also { if (it > 0) cancelled.set(true) }
}

private fun manifest(version: String, model: ByteArray, mmproj: ByteArray) = LocalModelManifest(
    "minicpm-v",
    version,
    "model.gguf",
    model.size.toLong(),
    hash(model),
    "mmproj.gguf",
    mmproj.size.toLong(),
    hash(mmproj),
    "runtime-1",
)

private fun urls(version: String) = LocalModelDownloadUrls(
    "https://example.test/$version/model",
    "https://example.test/$version/mmproj",
)

private fun hash(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
    .digest(bytes).joinToString("") { "%02x".format(it) }

private fun expectDownloadFailure(block: () -> Unit) {
    try {
        block()
        error("Expected model installation failure")
    } catch (_: ModelDownloadException) {
    }
}

private fun expectStoreFailure(block: () -> Unit) {
    try {
        block()
        error("Expected model-store failure")
    } catch (_: IllegalArgumentException) {
    } catch (_: IllegalStateException) {
    }
}

private inline fun withPrivateRoot(block: (File) -> Unit) {
    val root = Files.createTempDirectory("minicpm-pipeline").toFile()
    try {
        block(root)
    } finally {
        root.deleteRecursively()
    }
}
