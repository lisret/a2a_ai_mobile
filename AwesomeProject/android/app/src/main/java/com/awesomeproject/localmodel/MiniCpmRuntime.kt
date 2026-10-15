package com.awesomeproject.localmodel

const val SELF_TEST_TIMEOUT_MS = 15_000L

class SelfTestFixture(
    val version: String,
    val prompt: String,
    imageBytes: ByteArray,
    val expectedToken: String,
    val schemaMarker: String,
) {
    private val fixtureImageBytes: ByteArray = imageBytes.copyOf()
    val imageBytes: ByteArray
        get() = fixtureImageBytes.copyOf()

    init {
        require(version.isNotBlank()) { "Self-test fixture version is required" }
        require(prompt.isNotBlank()) { "Self-test prompt is required" }
        require(fixtureImageBytes.isNotEmpty()) { "Self-test image is required" }
        require(expectedToken.isNotBlank()) { "Self-test token is required" }
        require(schemaMarker.isNotBlank()) { "Self-test schema marker is required" }
    }

    fun request(): LocalVisionRequest = LocalVisionRequest(prompt, fixtureImageBytes.copyOf())
}

val DEFAULT_SELF_TEST_FIXTURE = SelfTestFixture(
    version = "phase1-v1",
    prompt = "MiniCPM visual self-test phase1-v1: return the fixed token and schema marker.",
    imageBytes = byteArrayOf(
        0x89.toByte(), 0x50.toByte(), 0x4e.toByte(), 0x47.toByte(), 0x0d.toByte(), 0x0a.toByte(),
        0x1a.toByte(), 0x0a.toByte(), 0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x0d.toByte(),
        0x49.toByte(), 0x48.toByte(), 0x44.toByte(), 0x52.toByte(), 0x00.toByte(), 0x00.toByte(),
        0x00.toByte(), 0x01.toByte(), 0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x01.toByte(),
        0x08.toByte(), 0x04.toByte(), 0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0xb5.toByte(),
        0x1c.toByte(), 0x0c.toByte(), 0x02.toByte(), 0x00.toByte(), 0x00.toByte(), 0x00.toByte(),
        0x0b.toByte(), 0x49.toByte(), 0x44.toByte(), 0x41.toByte(), 0x54.toByte(), 0x78.toByte(),
        0xda.toByte(), 0x63.toByte(), 0x64.toByte(), 0xf8.toByte(), 0x0f.toByte(), 0x00.toByte(),
        0x01.toByte(), 0x05.toByte(), 0x01.toByte(), 0x01.toByte(), 0x27.toByte(), 0x18.toByte(),
        0xe3.toByte(), 0x66.toByte(), 0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x00.toByte(),
        0x49.toByte(), 0x45.toByte(), 0x4e.toByte(), 0x44.toByte(), 0xae.toByte(), 0x42.toByte(),
        0x60.toByte(), 0x82.toByte(),
    ),
    expectedToken = "MINICPM_SELF_TEST_OK",
    schemaMarker = "minicpm-self-test-v1",
)
