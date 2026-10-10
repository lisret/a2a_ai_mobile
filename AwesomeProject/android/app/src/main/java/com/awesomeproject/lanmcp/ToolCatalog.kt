package com.awesomeproject.lanmcp

/** A validated tool invocation. Only these six tools exist; nothing else is routable. */
sealed class ToolInvocation {
    object PhoneStatus : ToolInvocation()
    object PhoneScreenshot : ToolInvocation()
    data class Tap(val x: Int, val y: Int) : ToolInvocation()
    data class Swipe(val startX: Int, val startY: Int, val endX: Int, val endY: Int, val durationMs: Int) : ToolInvocation()
    data class TypeText(val text: String) : ToolInvocation()
    data class Key(val key: String) : ToolInvocation()
}

sealed class ToolResolution {
    data class Valid(val invocation: ToolInvocation) : ToolResolution()
    data class Invalid(val code: String, val message: String) : ToolResolution()
}

/**
 * The frozen tool catalog: names, JSON Schemas and argument validation.
 *
 * Argument rules: required parameters must be present, integer coordinates must be
 * non-negative and within a generous sanity bound (the real display bound is enforced
 * against the live screenshot size by [ToolExecutor]), `durationMs` is bounded to
 * 1..2000, `text` must be non-empty and at most [MAX_TEXT_CHARS], and `key` is a
 * strict enum of "back" | "home". Unknown parameters are ignored.
 */
object ToolCatalog {

    const val MAX_COORDINATE = 20000
    const val MAX_DURATION_MS = 2000
    const val MAX_TEXT_CHARS = 4096

    const val STATUS = "phone_status"
    const val SCREENSHOT = "phone_screenshot"
    const val TAP = "phone_tap"
    const val SWIPE = "phone_swipe"
    const val TYPE = "phone_type"
    const val KEY = "phone_key"

    val NAMES: List<String> = listOf(STATUS, SCREENSHOT, TAP, SWIPE, TYPE, KEY)

    val KEYS: List<String> = listOf("back", "home")

    fun describe(): List<Map<String, Any?>> = listOf(
        tool(
            STATUS,
            "Report LAN MCP service status: accessibility connection, lock state, display size and rotation.",
            properties = emptyMap(),
            required = emptyList(),
        ),
        tool(
            SCREENSHOT,
            "Capture the current screen and return it as an MCP image (image/png). Pixel coordinates used by " +
                "phone_tap and phone_swipe refer to this image's original orientation and dimensions.",
            properties = emptyMap(),
            required = emptyList(),
        ),
        tool(
            TAP,
            "Tap once at pixel coordinates in the current screenshot's coordinate space.",
            properties = linkedMapOf(
                "x" to integerProperty("Horizontal pixel coordinate, 0-based from the left edge.", 0, MAX_COORDINATE),
                "y" to integerProperty("Vertical pixel coordinate, 0-based from the top edge.", 0, MAX_COORDINATE),
            ),
            required = listOf("x", "y"),
        ),
        tool(
            SWIPE,
            "Swipe from one pixel coordinate to another with an explicit duration.",
            properties = linkedMapOf(
                "startX" to integerProperty("Start horizontal pixel coordinate.", 0, MAX_COORDINATE),
                "startY" to integerProperty("Start vertical pixel coordinate.", 0, MAX_COORDINATE),
                "endX" to integerProperty("End horizontal pixel coordinate.", 0, MAX_COORDINATE),
                "endY" to integerProperty("End vertical pixel coordinate.", 0, MAX_COORDINATE),
                "durationMs" to integerProperty("Swipe duration in milliseconds.", 1, MAX_DURATION_MS),
            ),
            required = listOf("startX", "startY", "endX", "endY", "durationMs"),
        ),
        tool(
            TYPE,
            "Type text into the currently focused editable field using the accessibility service. " +
                "Focus the field first (for example with phone_tap).",
            properties = linkedMapOf(
                "text" to linkedMapOf<String, Any?>(
                    "type" to "string",
                    "description" to "Text to set into the focused editable field (1..$MAX_TEXT_CHARS characters).",
                    "minLength" to 1,
                    "maxLength" to MAX_TEXT_CHARS,
                ),
            ),
            required = listOf("text"),
        ),
        tool(
            KEY,
            "Press a global navigation key.",
            properties = linkedMapOf(
                "key" to linkedMapOf<String, Any?>(
                    "type" to "string",
                    "description" to "Global navigation key.",
                    "enum" to KEYS,
                ),
            ),
            required = listOf("key"),
        ),
    )

