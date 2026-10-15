package com.awesomeproject.lanmcp

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression tests for the race the plain `isCurrent` check could not close: a stop landing
 * between the generation check and the platform dispatch, and a stop returning while a
 * posted gesture is still running.
 */
class DispatchBoundaryTest {

    @Test
    fun stopWithAFreeBoundaryReportsSuccessAndRevokes() {
        val generation = StopGeneration()
        val started = generation.markStarted()

        assertTrue(generation.markStopped(100))

        assertFalse(generation.isRunning())
        assertFalse(generation.isCurrent(started))
        assertFalse(generation.isDispatching())
    }

    @Test
    fun runIfCurrentRefusesEverythingAfterAStop() {
        val generation = StopGeneration()
        val started = generation.markStarted()
        generation.markStopped(100)
        val bodyRan = AtomicBoolean(false)

        val result = generation.runIfCurrent(
            captured = started,
            refused = { "refused" },
            body = {
                bodyRan.set(true)
                "ran"
            },
        )

        assertEquals("refused", result)
        assertFalse("a revoked generation must never reach the body", bodyRan.get())
    }

    @Test
    fun runIfCurrentRunsTheBodyWhileTheGenerationIsCurrent() {
        val generation = StopGeneration()
        val started = generation.markStarted()

        assertEquals("ran", generation.runIfCurrent(started, { "refused" }, { "ran" }))
    }

    @Test
    fun stopWaitsAtTheBoundaryInsteadOfReturningWhileAGestureIsPosted() {
        val generation = StopGeneration()
        val started = generation.markStarted()
        val insideBoundary = CountDownLatch(1)
        val allowExit = CountDownLatch(1)
        val stopReturned = AtomicBoolean(false)

        val dispatcher = Thread {
            generation.runIfCurrent(started, { }) {
                insideBoundary.countDown()
                allowExit.await(5, TimeUnit.SECONDS)
            }
        }
        dispatcher.start()
        assertTrue(insideBoundary.await(5, TimeUnit.SECONDS))

        val stopper = Thread {
            generation.markStopped(5000)
            stopReturned.set(true)
        }
        stopper.start()
        Thread.sleep(150)
        assertFalse("stop must not return while a dispatch is in flight", stopReturned.get())

        allowExit.countDown()
        dispatcher.join(5000)
        stopper.join(5000)
        assertTrue(stopReturned.get())
        assertFalse(generation.isDispatching())
    }

    @Test
    fun anExpiredStopWaitStillRevokesEveryFutureDispatch() {
        val generation = StopGeneration()
        val started = generation.markStarted()
        val insideBoundary = CountDownLatch(1)
        val allowExit = CountDownLatch(1)
        val dispatcher = Thread {
            generation.runIfCurrent(started, { }) {
                insideBoundary.countDown()
                allowExit.await(5, TimeUnit.SECONDS)
            }
        }
        dispatcher.start()
        assertTrue(insideBoundary.await(5, TimeUnit.SECONDS))

        // A long gesture outlives the bounded wait: the boundary is reported as taken...
        assertFalse(generation.markStopped(50))
        assertFalse(generation.isRunning())
        allowExit.countDown()
        dispatcher.join(5000)

        // ...but revocation still happened, so no later dispatch can start.
        val lateRan = AtomicBoolean(false)
        generation.runIfCurrent(started, { "refused" }) {
            lateRan.set(true)
            "ran"
        }
        assertFalse(lateRan.get())

    }

    @Test
    fun aDispatcherQueuedAtTheBoundaryIsRefusedOnceStopReturns() {
        val generation = StopGeneration()
        val started = generation.markStarted()
        val insideBoundary = CountDownLatch(1)
        val allowExit = CountDownLatch(1)
        val ranAfterStop = AtomicBoolean(false)
        val refusedAfterStop = AtomicBoolean(false)

        val holder = Thread {
            generation.runIfCurrent(started, { }) {
                insideBoundary.countDown()
                allowExit.await(5, TimeUnit.SECONDS)
            }
        }
        holder.start()
        assertTrue(insideBoundary.await(5, TimeUnit.SECONDS))

        val waiter = Thread {
            generation.runIfCurrent(started, { refusedAfterStop.set(true) }) {
                ranAfterStop.set(true)
            }
        }
        waiter.start()
        Thread.sleep(100)
        assertFalse(ranAfterStop.get())

        // Revoke synchronously before releasing the holder; starting a thread alone
        // does not guarantee markStopped has run before the waiter is unblocked.
        assertFalse(generation.markStopped())
        allowExit.countDown()
        holder.join(5000)
        waiter.join(5000)

        assertTrue("the queued dispatcher must be refused", refusedAfterStop.get())
        assertFalse("nothing may be dispatched after stop returned", ranAfterStop.get())
    }

    @Test
    fun restartRequiresAnExplicitStartAndRejectsStaleGenerations() {
        val generation = StopGeneration()
        val first = generation.markStarted()
        generation.markStopped(100)
        val second = generation.markStarted()

        assertTrue(generation.isCurrent(second))
        assertFalse(generation.isCurrent(first))
        assertEquals("refused", generation.runIfCurrent(first, { "refused" }, { "ran" }))
        assertEquals("ran", generation.runIfCurrent(second, { "refused" }, { "ran" }))
    }
}
