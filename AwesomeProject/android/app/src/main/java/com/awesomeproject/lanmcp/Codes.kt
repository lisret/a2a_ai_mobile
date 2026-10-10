package com.awesomeproject.lanmcp

/**
 * Single place for every stable error code crossing a boundary (promise rejection,
 * MCP tool `isError` payload, or HTTP error body). Codes are stable identifiers that
 * the React Native layer and the exported guide can rely on.
 */
object Codes {

    // --- native module promise rejections -------------------------------------
    const val INVALID_CODE = "E_INVALID_CODE"
    const val SERVICE_RUNNING = "E_SERVICE_RUNNING"
    const val CODE_NOT_CONFIGURED = "E_CODE_NOT_CONFIGURED"
    const val NO_WIFI_ADDRESS = "E_NO_WIFI_ADDRESS"
    const val PORT_IN_USE = "E_PORT_IN_USE"
    const val BIND_FAILED = "E_BIND_FAILED"
    const val START_TIMEOUT = "E_START_TIMEOUT"
    const val FOREGROUND_FAILED = "E_FOREGROUND_FAILED"
    const val NETWORK_MONITOR_FAILED = "E_NETWORK_MONITOR_FAILED"
    const val NETWORK_CHANGED = "E_NETWORK_CHANGED"
    const val NO_ACTIVITY = "E_NO_ACTIVITY"
    const val EXPORT_IN_PROGRESS = "E_EXPORT_IN_PROGRESS"
    const val EXPORT_EMPTY = "E_EXPORT_EMPTY"
    const val EXPORT_TOO_LARGE = "E_EXPORT_TOO_LARGE"
    const val EXPORT_CONTAINS_SECRET = "E_EXPORT_CONTAINS_SECRET"
    const val EXPORT_WRITE_FAILED = "E_EXPORT_WRITE_FAILED"
    const val KEYSTORE_UNAVAILABLE = "E_KEYSTORE_UNAVAILABLE"
    const val KEYSTORE_FAILURE = "E_KEYSTORE_FAILURE"

    // --- MCP tool errors (returned in-band with isError = true) ---------------
    const val UNKNOWN_TOOL = "E_UNKNOWN_TOOL"
    const val INVALID_PARAMS = "E_INVALID_PARAMS"
    const val MISSING_PARAM = "E_MISSING_PARAM"
    const val OUT_OF_RANGE = "E_OUT_OF_RANGE"
    const val OUT_OF_BOUNDS = "E_OUT_OF_BOUNDS"
    const val TEXT_TOO_LONG = "E_TEXT_TOO_LONG"
    const val UNSUPPORTED_KEY = "E_UNSUPPORTED_KEY"
    const val SERVICE_STOPPED = "E_SERVICE_STOPPED"
    const val TASK_RUNNING = "E_TASK_RUNNING"
    const val NO_ACCESSIBILITY = "E_NO_ACCESSIBILITY"
    const val DEVICE_LOCKED = "E_DEVICE_LOCKED"
    const val DISPLAY_UNKNOWN = "E_DISPLAY_UNKNOWN"
    const val ACTION_FAILED = "E_ACTION_FAILED"
    const val SCREENSHOT_FAILED = "E_SCREENSHOT_FAILED"
    const val INTERNAL = "E_INTERNAL"

    // --- HTTP-level error identifiers ----------------------------------------
    const val HTTP_SERVICE_NOT_RUNNING = "service_not_running"
    const val HTTP_FORBIDDEN_ORIGIN = "forbidden_origin"
    const val HTTP_HOST_REQUIRED = "host_header_required"
    const val HTTP_HOST_MISMATCH = "host_mismatch"
    const val HTTP_NOT_FOUND = "not_found"
    const val HTTP_METHOD_NOT_ALLOWED = "method_not_allowed"
    const val HTTP_UNSUPPORTED_MEDIA_TYPE = "unsupported_media_type"
    const val HTTP_NOT_ACCEPTABLE = "not_acceptable"
    const val HTTP_UNSUPPORTED_TRANSFER_ENCODING = "unsupported_transfer_encoding"
    const val HTTP_INVALID_CONTENT_LENGTH = "invalid_content_length"
    const val HTTP_INCOMPLETE_BODY = "incomplete_body"
    const val HTTP_PAYLOAD_TOO_LARGE = "payload_too_large"
    const val HTTP_UNAUTHORIZED = "unauthorized"
    const val HTTP_UNSUPPORTED_PROTOCOL_VERSION = "unsupported_protocol_version"
    const val HTTP_TOO_MANY_REQUESTS = "too_many_requests"
    const val HTTP_INTERNAL_ERROR = "internal_error"

    // --- JSON-RPC error codes -------------------------------------------------
    const val RPC_PARSE_ERROR = -32700
    const val RPC_INVALID_REQUEST = -32600
    const val RPC_METHOD_NOT_FOUND = -32601
    const val RPC_INVALID_PARAMS = -32602
    const val RPC_INTERNAL_ERROR = -32603
}
