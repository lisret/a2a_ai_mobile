package com.awesomeproject.service

import org.junit.Assert.*
import org.junit.Test

class TaskServiceLifecycleTest {
    @Test fun staleStopCannotStopNewerTask() {
        TaskServiceLifecycle.start("old", 1.0) { true }
        TaskServiceLifecycle.start("new", 2.0) { true }
        var stopped = false
        assertTrue(TaskServiceLifecycle.stop("old", 1.0) { stopped = true; true })
        assertFalse(stopped)
        assertTrue(TaskServiceLifecycle.stop("new", 2.0) { stopped = true; true })
        assertTrue(stopped)
    }

    @Test fun sameTaskDifferentRevisionIsNotTheSameSession() {
        TaskServiceLifecycle.start("task", 2.0) { true }
        assertTrue(TaskServiceLifecycle.stop("task", 1.0) { fail("stale stop"); true })
        assertTrue(TaskServiceLifecycle.stop("task", 2.0) { true })
    }

    @Test fun stopCancelsAcceptedButNotYetDeliveredStart() {
        var pending = false
        TaskServiceLifecycle.start("pending", 3.0) { pending = true; true }
        assertTrue(TaskServiceLifecycle.stop("pending", 3.0) { pending = false; true })
        assertFalse(pending)
        assertTrue(TaskServiceLifecycle.stop("pending", 3.0) { fail("duplicate stop"); true })
    }

    @Test fun failedStartDoesNotReplaceExistingSession() {
        TaskServiceLifecycle.start("active", 4.0) { true }
        assertFalse(TaskServiceLifecycle.start("failed", 5.0) { false })
        assertTrue(TaskServiceLifecycle.stop("failed", 5.0) { fail("unaccepted session"); true })
        var stopped = false
        TaskServiceLifecycle.stop("active", 4.0) { stopped = true; true }
        assertTrue(stopped)
    }
}
