package com.awesomeproject.lanmcp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression tests for the capture/action safety rules: locked-device refusal, one shared
 * device slot for captures and gestures, local-task exclusion, and never echoing the text
 * a client asked to type.
 */
class ToolExecutorSafetyTest {

    private val actions = FakeDeviceActions()
    private val serializer = ActionSerializer()
    private val generation = StopGeneration()

    private fun executor(localTaskRunning: Boolean = false): ToolExecutor = ToolExecutor(
        actions = actions,
        serializer = serializer,
        generation = generation,
        base64 = { bytes -> "b64:" + bytes.size },
        localTaskRunning = { localTaskRunning },
    )

    @Test
    fun screenshotIsRefusedWhileTheDeviceIsLocked() {
        actions.locked = true
        val started = generation.markStarted()

        val result = executor().execute(ToolInvocation.PhoneScreenshot, started)

        assertTrue(result.isError)
        assertTrue(payload(result).contains(Codes.DEVICE_LOCKED))
        assertEquals("no frame may be captured while locked", 0, actions.captureCalls)
    }

    @Test
    fun mutatingActionsAreRefusedWhileTheDeviceIsLocked() {
        actions.locked = true
        val started = generation.markStarted()

        val result = executor().execute(ToolInvocation.Tap(10, 20), started)

        assertTrue(result.isError)
        assertTrue(payload(result).contains(Codes.DEVICE_LOCKED))
        assertEquals(0, actions.tapCalls)
    }

    @Test
    fun screenshotIsRefusedWhileAnotherCaptureOrActionHoldsTheSlot() {
        val started = generation.markStarted()
        assertTrue(serializer.tryAcquire())

        val result = executor().execute(ToolInvocation.PhoneScreenshot, started)

        assertTrue(result.isError)
        assertTrue(payload(result).contains(Codes.TASK_RUNNING))
        assertEquals("captures must not stack while a slot is held", 0, actions.captureCalls)
        serializer.release()
    }

    @Test
    fun aMutatingActionIsRefusedWhileACaptureHoldsTheSlot() {
        val started = generation.markStarted()
        assertTrue(serializer.tryAcquire())

        val result = executor().execute(ToolInvocation.Tap(10, 20), started)

        assertTrue(result.isError)
        assertTrue(payload(result).contains(Codes.TASK_RUNNING))
        assertEquals(0, actions.tapCalls)
        serializer.release()
    }

    @Test
    fun twoSequentialCapturesBothSucceedAndReleaseTheSlot() {
        val started = generation.markStarted()

        assertFalse(executor().execute(ToolInvocation.PhoneScreenshot, started).isError)
        assertFalse(executor().execute(ToolInvocation.PhoneScreenshot, started).isError)

        assertEquals(2, actions.captureCalls)
        assertFalse("the shared slot must be released after every capture", serializer.isBusy())
    }

    @Test
    fun screenshotIsRefusedWhileALocalTaskRuns() {
        val started = generation.markStarted()

        val result = executor(localTaskRunning = true).execute(ToolInvocation.PhoneScreenshot, started)

        assertTrue(result.isError)
        assertTrue(payload(result).contains(Codes.TASK_RUNNING))
        assertEquals(0, actions.captureCalls)
    }

    @Test
    fun statusStaysAvailableAndReportsTheLocalTaskFlag() {
        generation.markStarted()

        val idle = executor(localTaskRunning = false).execute(ToolInvocation.PhoneStatus, 0L)
        val busy = executor(localTaskRunning = true).execute(ToolInvocation.PhoneStatus, 0L)

        assertFalse(idle.isError)
        assertTrue(payload(idle).contains("\"localTaskRunning\":false"))
        assertTrue(payload(busy).contains("\"localTaskRunning\":true"))
    }

    @Test
    fun typedTextNeverAppearsInASuccessPayloadOnlyItsLength() {
        val started = generation.markStarted()
        val plaintext = "hunter2-plaintext-value"

        val result = executor().execute(ToolInvocation.TypeText(plaintext), started)

        assertFalse(result.isError)
        assertFalse("the typed text must never be echoed back", payload(result).contains(plaintext))
        assertTrue(payload(result).contains("\"characters\":${plaintext.length}"))
    }

    @Test
    fun aFailedTextInputAlsoDoesNotEchoTheText() {
        actions.typeResult = false
        val started = generation.markStarted()
        val plaintext = "hunter2-plaintext-value"

        val result = executor().execute(ToolInvocation.TypeText(plaintext), started)

        assertTrue(result.isError)
        assertFalse(payload(result).contains(plaintext))
        assertTrue(payload(result).contains(Codes.ACTION_FAILED))
    }

    @Test
    fun aStopLandingDuringDispatchIsReportedHonestlyAndBlocksEverythingAfterIt() {
        // The stop lands while the gesture is already being handed to the platform.
        actions.onTap = { generation.markStopped(0) }
        val started = generation.markStarted()

        val dispatched = executor().execute(ToolInvocation.Tap(10, 20), started)

        assertFalse("an already-dispatched gesture must not be misreported as revoked", dispatched.isError)
        assertTrue(payload(dispatched).contains("\"dispatched\":true"))
        assertTrue(payload(dispatched).contains("\"reversible\":false"))
        assertFalse(serializer.isBusy())

        val afterwards = executor().execute(ToolInvocation.Tap(10, 20), started)
        assertTrue(afterwards.isError)
        assertTrue(payload(afterwards).contains(Codes.SERVICE_STOPPED))
        assertEquals("only the first tap may reach the device", 1, actions.tapCalls)
    }

    @Test
    fun aStopDuringCaptureDiscardsTheFrame() {
        actions.onCapture = { generation.markStopped(0) }
        val started = generation.markStarted()

        val result = executor().execute(ToolInvocation.PhoneScreenshot, started)

        assertTrue("a frame captured after revocation is not usable", result.isError)
        assertTrue(payload(result).contains(Codes.SERVICE_STOPPED))
        assertFalse(serializer.isBusy())
    }

    private fun payload(result: ToolResult): String = result.content.single()["text"] as String
}
