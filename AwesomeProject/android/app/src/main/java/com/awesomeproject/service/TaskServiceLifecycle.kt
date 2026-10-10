package com.awesomeproject.service

/** Serializes framework start/stop calls and remembers the latest accepted session,
 * including a start whose onStartCommand has not been delivered yet. */
object TaskServiceLifecycle {
    private var requestedSession: Pair<String, Double>? = null

    @Synchronized
    fun start(taskId: String, revision: Double, startService: () -> Boolean): Boolean {
        if (!startService()) return false
        requestedSession = taskId to revision
        return true
    }

    @Synchronized
    fun stop(taskId: String, revision: Double, stopService: () -> Boolean): Boolean {
        if (requestedSession != (taskId to revision)) return true
        if (!stopService()) return false
        requestedSession = null
        return true
    }
}
