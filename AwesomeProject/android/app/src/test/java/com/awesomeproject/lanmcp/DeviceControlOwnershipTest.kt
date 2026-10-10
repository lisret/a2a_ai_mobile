package com.awesomeproject.lanmcp

import org.junit.Assert.*
import org.junit.After
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger

class DeviceControlOwnershipTest {
    @After fun reset() {
        DeviceControlOwnership.releaseLocal("task-a")
        DeviceControlOwnership.releaseLocal("task-b")
        DeviceControlOwnership.releaseRemote()
    }

    @Test fun staleLocalCompletionCannotReleaseAnotherTask() {
        assertTrue(DeviceControlOwnership.acquireLocal("task-a"))
        DeviceControlOwnership.releaseLocal("task-a")
        assertTrue(DeviceControlOwnership.acquireLocal("task-b"))
        DeviceControlOwnership.releaseLocal("task-a")
        assertFalse(DeviceControlOwnership.acquireRemote())
    }

    @Test fun concurrentLocalAndRemoteStartHaveExactlyOneWinner() {
        val ready = CountDownLatch(2)
        val go = CountDownLatch(1)
        val wins = AtomicInteger()
        val local = Thread { ready.countDown(); go.await(); if (DeviceControlOwnership.acquireLocal("task-a")) wins.incrementAndGet() }
        val remote = Thread { ready.countDown(); go.await(); if (DeviceControlOwnership.acquireRemote()) wins.incrementAndGet() }
        local.start(); remote.start(); ready.await(); go.countDown()
        local.join(2000); remote.join(2000)
        assertEquals(1, wins.get())
    }
}
