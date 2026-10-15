package com.awesomeproject.lanmcp

import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger

/**
 * Additional pure-JVM coverage for the start/stop generation race fixed by the
 * intent-token change (LanMcpState.beginStart/cancelStart/markRunningIfCurrent).
 *
 * Scope limit: these tests exercise [LanMcpState] and [StopGeneration] only. The
 * Android service lifecycle itself (onStartCommand delivery, stopSelf, pending
 * startService requests) needs Robolectric or a device and is NOT covered here.
 */
class LanMcpStartupRaceTest {

    @After
    fun cleanup() {
        LanMcpState.cancelStart()
        // LanMcpState is a process-wide singleton: reset clears the published address so
        // one test's publication cannot leak into the next.
        LanMcpState.reset(null, "")
    }

    /** Every capture taken before a revoke must be rejected afterwards. */
    @Test
    fun everyPreRevokeCaptureIsRejectedAfterCancel() {
        val stale = (1..4).map { LanMcpState.beginStart() }
        LanMcpState.cancelStart()
        stale.forEachIndexed { index, capture ->
            assertFalse(
                "stale capture #$index must not publish",
                LanMcpState.markRunningIfCurrent(capture, "192.168.1.$index", 8765),
            )
        }
        assertFalse(LanMcpState.running)
        assertFalse(LanMcpState.generation.isRunning())
        assertNull(LanMcpState.bindAddress)
    }

    /**
     * Contract: a stale capture can never publish, while duplicate deliveries carrying the
     * *same* live generation are idempotently accepted (the service's own late delivery of
     * one attempt must not be treated as a conflict).
     */
    @Test
    fun staleCaptureNeverPublishesWhileLiveGenerationIsIdempotent() {
        val stale = LanMcpState.beginStart()
        val fresh = LanMcpState.beginStart()
        val staleAccepted = AtomicInteger()
        val freshAccepted = AtomicInteger()
        val done = CountDownLatch(4)
        val threads = listOf(stale, fresh, stale, fresh).mapIndexed { index, capture ->
            Thread {
                if (LanMcpState.markRunningIfCurrent(capture, "192.168.1.${index + 1}", 8765)) {
                    if (capture == stale) staleAccepted.incrementAndGet() else freshAccepted.incrementAndGet()
                }
                done.countDown()
            }
        }
        threads.forEach { it.start() }
        assertTrue("threads did not finish", done.await(5, java.util.concurrent.TimeUnit.SECONDS))
        threads.forEach { it.join(2000) }
        assertEquals("a stale generation must never publish", 0, staleAccepted.get())
        assertEquals("same live generation must stay idempotent", 2, freshAccepted.get())
        assertTrue(LanMcpState.running)
        assertTrue(LanMcpState.generation.isCurrent(fresh))
        // Only fresh-capture addresses are reachable; index 1 and 3 carry the live capture.
        val published = LanMcpState.bindAddress
        assertTrue(
            "published address must come from a live generation: $published",
            published == "192.168.1.2" || published == "192.168.1.4",
        )
    }

    /**
     * A stop while "binding" (running=false but a start in flight) must not allow a
     * late delivery for the previous attempt to flip the service back to running.
     */
    @Test
    fun cancelBeforeLateDeliveryKeepsRunningFalse() {
        val attempt = LanMcpState.beginStart()
        // An older capture must already be rejected before the revoke.
        assertFalse(LanMcpState.markRunningIfCurrent(attempt - 1, "192.168.1.9", 8765))
        LanMcpState.cancelStart()
        assertFalse(LanMcpState.markRunningIfCurrent(attempt, "192.168.1.9", 8765))
        assertFalse(LanMcpState.running)
        assertFalse(LanMcpState.generation.isCurrent(attempt))
        assertFalse(LanMcpState.generation.isRunning())
        assertNull(LanMcpState.bindAddress)
    }

    /** A cancelled start must not leave a stale published address behind. */
    @Test
    fun cancelledStartLeavesNoPublishedAddress() {
        val published = LanMcpState.beginStart()
        assertTrue(LanMcpState.markRunningIfCurrent(published, "10.0.0.7", 8765))
        assertEquals("10.0.0.7", LanMcpState.bindAddress)
        LanMcpState.cancelStart()
        val snapshot = LanMcpState.snapshot(codeConfigured = true)
        assertEquals(false, snapshot["running"])
        assertNull(snapshot["endpoint"])
    }

    /** The next explicit start after a cancel still gets a strictly newer generation. */
    @Test
    fun restartAfterCancelGetsNewerGeneration() {
        val first = LanMcpState.beginStart()
        LanMcpState.cancelStart()
        val second = LanMcpState.beginStart()
        assertTrue("generation must be monotonic", second > first)
        assertFalse(LanMcpState.markRunningIfCurrent(first, "192.168.1.2", 8765))
        assertTrue(LanMcpState.markRunningIfCurrent(second, "192.168.1.3", 8765))
        assertEquals("192.168.1.3", LanMcpState.bindAddress)
    }
}
