package com.awesomeproject.lanmcp

import java.util.Locale

/** Result of parsing a `Content-Length` request header. */
sealed class ContentLength {
    object Absent : ContentLength()
    object Invalid : ContentLength()
    data class Declared(val value: Long) : ContentLength()
}

/**
 * Pure HTTP request policy for the LAN MCP endpoint: origin rejection, Host pinning,
 * media types and the bounded body size. Kept free of Android and NanoHTTPD types so
 * every rule is unit-testable on a plain JVM.
 */
object HttpGate {

    /** Hard request-body cap (64 KiB). Larger bodies are refused, never buffered. */
    const val MAX_BODY_BYTES = 64 * 1024

    const val MCP_PATH = "/mcp"

    /**
     * The MCP spec has clients send an `Origin` header only from browsers. A LAN
     * control endpoint never serves browsers, so ANY Origin value is refused
     * (this also defeats DNS-rebinding style browser access). No CORS headers are
     * ever emitted.
     */
    fun originRejected(originHeader: String?): Boolean = originHeader != null

    /**
     * The `Host` header must be exactly the address:port the service is bound to.
     * A different host or port is refused, which blocks requests addressed through a
     * name or port that the service never advertised.
     */
    fun hostMatches(hostHeader: String?, bindAddress: String, port: Int): Boolean {
        val raw = hostHeader?.trim() ?: return false
        if (raw.isEmpty()) return false
        return raw.equals("$bindAddress:$port", ignoreCase = true)
    }

    fun pathMatches(path: String?): Boolean = path == MCP_PATH

    fun mediaType(header: String?): String? {
        val raw = header ?: return null
        val type = raw.substringBefore(';').trim().lowercase(Locale.US)
        return type.ifEmpty { null }
    }

    /**
     * A declared non-JSON content type is refused (415). An absent content type is
     * tolerated as JSON for minimal clients; that tolerance is intentional and
     * documented, not an accident.
     */
    fun contentTypeIsJson(header: String?): Boolean {
        val type = mediaType(header) ?: return true
        return type == "application/json"
    }

    fun acceptAllowsJson(header: String?): Boolean {
        if (header.isNullOrBlank()) return true
        for (part in header.split(',')) {
            val type = mediaType(part) ?: continue
            if (type == "*/*" || type == "application/*" || type == "application/json") return true
        }
        return false
    }

    /** Only identity (or absent) transfer encoding is supported; chunked is refused. */
    fun transferEncodingSupported(header: String?): Boolean {
        if (header == null) return true
        val value = header.trim().lowercase(Locale.US)
        return value.isEmpty() || value == "identity"
    }

    fun parseContentLength(header: String?): ContentLength {
        val raw = header ?: return ContentLength.Absent
        val value = raw.trim()
        if (value.isEmpty()) return ContentLength.Invalid
        if (value.length > 18) return ContentLength.Invalid
        for (ch in value) {
            if (ch !in '0'..'9') return ContentLength.Invalid
        }
        return ContentLength.Declared(value.toLong())
    }
}