    fun resolve(name: String, args: Map<String, Any?>): ToolResolution {
        val reader = ArgReader(args)
        val invocation: ToolInvocation? = when (name) {
            STATUS -> ToolInvocation.PhoneStatus
            SCREENSHOT -> ToolInvocation.PhoneScreenshot
            TAP -> {
                val x = reader.integer("x", 0, MAX_COORDINATE)
                val y = reader.integer("y", 0, MAX_COORDINATE)
                if (x == null || y == null) null else ToolInvocation.Tap(x, y)
            }
            SWIPE -> {
                val startX = reader.integer("startX", 0, MAX_COORDINATE)
                val startY = reader.integer("startY", 0, MAX_COORDINATE)
                val endX = reader.integer("endX", 0, MAX_COORDINATE)
                val endY = reader.integer("endY", 0, MAX_COORDINATE)
                val durationMs = reader.integer("durationMs", 1, MAX_DURATION_MS)
                if (startX == null || startY == null || endX == null || endY == null || durationMs == null) {
                    null
                } else {
                    ToolInvocation.Swipe(startX, startY, endX, endY, durationMs)
                }
            }
            TYPE -> {
                val text = reader.text("text", MAX_TEXT_CHARS)
                if (text == null) null else ToolInvocation.TypeText(text)
            }
            KEY -> {
                val key = reader.enumValue("key", KEYS)
                if (key == null) null else ToolInvocation.Key(key)
            }
            else -> return ToolResolution.Invalid(Codes.UNKNOWN_TOOL, "unknown tool: $name")
        }
        reader.error?.let { return it }
        if (invocation == null) {
            return ToolResolution.Invalid(Codes.INVALID_PARAMS, "invalid parameters for tool: $name")
        }
        return ToolResolution.Valid(invocation)
    }

    private fun tool(
        name: String,
        description: String,
        properties: Map<String, Any?>,
        required: List<String>,
    ): Map<String, Any?> = Jsons.obj(
        "name" to name,
        "description" to description,
        "inputSchema" to Jsons.obj(
            "type" to "object",
            "properties" to LinkedHashMap(properties),
            "required" to required,
            "additionalProperties" to false,
        ),
    )

    private fun integerProperty(description: String, minimum: Int, maximum: Int): Map<String, Any?> = Jsons.obj(
        "type" to "integer",
        "description" to description,
        "minimum" to minimum,
        "maximum" to maximum,
    )

    private class ArgReader(private val args: Map<String, Any?>) {
        var error: ToolResolution.Invalid? = null
            private set

        fun integer(key: String, minimum: Int, maximum: Int): Int? {
            if (!args.containsKey(key)) return fail(Codes.MISSING_PARAM, "missing required parameter: $key")
            val value = args[key]
            val number = when (value) {
                is Int -> value
                is Long -> {
                    if (value < Int.MIN_VALUE || value > Int.MAX_VALUE) {
                        return fail(Codes.OUT_OF_RANGE, "parameter $key is out of range: $value")
                    }
                    value.toInt()
                }
                is Double -> {
                    if (value.isNaN() || value.isInfinite() || value != Math.floor(value)) {
                        return fail(Codes.INVALID_PARAMS, "parameter $key must be an integer")
                    }
                    if (value < Int.MIN_VALUE.toDouble() || value > Int.MAX_VALUE.toDouble()) {
                        return fail(Codes.OUT_OF_RANGE, "parameter $key is out of range: $value")
                    }
                    value.toInt()
                }
                else -> return fail(Codes.INVALID_PARAMS, "parameter $key must be an integer")
            }
            if (number < minimum || number > maximum) {
                return fail(Codes.OUT_OF_RANGE, "parameter $key is out of range [$minimum..$maximum]: $number")
            }
            return number
        }

        fun text(key: String, maximumLength: Int): String? {
            if (!args.containsKey(key)) return fail(Codes.MISSING_PARAM, "missing required parameter: $key")
            val value = args[key] as? String ?: return fail(Codes.INVALID_PARAMS, "parameter $key must be a string")
            if (value.isEmpty()) return fail(Codes.INVALID_PARAMS, "parameter $key must not be empty")
            if (value.length > maximumLength) {
                return fail(Codes.TEXT_TOO_LONG, "parameter $key exceeds $maximumLength characters")
            }
            return value
        }

        fun enumValue(key: String, allowed: List<String>): String? {
            if (!args.containsKey(key)) return fail(Codes.MISSING_PARAM, "missing required parameter: $key")
            val value = args[key] as? String ?: return fail(Codes.INVALID_PARAMS, "parameter $key must be a string")
            if (!allowed.contains(value)) {
                return fail(
                    Codes.UNSUPPORTED_KEY,
                    "parameter $key must be one of ${allowed.joinToString("|")}, received: $value",
                )
            }
            return value
        }

        /** Always returns null; `Nothing?` lets one helper serve every nullable return type. */
        private fun fail(code: String, message: String): Nothing? {
            if (error == null) error = ToolResolution.Invalid(code, message)
            return null
        }
    }
}
