package com.awesomeproject.lanmcp

import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.locks.ReentrantLock

/**
 * Monotonic start/stop generation plus the dispatch boundary that revocation is
 * serialized against.
 *
 * Every accepted HTTP request captures the generation. An action is executed through
 * [runIfCurrent], which holds [dispatchBoundary] for the whole dispatch-and-await, so a
 * concurrent [markStopped] can neither interleave between the generation check and the
 * platform call, nor return while a gesture it revoked is still posted.
 *
 * Honest limits: a gesture that the platform has already been handed cannot be recalled.
 * [markStopped] therefore *waits* (bounded) for an in-flight dispatch to finish and
 * reports whether the boundary was free; when the wait times out the generation is still
 * invalidated, so no further action starts, and the caller must not claim the in-flight
 * gesture was revoked.
 *
 * There is deliberately no auto-restart: [isRunning] only becomes true through an
 * explicit [markStarted] call caused by a user-initiated start.
 */
class StopGeneration {

    private val generation = AtomicLong(0L)
    private val running = AtomicBoolean(false)
    private val dispatchBoundary = ReentrantLock()

    /** Marks a user-initiated start and returns the new generation. */
    fun markStarted(): Long {
        running.set(true)
        return generation.incrementAndGet()
    }

    /**
     * Revokes every previously captured generation.
     *
     * @param waitMillis how long to wait for an in-flight dispatch to leave the boundary.
     *   The generation is invalidated either way; the wait only buys the guarantee that no
     *   already-posted gesture is still running when this returns.
     * @return true when the dispatch boundary was free (nothing had been posted).
     */
    fun markStopped(waitMillis: Long = 0L): Boolean {
        running.set(false)
        val acquired = try {
            if (waitMillis <= 0L) {
                dispatchBoundary.tryLock()
            } else {
                dispatchBoundary.tryLock(waitMillis, TimeUnit.MILLISECONDS)
            }
        } catch (interrupted: InterruptedException) {
            Thread.currentThread().interrupt()
            false
        }
        try {
            generation.incrementAndGet()
        } finally {
            if (acquired) dispatchBoundary.unlock()
        }
        return acquired
    }

    fun current(): Long = generation.get()

    fun isRunning(): Boolean = running.get()

    /** True only while running AND the captured generation is still the current one. */
    fun isCurrent(captured: Long): Boolean = running.get() && generation.get() == captured

    /**
     * Runs [body] only while [captured] is current, holding the dispatch boundary for the
     * entire call (dispatch *and* callback wait). [refused] is evaluated inside the boundary
     * so the refusal cannot itself race a concurrent stop.
     */
    fun <T> runIfCurrent(captured: Long, refused: () -> T, body: () -> T): T {
        dispatchBoundary.lock()
        try {
            if (!running.get() || generation.get() != captured) return refused()
            return body()
        } finally {
            dispatchBoundary.unlock()
        }
    }

    /** Diagnostic/test hook: true while any thread is inside the dispatch boundary. */
    fun isDispatching(): Boolean = dispatchBoundary.isLocked
}
