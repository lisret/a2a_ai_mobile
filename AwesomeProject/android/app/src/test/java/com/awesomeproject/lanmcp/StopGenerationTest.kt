package com.awesomeproject.lanmcp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class StopGenerationTest {

    @Test
    fun isNotRunningBeforeAnyStart() {
        val generation = StopGeneration()
        assertFalse(generation.isRunning())
        assertFalse(generation.isCurrent(generation.current()))
        assertFalse(generation.isCurrent(0L))
    }

    @Test
    fun startEnablesExactlyTheCapturedGeneration() {
        val generation = StopGeneration()
        val started = generation.markStarted()
        assertTrue(generation.isRunning())
        assertTrue(generation.isCurrent(started))
        assertFalse(generation.isCurrent(started + 1))
    }

    @Test
    fun eachStartAdvancesTheGeneration() {
        val generation = StopGeneration()
        val first = generation.markStarted()
        val second = generation.markStarted()
        assertNotEquals(first, second)
        assertFalse("an older generation must not dispatch", generation.isCurrent(first))
        assertTrue(generation.isCurrent(second))
    }

    @Test
    fun stopInvalidatesEveryPreviouslyCapturedGeneration() {
        val generation = StopGeneration()
        val started = generation.markStarted()
        generation.markStopped()
        assertFalse(generation.isRunning())
        assertFalse(generation.isCurrent(started))
    }

    @Test
    fun restartRequiresAnExplicitStartAndInvalidatesOlderRequests() {
        val generation = StopGeneration()
        val first = generation.markStarted()
        generation.markStopped()
        val second = generation.markStarted()
        assertTrue(generation.isCurrent(second))
        assertFalse(generation.isCurrent(first))
    }
}

class ActionSerializerTest {

    @Test
    fun admitsOneActionAtATimeAndNeverQueues() {
        val serializer = ActionSerializer()
        assertFalse(serializer.isBusy())
        assertTrue(serializer.tryAcquire())
        assertTrue(serializer.isBusy())
        assertFalse("a second action must be refused, not queued", serializer.tryAcquire())
        assertFalse(serializer.tryAcquire())
        serializer.release()
        assertFalse(serializer.isBusy())
        assertTrue(serializer.tryAcquire())
    }
}

class ConcurrencyGateTest {

    @Test
    fun rejectsBeyondTheLimitInsteadOfQueueing() {
        val gate = ConcurrencyGate(2)
        assertEquals(2, gate.limit())
        assertTrue(gate.tryAcquire())
        assertTrue(gate.tryAcquire())
        assertEquals(2, gate.inFlight())
        assertFalse(gate.tryAcquire())
        gate.release()
        assertTrue(gate.tryAcquire())
        assertEquals(2, gate.inFlight())
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsNonPositiveLimit() {
        ConcurrencyGate(0)
    }
}

class LanMcpLocalTaskTest {

    @Test
    fun tracksTheLocalTaskFlag() {
        LanMcpLocalTask.setRunning(true)
        assertTrue(LanMcpLocalTask.isRunning())
        LanMcpLocalTask.setRunning(false)
        assertFalse(LanMcpLocalTask.isRunning())
    }
}
