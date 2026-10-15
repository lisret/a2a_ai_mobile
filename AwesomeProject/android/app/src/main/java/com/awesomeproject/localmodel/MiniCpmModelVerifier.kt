package com.awesomeproject.localmodel

import java.io.File
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import java.nio.file.attribute.BasicFileAttributes
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

internal data class ModelDirectoryIdentity(
    val realPath: Path,
    val fileKey: Any?,
)

internal data class ModelArtifactIdentity(
    val realPath: Path,
    val fileKey: Any?,
    val size: Long,
    val lastModifiedEpochMs: Long,
    val sha256: String,
)

sealed class ModelVerification(
    val filesPresent: Boolean,
    val valid: Boolean,
    val reason: String?,
) {
    class Success internal constructor(
        private val verifiedDirectory: ModelDirectoryIdentity,
        private val verifiedManifest: LocalModelManifest,
        private val verifiedModel: ModelArtifactIdentity,
        private val verifiedMmproj: ModelArtifactIdentity,
    ) : ModelVerification(true, true, null) {
        private val consumed = AtomicBoolean(false)

        internal fun consumeAndRevalidate(directory: File, manifest: LocalModelManifest): Boolean {
            if (!consumed.compareAndSet(false, true) || manifest != verifiedManifest) return false
            val directoryPath = directory.toPath().toAbsolutePath().normalize()
            if (captureDirectoryIdentity(directoryPath) != verifiedDirectory) return false
            val model = captureArtifactIdentity(
                directoryPath.resolve(manifest.modelFileName),
                manifest.modelByteLength,
                manifest.modelSha256,
            ) ?: return false
            val mmproj = captureArtifactIdentity(
                directoryPath.resolve(manifest.mmprojFileName),
                manifest.mmprojByteLength,
                manifest.mmprojSha256,
            ) ?: return false
            return model == verifiedModel && mmproj == verifiedMmproj
        }
    }

    class Failure internal constructor(filesPresent: Boolean, reason: String) :
        ModelVerification(filesPresent, false, reason)
}

class MiniCpmModelVerifier(private val store: MiniCpmModelStore) {
    fun verify(modelDir: File, manifest: LocalModelManifest): ModelVerification {
        val model = try {
            store.artifactPath(manifest, modelDir, manifest.modelFileName)
        } catch (_: Exception) {
            return ModelVerification.Failure(false, "invalid_model_path")
        }
        val mmproj = try {
            store.artifactPath(manifest, modelDir, manifest.mmprojFileName)
        } catch (_: Exception) {
            return ModelVerification.Failure(false, "invalid_mmproj_path")
        }
        if (!isRealFile(model) || !isRealFile(mmproj)) {
            return ModelVerification.Failure(false, "model_files_missing")
        }
        val modelIdentity = captureArtifactIdentity(model, manifest.modelByteLength, manifest.modelSha256)
        if (modelIdentity == null) {
            return ModelVerification.Failure(true, "model_integrity_failed")
        }
        val mmprojIdentity = captureArtifactIdentity(mmproj, manifest.mmprojByteLength, manifest.mmprojSha256)
        if (mmprojIdentity == null) {
            return ModelVerification.Failure(true, "mmproj_integrity_failed")
        }
        val directoryIdentity = captureDirectoryIdentity(modelDir.toPath())
            ?: return ModelVerification.Failure(false, "invalid_model_path")
        return ModelVerification.Success(directoryIdentity, manifest, modelIdentity, mmprojIdentity)
    }

    private fun isRealFile(path: Path): Boolean =
        !Files.isSymbolicLink(path) && Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)

}

private fun captureDirectoryIdentity(path: Path): ModelDirectoryIdentity? {
    return try {
        if (Files.isSymbolicLink(path)) return null
        val attributes = Files.readAttributes(path, BasicFileAttributes::class.java, LinkOption.NOFOLLOW_LINKS)
        if (!attributes.isDirectory) return null
        ModelDirectoryIdentity(path.toRealPath(LinkOption.NOFOLLOW_LINKS), attributes.fileKey())
    } catch (_: Exception) {
        null
    }
}

private fun captureArtifactIdentity(
    path: Path,
    expectedLength: Long,
    expectedSha256: String,
): ModelArtifactIdentity? {
    return try {
        if (expectedLength < 0 || Files.isSymbolicLink(path)) return null
        val before = Files.readAttributes(path, BasicFileAttributes::class.java, LinkOption.NOFOLLOW_LINKS)
        if (!before.isRegularFile || before.size() != expectedLength) return null
        val digest = MessageDigest.getInstance("SHA-256")
        Files.newInputStream(path, StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS).use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        val actualSha256 = digest.digest().joinToString("") { "%02x".format(it) }
        if (!actualSha256.equals(expectedSha256, ignoreCase = true)) return null
        val after = Files.readAttributes(path, BasicFileAttributes::class.java, LinkOption.NOFOLLOW_LINKS)
        if (
            !after.isRegularFile ||
            before.fileKey() != after.fileKey() ||
            before.size() != after.size() ||
            before.lastModifiedTime() != after.lastModifiedTime()
        ) {
            return null
        }
        ModelArtifactIdentity(
            path.toRealPath(LinkOption.NOFOLLOW_LINKS),
            after.fileKey(),
            after.size(),
            after.lastModifiedTime().toMillis(),
            actualSha256,
        )
    } catch (_: Exception) {
        null
    }
}
