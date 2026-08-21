package com.awesomeproject.localmodel

import java.io.File
import java.io.OutputStream
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.FileVisitResult
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.SimpleFileVisitor
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption
import java.nio.file.attribute.BasicFileAttributes

/** App-private, no-follow model storage. Every public operation revalidates its path chain. */
class MiniCpmModelStore(filesDir: File) {
    private val privateRoot = filesDir.toPath().toAbsolutePath().normalize()
    private val privateRealRoot: Path
    private val root = privateRoot.resolve("minicpm")
    private val activationLock = Any()

    init {
        require(Files.isDirectory(privateRoot, LinkOption.NOFOLLOW_LINKS) && !Files.isSymbolicLink(privateRoot)) {
            "filesDir must be a real app-private directory"
        }
        privateRealRoot = privateRoot.toRealPath(LinkOption.NOFOLLOW_LINKS)
    }

    fun activeDir(manifest: LocalModelManifest): File? {
        validateManifest(manifest)
        val model = secureModelDir(manifest, create = false) ?: return null
        val active = model.resolve(manifest.version)
        return active.takeIf { isSecureDirectory(it) }?.toFile()
    }

    fun createStagingDir(manifest: LocalModelManifest): File {
        validateManifest(manifest)
        val model = checkNotNull(secureModelDir(manifest, create = true))
        val staging = model.resolve("staging-${manifest.version}")
        check(!Files.exists(staging, LinkOption.NOFOLLOW_LINKS)) { "Staging path already exists" }
        Files.createDirectory(staging)
        check(isSecureDirectory(staging)) { "Unable to create secure staging directory" }
        return staging.toFile()
    }

    fun isExpectedStagingDir(manifest: LocalModelManifest, directory: File): Boolean {
        return try {
            validateManifest(manifest)
            val model = secureModelDir(manifest, create = false) ?: return false
            val expected = model.resolve("staging-${manifest.version}").toAbsolutePath().normalize()
            directory.toPath().toAbsolutePath().normalize() == expected && isSecureDirectory(expected)
        } catch (_: IllegalArgumentException) {
            false
        } catch (_: IllegalStateException) {
            false
        }
    }

    fun deleteStagingDir(manifest: LocalModelManifest, staging: File) {
        check(isExpectedStagingDir(manifest, staging)) { "Refusing to delete a non-staging directory" }
        Files.walkFileTree(staging.toPath(), object : SimpleFileVisitor<Path>() {
            override fun visitFile(file: Path, attrs: BasicFileAttributes): FileVisitResult {
                Files.delete(file)
                return FileVisitResult.CONTINUE
            }

            override fun postVisitDirectory(dir: Path, error: java.io.IOException?): FileVisitResult {
                if (error != null) throw error
                Files.delete(dir)
                return FileVisitResult.CONTINUE
            }
        })
    }

    fun openNewArtifact(manifest: LocalModelManifest, staging: File, fileName: String): OutputStream {
        requireValidSegment(fileName, "filename")
        check(isExpectedStagingDir(manifest, staging)) { "Invalid staging directory" }
        val artifact = staging.toPath().resolve(fileName).normalize()
        check(artifact.parent == staging.toPath().toAbsolutePath().normalize()) { "Artifact escaped staging" }
        check(!Files.exists(artifact, LinkOption.NOFOLLOW_LINKS)) { "Artifact path already exists" }
        return Files.newOutputStream(
            artifact,
            StandardOpenOption.CREATE_NEW,
            StandardOpenOption.WRITE,
            LinkOption.NOFOLLOW_LINKS,
        )
    }

    fun artifactPath(manifest: LocalModelManifest, directory: File, fileName: String): Path {
        requireValidSegment(fileName, "filename")
        check(isManagedArtifactDirectory(manifest, directory)) { "Artifact directory is outside model storage" }
        val artifact = directory.toPath().toAbsolutePath().normalize().resolve(fileName).normalize()
        check(artifact.parent == directory.toPath().toAbsolutePath().normalize()) { "Artifact escaped model directory" }
        return artifact
    }

