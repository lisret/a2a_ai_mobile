package com.awesomeproject.lanmcp

import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Single-slot, non-queueing serializer for device operations.
 *
 * Mutating tools *and* screen captures take this one slot, so a second operation is
 * refused (never queued) while one is in flight. That bounds a client's backlog of taps
 * and swipes and, just as importantly, prevents concurrent full-resolution captures from
 * stacking bitmap memory.
 */
class ActionSerializer {

    private val busy = AtomicBoolean(false)

    /** Returns false when another mutating action currently holds the slot. */
    fun tryAcquire(): Boolean = busy.compareAndSet(false, true)

    fun release() {
        busy.set(false)
    }

    fun isBusy(): Boolean = busy.get()
}

/**
 * Bounded concurrency gate for HTTP handling. Excess requests are rejected with
 * 429 instead of being queued, so the server has no unbounded request backlog.
 */
class ConcurrencyGate(private val maxConcurrent: Int) {
    private val inFlight = AtomicInteger(0)

    init {
        require(maxConcurrent > 0) { "maxConcurrent must be positive" }
    }

    fun tryAcquire(): Boolean {
        while (true) {
            val current = inFlight.get()
            if (current >= maxConcurrent) return false
            if (inFlight.compareAndSet(current, current + 1)) return true
        }
    }

    fun release() {
        inFlight.decrementAndGet()
    }

    fun inFlight(): Int = inFlight.get()

    fun limit(): Int = maxConcurrent
}

/**
 * Live "a local automation task owns the device" flag.
 *
 * Wired from [com.awesomeproject.service.TaskExecutionService]: it is set while that task
 * foreground service is alive for an accepted task, and cleared in `onDestroy`. While it
 * is set, every LAN MCP device-touching tool is refused with `E_TASK_RUNNING`, and the
 * task service itself refuses to start a *new* local task while the MCP service is
 * running — so the two controllers cannot drive the UI at the same time.
 *
 * `phone_status` stays available and reports this flag.
 */
object LanMcpLocalTask {

    private val running = AtomicBoolean(false)

    fun setRunning(value: Boolean) {
        running.set(value)
    }

    fun isRunning(): Boolean = running.get()
}
