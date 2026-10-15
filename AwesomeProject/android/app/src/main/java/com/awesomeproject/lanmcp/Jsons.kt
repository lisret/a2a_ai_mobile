package com.awesomeproject.lanmcp

/**
 * Dependency-free JSON encoder/decoder for the LAN MCP protocol core.
 *
 * Why hand-written instead of `org.json`: the protocol core must be unit-testable
 * on a plain JVM (`src/test`) without the Android framework, and `org.json` is only
 * provided by `android.jar` (its methods are stubs in local unit tests). This
 * decoder is strict RFC 8259 with an explicit depth cap; it is NOT an HTTP parser.
 *
 * Value mapping:
 *   object -> LinkedHashMap<String, Any?>   array -> List<Any?>
 *   string -> String                        true/false -> Boolean
 *   integral number -> Long                 fractional/exponent number -> Double
 *   null -> null
 */
class JsonException(message: String) : RuntimeException(message)

object Jsons {

    /** Guard against stack exhaustion on hostile nesting. */
    const val MAX_DEPTH = 64

    const val MAX_INPUT_CHARS = 64 * 1024

    fun obj(): LinkedHashMap<String, Any?> = LinkedHashMap()

    fun obj(vararg pairs: Pair<String, Any?>): LinkedHashMap<String, Any?> {
        val map = LinkedHashMap<String, Any?>(pairs.size * 2)
        for ((key, value) in pairs) {
            map[key] = value
        }
        return map
    }

    fun arr(vararg values: Any?): List<Any?> = values.toList()

    fun asMap(value: Any?): Map<String, Any?>? {
        if (value !is Map<*, *>) return null
        val result = LinkedHashMap<String, Any?>(value.size * 2)
        for ((key, item) in value) {
            if (key !is String) return null
            result[key] = item
        }
        return result
    }

    fun write(value: Any?): String {
        val builder = StringBuilder(256)
        writeValue(builder, value, 0)
        return builder.toString()
    }

    fun writeBytes(value: Any?): ByteArray = write(value).toByteArray(Charsets.UTF_8)

    fun parse(text: String): Any? {
        if (text.length > MAX_INPUT_CHARS) {
            throw JsonException("json input exceeds $MAX_INPUT_CHARS characters")
        }
        val parser = Parser(text)
        parser.skipWhitespace()
        if (parser.atEnd()) throw JsonException("empty json input")
        val value = parser.readValue(0)
        parser.skipWhitespace()
        if (!parser.atEnd()) throw JsonException("trailing content after json value at ${parser.position()}")
        return value
    }

    private fun writeValue(builder: StringBuilder, value: Any?, depth: Int) {
        if (depth > MAX_DEPTH) throw JsonException("json depth limit exceeded")
        when (value) {
            null -> builder.append("null")
            is String -> writeString(builder, value)
            is Boolean -> builder.append(if (value) "true" else "false")
            is Int -> builder.append(value.toString())
            is Long -> builder.append(value.toString())
            is Double -> builder.append(formatDouble(value))
            is Float -> builder.append(formatDouble(value.toDouble()))
            is Map<*, *> -> {
                builder.append('{')
                var first = true
                for ((key, item) in value) {
                    if (key !is String) throw JsonException("json object keys must be strings")
                    if (!first) builder.append(',')
                    first = false
                    writeString(builder, key)
                    builder.append(':')
                    writeValue(builder, item, depth + 1)
                }
                builder.append('}')
            }
            is Iterable<*> -> {
                builder.append('[')
                var first = true
                for (item in value) {
                    if (!first) builder.append(',')
                    first = false
                    writeValue(builder, item, depth + 1)
                }
                builder.append(']')
            }
            is Array<*> -> writeValue(builder, value.toList(), depth)
            else -> throw JsonException("unsupported json type: ${value::class.java.name}")
        }
    }

    private fun formatDouble(value: Double): String {
        if (value.isNaN() || value.isInfinite()) throw JsonException("non-finite number is not valid json")
        if (value == Math.floor(value) && Math.abs(value) < 1e15) {
            return value.toLong().toString()
        }
        return value.toString()
    }

    private fun writeString(builder: StringBuilder, value: String) {
        builder.append('"')
        for (ch in value) {
            when (ch) {
                '"' -> builder.append("\\\"")
                '\\' -> builder.append("\\\\")
                '\n' -> builder.append("\\n")
                '\r' -> builder.append("\\r")
                '\t' -> builder.append("\\t")
                '\b' -> builder.append("\\b")
                '\u000C' -> builder.append("\\f")
                else -> {
                    if (ch < ' ') {
                        builder.append("\\u")
                        val hex = ch.code.toString(16)
                        repeat(4 - hex.length) { builder.append('0') }
                        builder.append(hex)
                    } else {
                        builder.append(ch)
                    }
                }
            }
        }
        builder.append('"')
    }

