package com.awesomeproject.lanmcp

import java.util.Collections
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.SynchronousQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/**
 * Queue-free, bounded hand-off of accepted connections.
 *
 * NanoHTTPD's default runner starts one unbounded thread per accepted socket *before* any
 * request-level limit applies, so a burst of connections could exhaust threads and memory
 * no matter what the router's concurrency gate says. This runner caps the number of
 * handlers at [limit], hands work straight to a thread (`SynchronousQueue` never buffers),
 * and reports a rejection so the caller can close the socket immediately instead of
 * queueing it.
 *
 * Worst case admitted work is therefore bounded: `limit` handlers, each holding at most
 * one 64 KiB request body plus (for a capture) one frame.
 */
class BoundedRequestRunner<T : Any>(
    private val limit: Int,
    threadNamePrefix: String = DEFAULT_THREAD_NAME,
) {

    init {
        require(limit > 0) { "limit must be positive" }
    }

    /**
     * `Collections.newSetFromMap` (API 9) rather than `ConcurrentHashMap.newKeySet()` (API 24)
     * so the runner works on minSdk 21.
     */
    private val active: MutableSet<T> = Collections.newSetFromMap(ConcurrentHashMap<T, Boolean>())

    private val pool = ThreadPoolExecutor(
        0,
        limit,
        60L,
        TimeUnit.SECONDS,
        SynchronousQueue<Runnable>(),
        { runnable -> Thread(runnable, threadNamePrefix).apply { isDaemon = true } },
        ThreadPoolExecutor.AbortPolicy(),
    )

    /**
     * @return true when [body] was accepted for execution; false means the limit was
     *   reached and the caller must dispose of [task] (close the socket) rather than wait.
     */
    @Synchronized fun submit(task: T, body: () -> Unit): Boolean {
        active.add(task)
        val wrapper = Runnable {
            try {
                body()
            } finally {
                active.remove(task)
            }
        }
        return try {
            pool.execute(wrapper)
            true
        } catch (rejected: RejectedExecutionException) {
            active.remove(task)
            false
        }
    }

    /** Closes every in-flight task through [onClose], then shuts the pool down. */
    @Synchronized fun shutdown(onClose: (T) -> Unit) {
        for (task in active) {
            try {
                onClose(task)
            } catch (_: Throwable) {
            }
        }
        active.clear()
        pool.shutdownNow()
    }

    fun activeCount(): Int = active.size

    fun limit(): Int = limit

    private companion object {
        const val DEFAULT_THREAD_NAME = "lan-mcp-http"
    }
}
