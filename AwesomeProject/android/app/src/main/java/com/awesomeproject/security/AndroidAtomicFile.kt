package com.awesomeproject.security

import android.system.Os
import android.system.OsConstants
import java.io.File

internal fun replaceFileAtomically(source: File, target: File) {
    Os.rename(source.absolutePath, target.absolutePath)
    fsyncParentDirectory(target)
}

internal fun deleteFileAndSync(target: File): Boolean {
    if (!target.exists()) {
        return true
    }
    if (!target.delete()) {
        return !target.exists()
    }
    fsyncParentDirectory(target)
    return true
}

private fun fsyncParentDirectory(target: File) {
    val directory = Os.open(
        target.parentFile?.absolutePath
            ?: throw IllegalArgumentException("Credential file has no parent directory"),
        OsConstants.O_RDONLY,
        0,
    )
    try {
        Os.fsync(directory)
    } finally {
        Os.close(directory)
    }
}
