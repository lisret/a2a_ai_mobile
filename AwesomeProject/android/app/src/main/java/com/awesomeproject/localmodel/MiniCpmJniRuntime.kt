package com.awesomeproject.localmodel

import java.io.File

private const val NATIVE_UNAVAILABLE = "native_runtime_unavailable"

interface MiniCpmNativeBoundary {
    fun loadLibrary()
    fun load(modelDir: String, modelFileName: String, mmprojFileName: String): Boolean
    fun infer(prompt: String, imageBytes: ByteArray, timeoutMs: Long): LocalVisionResult
    fun release()
}

private class SystemMiniCpmNativeBoundary(private val libraryName: String) : MiniCpmNativeBoundary {
    override fun loadLibrary() {
        System.loadLibrary(libraryName)
    }

    override fun load(modelDir: String, modelFileName: String, mmprojFileName: String): Boolean =
        nativeLoad(modelDir, modelFileName, mmprojFileName)

    override fun infer(prompt: String, imageBytes: ByteArray, timeoutMs: Long): LocalVisionResult =
        nativeInfer(prompt, imageBytes, timeoutMs)

    override fun release() = nativeRelease()

    private external fun nativeLoad(modelDir: String, modelFileName: String, mmprojFileName: String): Boolean
    private external fun nativeInfer(prompt: String, imageBytes: ByteArray, timeoutMs: Long): LocalVisionResult
    private external fun nativeRelease()
}

/** Lazy, guarded JNI runtime. Native loading occurs only through availability checks. */
class MiniCpmJniRuntime(
    private val boundary: MiniCpmNativeBoundary = SystemMiniCpmNativeBoundary("minicpm"),
) : MiniCpmRuntime {
    private enum class State { UNCHECKED, AVAILABLE, UNAVAILABLE }

    private val lock = Any()
    @Volatile
    private var state = State.UNCHECKED

    override fun availability(): RuntimeAvailability = synchronized(lock) {
        availabilityLocked()
    }

    override fun load(modelDir: File, manifest: LocalModelManifest): RuntimeResult = synchronized(lock) {
        if (!availabilityLocked().available) return@synchronized unavailableRuntimeResult()
        try {
            if (boundary.load(modelDir.absolutePath, manifest.modelFileName, manifest.mmprojFileName)) {
                RuntimeResult(true)
            } else {
                RuntimeResult(false, "native_load_failed")
            }
        } catch (_: UnsatisfiedLinkError) {
            markUnavailableLocked()
            unavailableRuntimeResult()
        }
    }

    override fun infer(request: LocalVisionRequest, timeoutMs: Long): LocalVisionResult = synchronized(lock) {
        if (!availabilityLocked().available) return@synchronized unavailableVisionResult()
        try {
            boundary.infer(request.prompt, request.imageBytes, timeoutMs)
        } catch (_: UnsatisfiedLinkError) {
            markUnavailableLocked()
            unavailableVisionResult()
        }
    }

    override fun release() = synchronized(lock) {
        if (!availabilityLocked().available) return@synchronized
        try {
            boundary.release()
        } catch (_: UnsatisfiedLinkError) {
            markUnavailableLocked()
        }
    }

    private fun availabilityLocked(): RuntimeAvailability {
        if (state == State.UNCHECKED) {
            state = try {
                boundary.loadLibrary()
                State.AVAILABLE
            } catch (_: UnsatisfiedLinkError) {
                State.UNAVAILABLE
            } catch (_: SecurityException) {
                State.UNAVAILABLE
            }
        }
        return if (state == State.AVAILABLE) RuntimeAvailability(true)
        else RuntimeAvailability(false, NATIVE_UNAVAILABLE)
    }

    private fun markUnavailableLocked() {
        state = State.UNAVAILABLE
    }

    private fun unavailableRuntimeResult() = RuntimeResult(false, NATIVE_UNAVAILABLE)
    private fun unavailableVisionResult() = LocalVisionResult(false, reason = NATIVE_UNAVAILABLE)

}
