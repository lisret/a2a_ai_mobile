// Shared request-boundary helpers for provider transports.
// Credentials are read here only into local variables; no persisted DTO carries them.
import type {CredentialStore} from '../../contracts/CredentialStore';
import type {
  ProviderAuthV1,
  ProviderExecutionTargetV1,
} from '../ModelProviderContracts';

/** Stable, ref-free transport failure carried on `.code`; never contains a raw body. */
export class ProviderTransportError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'ProviderTransportError';
    this.code = code;
  }
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly headers?: {get(name: string): string | null};
  text(): Promise<string>;
}

export type ProviderFetch = (
  url: string,
  init: {
    readonly method: 'POST' | 'GET';
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: string;
    readonly signal: AbortSignal;
    readonly redirect: 'manual';
  },
) => Promise<FetchResponseLike>;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const isLoopback = (hostname: string): boolean =>
  LOOPBACK_HOSTS.has(hostname.toLowerCase());

const FORBIDDEN_HEADER_NAMES = new Set([
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'proxy-authenticate',
]);

const RFC_TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

/**
 * Resolve `baseURL + path` into a single-origin absolute URL, rejecting userinfo,
 * fragments, non-loopback plaintext, cross-origin escapes and path traversal.
 */
export function resolveEndpointUrl(baseURL: string, path: string): URL {
  let base: URL;
  try {
    base = new URL(baseURL);
  } catch {
    throw new ProviderTransportError('provider_transport_invalid_endpoint');
  }
  if (base.username || base.password || base.hash) {
    throw new ProviderTransportError('provider_transport_invalid_endpoint');
  }
  if (base.protocol !== 'https:' && !isLoopback(base.hostname)) {
    throw new ProviderTransportError('provider_transport_insecure_endpoint');
  }
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new ProviderTransportError('provider_transport_invalid_path');
  }
  if (path.includes('://') || path.includes('..') || path.includes('\\')) {
    throw new ProviderTransportError('provider_transport_invalid_path');
  }
  const basePath = base.pathname.replace(/\/+$/, '');
  const combined = new URL(`${basePath}${path}`, base.origin);
  if (combined.origin !== base.origin) {
    throw new ProviderTransportError('provider_transport_cross_origin');
  }
  return combined;
}

/**
 * Apply `auth` using `secret` into a fresh header map / URL query. The secret only
 * ever lives in the returned local structures, never on the immutable target.
 */
export function applyAuth(
  url: URL,
  auth: ProviderAuthV1,
  secret: string | null,
  baseHeaders: Record<string, string>,
): {headers: Record<string, string>; url: string} {
  const headers: Record<string, string> = {...baseHeaders};
  switch (auth.kind) {
    case 'none':
      return {headers, url: url.toString()};
    case 'bearer':
      if (!secret) {
        throw new ProviderTransportError('provider_transport_missing_credential');
      }
      headers.Authorization = `Bearer ${secret}`;
      return {headers, url: url.toString()};
    case 'header': {
      if (!secret) {
        throw new ProviderTransportError('provider_transport_missing_credential');
      }
      const name = auth.headerName;
      if (!RFC_TOKEN.test(name) || FORBIDDEN_HEADER_NAMES.has(name.toLowerCase())) {
        throw new ProviderTransportError('provider_transport_invalid_auth');
      }
      headers[name] = `${auth.prefix}${secret}`;
      return {headers, url: url.toString()};
    }
    case 'query': {
      if (!secret) {
        throw new ProviderTransportError('provider_transport_missing_credential');
      }
      if (!RFC_TOKEN.test(auth.queryName)) {
        throw new ProviderTransportError('provider_transport_invalid_auth');
      }
      url.searchParams.set(auth.queryName, secret);
      return {headers, url: url.toString()};
    }
  }
}

/** Resolve `target.secretRef` at the request boundary; null only for `auth.kind: 'none'`. */
export async function resolveSecret(
  target: ProviderExecutionTargetV1,
  credentials: CredentialStore,
): Promise<string | null> {
  if (target.auth.kind === 'none') {
    return null;
  }
  if (!target.secretRef) {
    throw new ProviderTransportError('provider_transport_missing_credential');
  }
  let secret: string | null;
  try {
    secret = await credentials.get(target.secretRef);
  } catch {
    throw new ProviderTransportError('provider_transport_credential_unavailable');
  }
  if (!secret) {
    throw new ProviderTransportError('provider_transport_missing_credential');
  }
  return secret;
}

const readCappedText = async (
  response: FetchResponseLike,
  maxBytes: number,
): Promise<string> => {
  const declared = response.headers?.get('content-length');
  if (declared && Number(declared) > maxBytes) {
    throw new ProviderTransportError('provider_transport_response_too_large');
  }
  const text = await response.text();
  if (text.length > maxBytes) {
    throw new ProviderTransportError('provider_transport_response_too_large');
  }
  return text;
};

export const CHAT_RESPONSE_CAP_BYTES = 16 * 1024 * 1024;
export const CATALOG_RESPONSE_CAP_BYTES = 4 * 1024 * 1024;

/** Perform a JSON request honoring caller cancel, timeout, redirect and size caps. */
export async function requestJson(input: {
  url: string;
  method: 'POST' | 'GET';
  headers: Readonly<Record<string, string>>;
  body?: string;
  signal: AbortSignal;
  timeoutMs: number;
  maxBytes: number;
  fetchImpl: ProviderFetch;
}): Promise<{status: number; ok: boolean; json: unknown}> {
  const {signal, timeoutMs, maxBytes, fetchImpl} = input;
  if (signal.aborted) {
    throw new ProviderTransportError('provider_transport_cancelled');
  }
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let response: FetchResponseLike;
  try {
    response = await fetchImpl(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: controller.signal,
      redirect: 'manual',
    });
  } catch {
    if (timedOut) {
      throw new ProviderTransportError('provider_transport_timeout');
    }
    if (signal.aborted) {
      throw new ProviderTransportError('provider_transport_cancelled');
    }
    throw new ProviderTransportError('provider_transport_network_failed');
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
  if (response.status >= 300 && response.status < 400) {
    throw new ProviderTransportError('provider_transport_redirect_blocked');
  }
  const text = await readCappedText(response, maxBytes);
  let json: unknown = null;
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new ProviderTransportError('provider_transport_invalid_response');
    }
  }
  return {status: response.status, ok: response.ok, json};
}

/** Map non-2xx into a stable, body-free failure code. */
export function statusError(status: number): ProviderTransportError {
  if (status === 401 || status === 403) {
    return new ProviderTransportError('provider_transport_auth_failed');
  }
  return new ProviderTransportError('provider_transport_request_failed');
}
