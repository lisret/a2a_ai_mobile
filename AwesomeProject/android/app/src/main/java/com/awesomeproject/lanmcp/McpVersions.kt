package com.awesomeproject.lanmcp

/**
 * MCP protocol revisions this server speaks.
 *
 * Only revisions whose transport this server actually implements are claimed: the
 * Streamable-HTTP revisions 2025-11-25, 2025-06-18 and 2025-03-26. The pre-Streamable
 * 2024-11-05 revision is deliberately NOT claimed, because its transport differs.
 *
 * `initialize` never fails on a version mismatch: an unsupported (including newer)
 * requested revision is negotiated down to [PINNED], as the MCP lifecycle requires the
 * server to answer with a revision it supports.
 */
object McpVersions {

    const val PINNED = "2025-11-25"

    val SUPPORTED: List<String> = listOf(
        "2025-11-25",
        "2025-06-18",
        "2025-03-26",
    )

    fun isSupported(version: String?): Boolean = version != null && SUPPORTED.contains(version)

    /**
     * Revision the server will speak for [requested]. A supported revision is echoed
     * unchanged; anything else (newer or older) negotiates to [PINNED]. Returns [PINNED]
     * when the client sent none.
     */
    fun negotiate(requested: String?): String {
        if (requested == null) return PINNED
        return if (SUPPORTED.contains(requested)) requested else PINNED
    }
}
