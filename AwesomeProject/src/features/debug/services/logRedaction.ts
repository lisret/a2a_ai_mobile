// Compatibility re-export. The single sanitizer lives in the runtime privacy
// module; no independent redaction implementation remains under features/debug.
export {
  sanitizeLogValue as redactSensitiveData,
  sanitizeLogText as redactSensitiveText,
} from '@core/engine/privacy/sanitizeLog';