    fun activateVerified(
        staging: File,
        manifest: LocalModelManifest,
        verification: ModelVerification.Success,
    ): File = synchronized(activationLock) {
        check(isExpectedStagingDir(manifest, staging)) { "Invalid staging directory" }
        val model = checkNotNull(secureModelDir(manifest, create = false))
        val active = model.resolve(manifest.version)
        val activeFile = active.toFile()
        check(!Files.exists(active, LinkOption.NOFOLLOW_LINKS)) { "An active version already exists" }
        check(Files.getFileStore(staging.toPath()) == Files.getFileStore(model)) {
            "Staging and active directories must share a filesystem"
        }
        check(verification.consumeAndRevalidate(staging, manifest)) {
            "Verification token is stale, replayed, or does not match staging content"
        }
        try {
            Files.move(staging.toPath(), active, StandardCopyOption.ATOMIC_MOVE)
        } catch (error: AtomicMoveNotSupportedException) {
            throw IllegalStateException("Atomic activation is unavailable", error)
        }
        activeFile
    }

    fun validateManifest(manifest: LocalModelManifest) {
        requireValidSegment(manifest.modelId, "modelId")
        requireValidSegment(manifest.version, "version")
        requireValidSegment(manifest.modelFileName, "model filename")
        requireValidSegment(manifest.mmprojFileName, "mmproj filename")
        require(manifest.modelFileName != manifest.mmprojFileName) { "Artifact filenames must differ" }
    }

    private fun isManagedArtifactDirectory(manifest: LocalModelManifest, directory: File): Boolean {
        validateManifest(manifest)
        val model = secureModelDir(manifest, create = false) ?: return false
        val actual = directory.toPath().toAbsolutePath().normalize()
        val staging = model.resolve("staging-${manifest.version}")
        val active = model.resolve(manifest.version)
        return (actual == staging || actual == active) && isSecureDirectory(actual)
    }

    private fun secureModelDir(manifest: LocalModelManifest, create: Boolean): Path? {
        val secureRoot = secureChildDirectory(privateRoot, root, create) ?: return null
        val model = secureRoot.resolve(manifest.modelId)
        return secureChildDirectory(secureRoot, model, create)
    }

    private fun secureChildDirectory(parent: Path, child: Path, create: Boolean): Path? {
        check(isSecureDirectory(parent)) { "Parent directory is not secure" }
        if (!Files.exists(child, LinkOption.NOFOLLOW_LINKS)) {
            if (!create) return null
            Files.createDirectory(child)
        }
        check(!Files.isSymbolicLink(child) && Files.isDirectory(child, LinkOption.NOFOLLOW_LINKS)) {
            "Symbolic-link or non-directory storage component"
        }
        val real = child.toRealPath(LinkOption.NOFOLLOW_LINKS)
        check(real.startsWith(privateRealRoot) && real.parent == parent.toRealPath(LinkOption.NOFOLLOW_LINKS)) {
            "Storage component escaped app-private root"
        }
        return child.toAbsolutePath().normalize()
    }

    private fun isSecureDirectory(path: Path): Boolean {
        if (Files.isSymbolicLink(path) || !Files.isDirectory(path, LinkOption.NOFOLLOW_LINKS)) return false
        return try {
            path.toRealPath(LinkOption.NOFOLLOW_LINKS).startsWith(privateRealRoot)
        } catch (_: java.io.IOException) {
            false
        }
    }

    private fun requireValidSegment(value: String, label: String) {
        val candidate = Paths.get(value)
        require(
            value.isNotBlank() &&
                value != "." &&
                value != ".." &&
                candidate.nameCount == 1 &&
                candidate.fileName.toString() == value,
        ) { "Invalid $label" }
    }
}