    private val NUMBER_PATTERN = Regex("^-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?$")

    private class Parser(private val text: String) {
        private var index = 0

        fun atEnd(): Boolean = index >= text.length

        fun position(): Int = index

        fun skipWhitespace() {
            while (index < text.length) {
                val ch = text[index]
                if (ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r') index++ else return
            }
        }

        fun readValue(depth: Int): Any? {
            if (depth > MAX_DEPTH) throw JsonException("json depth limit exceeded")
            skipWhitespace()
            if (atEnd()) throw JsonException("unexpected end of json input")
            return when (val ch = text[index]) {
                '{' -> readObject(depth)
                '[' -> readArray(depth)
                '"' -> readString()
                't' -> {
                    expectLiteral("true")
                    true
                }
                'f' -> {
                    expectLiteral("false")
                    false
                }
                'n' -> {
                    expectLiteral("null")
                    null
                }
                else -> {
                    if (ch == '-' || ch in '0'..'9') readNumber() else throw JsonException("unexpected character '$ch' at $index")
                }
            }
        }

        private fun readObject(depth: Int): Map<String, Any?> {
            index++ // '{'
            val result = LinkedHashMap<String, Any?>()
            skipWhitespace()
            if (!atEnd() && text[index] == '}') {
                index++
                return result
            }
            while (true) {
                skipWhitespace()
                if (atEnd()) throw JsonException("unterminated json object at $index")
                if (text[index] != '"') throw JsonException("expected json object key at $index")
                val key = readString()
                skipWhitespace()
                if (atEnd() || text[index] != ':') throw JsonException("expected ':' after json object key at $index")
                index++
                result[key] = readValue(depth + 1)
                skipWhitespace()
                if (atEnd()) throw JsonException("unterminated json object at $index")
                when (text[index]) {
                    ',' -> index++
                    '}' -> {
                        index++
                        return result
                    }
                    else -> throw JsonException("expected ',' or '}' at $index")
                }
            }
        }

        private fun readArray(depth: Int): List<Any?> {
            index++ // '['
            val result = ArrayList<Any?>()
            skipWhitespace()
            if (!atEnd() && text[index] == ']') {
                index++
                return result
            }
            while (true) {
                result.add(readValue(depth + 1))
                skipWhitespace()
                if (atEnd()) throw JsonException("unterminated json array at $index")
                when (text[index]) {
                    ',' -> index++
                    ']' -> {
                        index++
                        return result
                    }
                    else -> throw JsonException("expected ',' or ']' at $index")
                }
            }
        }

        private fun readString(): String {
            index++ // opening quote
            val builder = StringBuilder()
            while (true) {
                if (atEnd()) throw JsonException("unterminated json string at $index")
                val ch = text[index]
                when {
                    ch == '"' -> {
                        index++
                        return builder.toString()
                    }
                    ch == '\\' -> {
                        index++
                        if (atEnd()) throw JsonException("unterminated json escape at $index")
                        when (val escape = text[index]) {
                            '"' -> builder.append('"')
                            '\\' -> builder.append('\\')
                            '/' -> builder.append('/')
                            'b' -> builder.append('\b')
                            'f' -> builder.append('\u000C')
                            'n' -> builder.append('\n')
                            'r' -> builder.append('\r')
                            't' -> builder.append('\t')
                            'u' -> {
                                if (index + 4 >= text.length) throw JsonException("truncated \\u escape at $index")
                                val hex = text.substring(index + 1, index + 5)
                                val code = hex.toIntOrNull(16) ?: throw JsonException("invalid \\u escape '$hex' at $index")
                                builder.append(code.toChar())
                                index += 4
                            }
                            else -> throw JsonException("invalid json escape '\\$escape' at $index")
                        }
                        index++
                    }
                    ch < ' ' -> throw JsonException("raw control character in json string at $index")
                    else -> {
                        builder.append(ch)
                        index++
                    }
                }
            }
        }

        private fun readNumber(): Any {
            val start = index
            if (text[index] == '-') index++
            while (!atEnd() && (text[index] in '0'..'9' || text[index] == '.' || text[index] == 'e' || text[index] == 'E' || text[index] == '+' || text[index] == '-')) {
                index++
            }
            val token = text.substring(start, index)
            if (!NUMBER_PATTERN.matches(token)) throw JsonException("invalid json number '$token' at $start")
            if (token.indexOf('.') < 0 && token.indexOf('e') < 0 && token.indexOf('E') < 0) {
                token.toLongOrNull()?.let { return it }
            }
            return token.toDoubleOrNull() ?: throw JsonException("invalid json number '$token' at $start")
        }

        private fun expectLiteral(literal: String) {
            if (index + literal.length > text.length || text.substring(index, index + literal.length) != literal) {
                throw JsonException("expected '$literal' at $index")
            }
            index += literal.length
        }
    }
}
