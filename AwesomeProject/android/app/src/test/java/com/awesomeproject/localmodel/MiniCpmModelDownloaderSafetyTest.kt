package com.awesomeproject.localmodel

import java.io.ByteArrayInputStream
import java.io.File
import java.nio.file.Files
import java.util.concurrent.atomic.AtomicBoolean

fun main() {
    rejectsDotSegments()
    rejectsRootModelAndStagingSymlinks()
    artifactSymlinkNeverWritesOrDeletesExternalSentinel()
}

private fun rejectsDotSegments() {
    withTempDirs { privateRoot, _ ->
        val store = MiniCpmModelStore(privateRoot)
        expectFailure { store.createStagingDir(manifest(modelId = ".")) }
        expectFailure { store.createStagingDir(manifest(modelId = "..")) }
        expectFailure { store.createStagingDir(manifest(version = ".")) }
        expectFailure { store.createStagingDir(manifest(version = "..")) }
        expectFailure { store.createStagingDir(manifest(modelFileName = ".")) }
        expectFailure { store.createStagingDir(manifest(mmprojFileName = "..")) }
    }
}

private fun rejectsRootModelAndStagingSymlinks() {
    withTempDirs { privateRoot, externalRoot ->
        val sentinel = File(externalRoot, "sentinel.txt").apply { writeText("outside") }
        Files.createSymbolicLink(File(privateRoot, "minicpm").toPath(), externalRoot.toPath())
        expectFailure { MiniCpmModelStore(privateRoot).createStagingDir(manifest()) }
        check(sentinel.readText() == "outside")
        check(externalRoot.listFiles()?.map { it.name } == listOf("sentinel.txt")) { "Root symlink escaped app-private storage" }
    }

    withTempDirs { privateRoot, externalRoot ->
        val root = File(privateRoot, "minicpm").apply { check(mkdir()) }
        val sentinel = File(externalRoot, "sentinel.txt").apply { writeText("outside") }
        Files.createSymbolicLink(File(root, "minicpm-v").toPath(), externalRoot.toPath())
        expectFailure { MiniCpmModelStore(privateRoot).createStagingDir(manifest()) }
        check(sentinel.readText() == "outside")
        check(externalRoot.listFiles()?.map { it.name } == listOf("sentinel.txt")) { "Model symlink escaped app-private storage" }
    }

    withTempDirs { privateRoot, externalRoot ->
        val modelRoot = File(File(privateRoot, "minicpm").apply { check(mkdir()) }, "minicpm-v").apply { check(mkdir()) }
        val sentinel = File(externalRoot, "sentinel.txt").apply { writeText("outside") }
        val staging = File(modelRoot, "staging-1")
        Files.createSymbolicLink(staging.toPath(), externalRoot.toPath())
        val opens = mutableListOf<String>()
        val downloader = pipeline(privateRoot, opens) { byteArrayOf(1) }
        expectFailure { downloader.downloadAndInstall(manifest(), urls(), AtomicBoolean(false)) }
        check(opens.isEmpty()) { "Staging symlink must fail before HTTP" }
        check(sentinel.readText() == "outside")
        check(Files.isSymbolicLink(staging.toPath())) { "Invalid staging symlink must not be deleted" }
    }
}

private fun artifactSymlinkNeverWritesOrDeletesExternalSentinel() {
    withTempDirs { privateRoot, externalRoot ->
        val store = MiniCpmModelStore(privateRoot)
        val manifest = manifest()
        val staging = store.createStagingDir(manifest)
        val sentinel = File(externalRoot, "sentinel.bin").apply { writeBytes(byteArrayOf(99)) }
        Files.createSymbolicLink(File(staging, manifest.modelFileName).toPath(), sentinel.toPath())
        val opens = mutableListOf<String>()
        val downloader = pipeline(privateRoot, opens) { byteArrayOf(1) }

        expectFailure { downloader.downloadAndInstall(manifest, urls(), AtomicBoolean(false), staging) }

        check(sentinel.readBytes().contentEquals(byteArrayOf(99))) { "Artifact symlink target was overwritten" }
        check(sentinel.exists()) { "Artifact symlink target was deleted" }
        check(!staging.exists()) { "Validated staging should be cleaned without following its artifact symlink" }
    }
}

private fun pipeline(privateRoot: File, opens: MutableList<String>, bytes: (String) -> ByteArray): MiniCpmModelDownloader {
    val store = MiniCpmModelStore(privateRoot)
    return MiniCpmModelDownloader(
        store,
        MiniCpmModelVerifier(store),
        DownloadStateMachine(),
        ModelHttpClient { url ->
            opens += url
            val body = bytes(url)
            ModelHttpResponse(200, body.size.toLong(), ByteArrayInputStream(body))
        },
    )
}

private fun manifest(
    modelId: String = "minicpm-v",
    version: String = "1",
    modelFileName: String = "model.gguf",
    mmprojFileName: String = "mmproj.gguf",
): LocalModelManifest = LocalModelManifest(
    modelId,
    version,
    modelFileName,
    1L,
    sha256(byteArrayOf(1)),
    mmprojFileName,
    1L,
    sha256(byteArrayOf(1)),
    "runtime-1",
)

private fun urls() = LocalModelDownloadUrls("https://example.test/model", "https://example.test/mmproj")

private fun sha256(bytes: ByteArray): String = java.security.MessageDigest.getInstance("SHA-256")
    .digest(bytes).joinToString("") { "%02x".format(it) }

private fun expectFailure(block: () -> Unit) {
    try {
        block()
        error("Expected failure")
    } catch (_: IllegalArgumentException) {
    } catch (_: IllegalStateException) {
    } catch (_: ModelDownloadException) {
    }
}

private inline fun withTempDirs(block: (File, File) -> Unit) {
    val privateRoot = Files.createTempDirectory("minicpm-private").toFile()
    val externalRoot = Files.createTempDirectory("minicpm-external").toFile()
    try {
        block(privateRoot, externalRoot)
    } finally {
        privateRoot.deleteRecursively()
        externalRoot.deleteRecursively()
    }
}
