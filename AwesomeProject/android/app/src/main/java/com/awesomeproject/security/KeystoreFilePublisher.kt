package com.awesomeproject.security

import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.IOException
import java.io.RandomAccessFile
import java.util.UUID
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

internal class KeystoreFilePublisher(
    private val atomicReplace: (source: File, target: File) -> Unit,
) {
    fun loadOrInitialize(target: File, initializer: () -> ByteArray): ByteArray {
        var candidate: ByteArray? = null
        var delivered = false
        try {
            val result = withLock(target) {
                readOrNullUnlocked(target) ?: initializer().also { initialized ->
                    candidate = initialized
                    publishUnlocked(target, initialized)
                }
            }
            delivered = true
            return result
        } finally {
            if (!delivered) {
                candidate?.fill(0)
            }
        }
    }

    fun publish(target: File, bytes: ByteArray) {
        withLock(target) {
            publishUnlocked(target, bytes)
        }
    }

    fun readOrNull(target: File): ByteArray? = withLock(target) {
        readOrNullUnlocked(target)
    }

    fun delete(
        target: File,
        deleteAction: (File) -> Boolean = { file -> !file.exists() || file.delete() },
    ): Boolean = withLock(target) {
        deleteAction(target)
    }

    fun <T> withLock(target: File, action: () -> T): T {
        ensureParentDirectory(target)
        return PROCESS_LOCK.withLock {
            val lockFile = File(target.parentFile, "${target.name}.lock")
            RandomAccessFile(lockFile, "rw").channel.use { channel ->
                channel.lock().use {
                    action()
                }
            }
        }
    }

    private fun readOrNullUnlocked(target: File): ByteArray? = try {
        target.readBytes()
    } catch (_: FileNotFoundException) {
        null
    }

    private fun publishUnlocked(target: File, bytes: ByteArray) {
        ensureParentDirectory(target)
        val temporary = File(
            target.parentFile,
            "${target.name}.tmp.${UUID.randomUUID()}",
        )
        try {
            FileOutputStream(temporary).use { output ->
                output.write(bytes)
                output.fd.sync()
            }
            atomicReplace(temporary, target)
        } finally {
            if (temporary.exists()) {
                temporary.delete()
            }
        }
    }

    private fun ensureParentDirectory(target: File) {
        val parent = target.parentFile
            ?: throw IOException("Credential file has no parent directory")
        if (!(parent.mkdirs() || parent.isDirectory)) {
            throw IOException("Credential directory unavailable")
        }
    }

    companion object {
        private val PROCESS_LOCK = ReentrantLock()
    }
}
