package com.awesomeproject.lanmcp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ToolExecutorTest {

    private val actions = FakeDeviceActions()
    private val serializer = ActionSerializer()
    private val generation = StopGeneration()
    private val base64: (ByteArray) -> String = { bytes -> "b64:" + bytes.size }

    private fun executor(localTaskRunning: Boolean = false): ToolExecutor = ToolExecutor(
        actions = actions,
        serializer = serializer,
        generation = generation,
        base64 = base64,
        localTaskRunning = { localTaskRunning },
    )

    private fun stoppedGeneration(): Long {
        val value = generation.markStarted()
        generation.markStopped()
        return value
    }

    @Test
    fun statusIsAvailableWithoutAccessibility() {
        actions.accessibility = false
        actions.locked = true
        actions.size = intArrayOf(1080, 2400)
        actions.rotation = 90
        val started = generation.markStarted()

        val result = executor().execute(ToolInvocation.PhoneStatus, started)

        assertFalse(result.isError)
        val payload = result.content.single()["text"] as String
        assertTrue(payload.contains("\"accessibilityConnected\":false"))
        assertTrue(payload.contains("\"deviceLocked\":true"))
        assertTrue(payload.contains("\"displayWidth\":1080"))
        assertTrue(payload.contains("\"displayHeight\":2400"))
        assertTrue(payload.contains("\"rotationDegrees\":90"))
        assertTrue(payload.contains("\"reversibleActions\":false"))
    }

    @Test
    fun successfulMutationReportsDispatchedAndNotReversible() {
        val started = generation.markStarted()

        val result = executor().execute(ToolInvocation.Tap(10, 20), started)

        assertFalse(result.isError)
        val payload = result.content.single()["text"] as String
        assertTrue(payload.contains("\"dispatched\":true"))
        assertTrue(payload.contains("\"reversible\":false"))
        assertTrue(payload.contains("\"action\":\"tap\""))
        assertEquals(1, actions.tapCalls)
        assertFalse(serializer.isBusy())
    }

    @Test
    fun failedPlatformDispatchIsAnErrorAndStillNotReversible() {
        actions.tapResult = false
        val started = generation.markStarted()

        val result = executor().execute(ToolInvocation.Tap(10, 20), started)

        assertTrue(result.isError)
        val payload = result.content.single()["text"] as String
        assertTrue(payload.contains("\"dispatched\":false"))
        assertTrue(payload.contains("\"reversible\":false"))
        assertTrue(payload.contains(Codes.ACTION_FAILED))
        assertFalse(serializer.isBusy())
    }

    @Test
    fun swipesAndKeysAndTextAreRoutedToAccessibilityActions() {
        val started = generation.markStarted()
        val target = executor()

        assertFalse(target.execute(ToolInvocation.Swipe(1, 2, 3, 4, 250), started).isError)
        assertFalse(target.execute(ToolInvocation.TypeText("hello"), started).isError)
        assertFalse(target.execute(ToolInvocation.Key("home"), started).isError)

        assertEquals(1, actions.swipeCalls)
        assertEquals(1, actions.typeCalls)
        assertEquals("hello", actions.lastText)
        assertEquals(1, actions.keyCalls)
        assertEquals("home", actions.lastKey)
    }

    @Test
    fun stoppedGenerationRefusesDispatchBeforeTouchingTheDevice() {
        val captured = stoppedGeneration()

        val result = executor().execute(ToolInvocation.Tap(10, 20), captured)

        assertTrue(result.isError)
        assertTrue((result.content.single()["text"] as String).contains(Codes.SERVICE_STOPPED))
        assertEquals("the action must never be dispatched after stop", 0, actions.tapCalls)
    }

    @Test
    fun lockedDeviceIsRefused() {
        actions.locked = true
        val started = generation.markStarted()

        val result = executor().execute(ToolInvocation.Tap(10, 20), started)

        assertTrue(result.isError)
        assertTrue((result.content.single()["text"] as String).contains(Codes.DEVICE_LOCKED))
        assertEquals(0, actions.tapCalls)
    }

    @Test
    fun missingAccessibilityIsRefused() {
        actions.accessibility = false
        val started = generation.markStarted()

        val result = executor().execute(ToolInvocation.Tap(10, 20), started)

        assertTrue(result.isError)
        assertTrue((result.content.single()["text"] as String).contains(Codes.NO_ACCESSIBILITY))
        assertEquals(0, actions.tapCalls)
    }

    @Test
    fun localTaskRunningIsRefused() {
        val started = generation.markStarted()

        val result = executor(localTaskRunning = true).execute(ToolInvocation.Tap(10, 20), started)

        assertTrue(result.isError)
        assertTrue((result.content.single()["text"] as String).contains(Codes.TASK_RUNNING))
        assertEquals(0, actions.tapCalls)
    }

    @Test
    fun concurrentActionIsRefusedAndNeverQueued() {
        val started = generation.markStarted()
        assertTrue(serializer.tryAcquire())

        val result = executor().execute(ToolInvocation.Tap(10, 20), started)

        assertTrue(result.isError)
        assertTrue((result.content.single()["text"] as String).contains(Codes.TASK_RUNNING))
        assertEquals(0, actions.tapCalls)
        serializer.release()
    }

    @Test
    fun coordinatesOutsideTheDisplayAreRefused() {
        actions.size = intArrayOf(1080, 2400)
        val started = generation.markStarted()
        val target = executor()

        val tooFarRight = target.execute(ToolInvocation.Tap(1080, 10), started)
        val tooFarDown = target.execute(ToolInvocation.Tap(10, 2400), started)
        val inside = target.execute(ToolInvocation.Tap(1079, 2399), started)

        assertTrue((tooFarRight.content.single()["text"] as String).contains(Codes.OUT_OF_BOUNDS))
        assertTrue((tooFarDown.content.single()["text"] as String).contains(Codes.OUT_OF_BOUNDS))
        assertFalse(inside.isError)
        assertEquals("only the in-bounds tap may dispatch", 1, actions.tapCalls)
    }

    @Test
    fun unknownDisplaySizeRefusesMovement() {
        actions.size = null
        val started = generation.markStarted()

        val result = executor().execute(ToolInvocation.Tap(10, 20), started)

        assertTrue(result.isError)
        assertTrue((result.content.single()["text"] as String).contains(Codes.DISPLAY_UNKNOWN))
    }

    @Test
    fun screenshotReturnsTextMetadataPlusAnMcpImageBlock() {
        actions.screen = CapturedScreen(byteArrayOf(9, 9, 9, 9), 720, 1280)
        val started = generation.markStarted()

        val result = executor().execute(ToolInvocation.PhoneScreenshot, started)

        assertFalse(result.isError)
        assertEquals(2, result.content.size)
        val meta = result.content[0]["text"] as String
        assertTrue(meta.contains("\"width\":720"))
        assertTrue(meta.contains("\"height\":1280"))
        assertEquals("text", result.content[0]["type"])
        assertEquals("image", result.content[1]["type"])
        assertEquals("image/png", result.content[1]["mimeType"])
        assertEquals("b64:4", result.content[1]["data"])
        assertEquals(1, actions.captureCalls)
    }

    @Test
    fun screenshotFailureAndMissingAccessibilityAreReported() {
        val started = generation.markStarted()
        actions.screen = null
        assertTrue((executor().execute(ToolInvocation.PhoneScreenshot, started).content.single()["text"] as String).contains(Codes.SCREENSHOT_FAILED))

        actions.screen = CapturedScreen(byteArrayOf(1), 10, 10)
        actions.accessibility = false
        assertTrue((executor().execute(ToolInvocation.PhoneScreenshot, started).content.single()["text"] as String).contains(Codes.NO_ACCESSIBILITY))
    }

    @Test
    fun screenshotAfterStopIsRefused() {
        val captured = stoppedGeneration()

        val result = executor().execute(ToolInvocation.PhoneScreenshot, captured)

        assertTrue(result.isError)
        assertTrue((result.content.single()["text"] as String).contains(Codes.SERVICE_STOPPED))
        assertEquals(0, actions.captureCalls)
    }

    @Test
    fun serializerSlotIsAlwaysReleasedEvenWhenTheActionThrows() {
        val started = generation.markStarted()
        val throwing = object : DeviceActions by actions {
            override fun tap(x: Int, y: Int): Boolean = throw IllegalStateException("boom")
        }
        val target = ToolExecutor(
            actions = throwing,
            serializer = serializer,
            generation = generation,
            base64 = base64,
            localTaskRunning = { false },
        )

        val result = target.execute(ToolInvocation.Tap(1, 2), started)

        assertTrue(result.isError)
        assertFalse(serializer.isBusy())
    }
}
