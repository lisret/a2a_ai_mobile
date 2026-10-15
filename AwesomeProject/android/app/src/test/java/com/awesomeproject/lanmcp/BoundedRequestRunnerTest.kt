package com.awesomeproject.lanmcp

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression tests for the socket-level bound that the router gate cannot provide:
 * NanoHTTPD's default runner spawns a thread per accepted socket before any request-level
 * limit applies.
 */
class BoundedRequestRunnerTest {

    @Test
    fun admitsAtMostTheLimitAndRejectsTheRestWithoutQueueing() {
        val runner = BoundedRequestRunner<String>(2, "test-http")
        val release = CountDownLatch(1)
        val started = CountDownLatch(2)

        assertTrue(runner.submit("a") { started.countDown(); release.await(5, TimeUnit.SECONDS) })
        assertTrue(runner.submit("b") { started.countDown(); release.await(5, TimeUnit.SECONDS) })
        assertTrue(started.await(5, TimeUnit.SECONDS))

        // Third and fourth hand-offs must be refused immediately, not parked.
        assertFalse(runner.submit("c") {})
        assertFalse(runner.submit("d") {})
        assertEquals(2, runner.activeCount())
        assertEquals(2, runner.limit())

        release.countDown()
        waitUntilIdle(runner)
        // Once the slots are free the runner admits work again, proving nothing was queued.
        val ran = AtomicInteger(0)
        assertTrue(runner.submit("e") { ran.incrementAndGet() })
        waitUntil { ran.get() == 1 }
        waitUntilIdle(runner)
        runner.shutdown { }
    }

    @Test
    fun shutdownClosesEveryInFlightTaskAndStopsAccepting() {
        val runner = BoundedRequestRunner<String>(2, "test-http")
        val release = CountDownLatch(1)
        val started = CountDownLatch(2)
        val closed = ArrayList<String>()

        assertTrue(runner.submit("a") { started.countDown(); release.await(5, TimeUnit.SECONDS) })
        assertTrue(runner.submit("b") { started.countDown(); release.await(5, TimeUnit.SECONDS) })
        assertTrue(started.await(5, TimeUnit.SECONDS))

        runner.shutdown { closed.add(it) }
        release.countDown()

        assertTrue("in-flight tasks must be closed", closed.contains("a") && closed.contains("b"))
        assertEquals(0, runner.activeCount())
        assertFalse("a shut-down runner must not accept more work", runner.submit("c") {})
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsANonPositiveLimit() {
        BoundedRequestRunner<String>(0)
    }

    private fun waitUntilIdle(runner: BoundedRequestRunner<String>) {
        waitUntil { runner.activeCount() == 0 }
    }

    private fun waitUntil(condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + 5000
        while (System.currentTimeMillis() < deadline) {
            if (condition()) return
            Thread.sleep(10)
        }
        assertTrue("condition was not reached in time", condition())
    }
}
