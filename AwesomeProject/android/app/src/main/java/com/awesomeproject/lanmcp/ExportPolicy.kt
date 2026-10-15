package com.awesomeproject.lanmcp

sealed class ExportVerdict {
    object Ok : ExportVerdict()
    data class Rejected(val code: String, val message: String) : ExportVerdict()
}

/**
 * Pure policy for `exportConnectionFile(contents, filename)`.
 *
 * The exported Markdown guide may describe the endpoint and show a placeholder for
 * the Bearer token, but it must never contain the live connection code. Native code
 * enforces that here as a second line of defence (the first being the generator in
 * the app layer): if the supplied contents contain the current code verbatim, the
 * export is refused.
 */
object ExportPolicy {

    const val MAX_CONTENT_CHARS = 256 * 1024
    const val DEFAULT_FILENAME = "lan-mcp-connection-guide.md"
    private const val MAX_BASE_LENGTH = 100

    fun validate(contents: String?, connectionCode: String?): ExportVerdict {
        if (contents == null || contents.isEmpty()) {
            return ExportVerdict.Rejected(Codes.EXPORT_EMPTY, "export contents are empty")
        }
        if (contents.length > MAX_CONTENT_CHARS) {
            return ExportVerdict.Rejected(
                Codes.EXPORT_TOO_LARGE,
                "export contents exceed $MAX_CONTENT_CHARS characters",
            )
        }
        if (!connectionCode.isNullOrEmpty() && contents.contains(connectionCode)) {
            return ExportVerdict.Rejected(
                Codes.EXPORT_CONTAINS_SECRET,
                "export contents contain the live connection code and were refused",
            )
        }
        return ExportVerdict.Ok
    }

    /**
     * Keeps only ASCII letters, digits, dot, hyphen and underscore; spaces become
     * hyphens; path separators and control characters are dropped. The result always
     * ends in `.md` and is never able to escape the directory chosen by the user.
     */
    fun sanitizeFilename(raw: String?): String {
        val input = raw?.trim().orEmpty()
        val builder = StringBuilder(input.length)
        for (ch in input) {
            val ascii = ch.code < 128
            when {
                ascii && (ch in 'a'..'z' || ch in 'A'..'Z' || ch in '0'..'9') -> builder.append(ch)
                ch == '.' || ch == '-' || ch == '_' -> builder.append(ch)
                ch == ' ' -> builder.append('-')
                else -> Unit
            }
        }
        var name = builder.toString().trim('.', '-', '_')
        if (name.isEmpty()) name = DEFAULT_FILENAME.removeSuffix(".md")
        if (name.length > MAX_BASE_LENGTH) name = name.substring(0, MAX_BASE_LENGTH)
        if (!name.lowercase().endsWith(".md")) name = "$name.md"
        return name
    }
}
