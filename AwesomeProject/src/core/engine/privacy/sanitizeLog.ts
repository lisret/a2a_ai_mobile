// Single recursive log sanitizer (runtime-foundation Task 10).
// Every platform-console, in-memory, and persisted log sink routes through here
// before a value leaves the process, so screenshots, instructions, model
// responses, credentials, and raw Error stacks never reach a log. The original
// value is never mutated; all redaction produces fresh structures.

const REDACTED = '[REDACTED]';
const CONTENT_REDACTED = '[CONTENT_REDACTED]';
const CIRCULAR = '[Circular]';
const TRUNCATED = '[Truncated]';

const MAX_DEPTH = 6;
const MAX_ENTRIES = 50;
const MAX_STRING = 512;
const MAX_SERIALIZED_BYTES = 16 * 1024;

// Keys whose value is an opaque credential.
const CREDENTIAL_KEY_PATTERN =
  /^(authorization|api[-_]?key|access[-_]?token|token|client[-_]?secret|secret|secret[-_]?ref|apikey|bearer)$/i;

// Keys whose value is bulk user/task content that must never be logged.
const CONTENT_KEY_PATTERN =
  /(screenshot|image|instruction|prompt|response|history|conversation|stack|task[-_]?data)/i;

const DATA_IMAGE_PATTERN = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/gi;

const DOUBLE_QUOTED_AUTHORIZATION_PATTERN =
  /("Authorization"\s*:\s*")((?:\\.|[^"\\])*)"/gi;
const SINGLE_QUOTED_AUTHORIZATION_PATTERN =
  /('Authorization'\s*:\s*')((?:\\.|[^'\\])*)'/gi;
const AUTHORIZATION_CREDENTIAL_PATTERN =
  /\b(Authorization\s*:\s*[A-Za-z][A-Za-z0-9+.-]*)\s+[^\s"',}\]]+/gi;
const TEXT_SECRET_PATTERN =
  /(["']?(?:api[-_]?key|access[-_]?token|token|client[-_]?secret|secret)["']?\s*[:=]\s*)(["']?)([^"',\s}\]]+)(\2)/gi;

export interface SanitizedLogEntry {
  readonly message: string;
  readonly data?: unknown;
}

export function sanitizeLogText(value: string): string {
  const redacted = value
    .replace(DATA_IMAGE_PATTERN, CONTENT_REDACTED)
    .replace(
      DOUBLE_QUOTED_AUTHORIZATION_PATTERN,
      (_match, prefix: string) => `${prefix}${REDACTED}"`,
    )
    .replace(
      SINGLE_QUOTED_AUTHORIZATION_PATTERN,
      (_match, prefix: string) => `${prefix}${REDACTED}'`,
    )
    .replace(AUTHORIZATION_CREDENTIAL_PATTERN, `$1 ${REDACTED}`)
    .replace(
      TEXT_SECRET_PATTERN,
      (_match, prefix: string, quote: string) =>
        `${prefix}${quote}${REDACTED}${quote}`,
    );
  if (redacted.length > MAX_STRING) {
    return `${redacted.slice(0, MAX_STRING)}${TRUNCATED}`;
  }
  return redacted;
}

function sanitizeError(error: Error): SanitizedLogEntry & {readonly name: string} {
  return {
    name: typeof error.name === 'string' ? error.name : 'Error',
    message: sanitizeLogText(
      typeof error.message === 'string' ? error.message : '',
    ),
  };
}

function sanitizeValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (typeof value === 'string') {
    return sanitizeLogText(value);
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value;
  }
  if (typeof value !== 'object') {
    // functions, symbols, etc.
    return sanitizeLogText(String(value));
  }
  if (seen.has(value as object)) {
    return CIRCULAR;
  }
  if (depth >= MAX_DEPTH) {
    return TRUNCATED;
  }
  seen.add(value as object);

  if (value instanceof Error) {
    return sanitizeError(value);
  }

  if (Array.isArray(value)) {
    const limit = Math.min(value.length, MAX_ENTRIES);
    const out: unknown[] = [];
    for (let index = 0; index < limit; index += 1) {
      out.push(sanitizeValue(value[index], depth + 1, seen));
    }
    if (value.length > MAX_ENTRIES) {
      out.push(TRUNCATED);
    }
    return out;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const out: Record<string, unknown> = {};
  const limit = Math.min(entries.length, MAX_ENTRIES);
  for (let index = 0; index < limit; index += 1) {
    const [key, nested] = entries[index];
    if (CREDENTIAL_KEY_PATTERN.test(key)) {
      out[key] = REDACTED;
    } else if (CONTENT_KEY_PATTERN.test(key)) {
      out[key] = CONTENT_REDACTED;
    } else {
      out[key] = sanitizeValue(nested, depth + 1, seen);
    }
  }
  if (entries.length > MAX_ENTRIES) {
    out.__truncated__ = TRUNCATED;
  }
  return out;
}

export function sanitizeLogValue(value: unknown): unknown {
  return sanitizeValue(value, 0, new WeakSet<object>());
}

function capSerialized(entry: SanitizedLogEntry): SanitizedLogEntry {
  const serialized = safeStringify(entry);
  if (serialized.length <= MAX_SERIALIZED_BYTES) {
    return entry;
  }
  const withoutData: SanitizedLogEntry = {message: entry.message};
  if (safeStringify(withoutData).length <= MAX_SERIALIZED_BYTES) {
    return {message: entry.message, data: TRUNCATED};
  }
  return {
    message: `${entry.message.slice(0, MAX_SERIALIZED_BYTES)}${TRUNCATED}`,
    data: TRUNCATED,
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

export function sanitizeLog(message: unknown, data?: unknown): SanitizedLogEntry {
  const sanitizedMessage =
    typeof message === 'string'
      ? sanitizeLogText(message)
      : safeStringify(sanitizeLogValue(message));
  const entry: SanitizedLogEntry =
    data === undefined
      ? {message: sanitizedMessage}
      : {message: sanitizedMessage, data: sanitizeLogValue(data)};
  return capSerialized(entry);
}
