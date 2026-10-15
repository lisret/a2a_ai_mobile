import {
  AgentProviderError,
  type ActionDecision,
  type CredentialResolver,
  type Observation,
} from '../contracts/AgentContracts';
import {sanitizeObservation} from '../contracts/PlannerPayload';

export interface OpenAICompatibleRequest {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal;
}

export interface OpenAICompatibleTransport {
  post(request: OpenAICompatibleRequest): Promise<unknown>;
}

interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type OpenAICompatibleFetch = (
  url: string,
  init: {
    readonly method: 'POST';
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly signal: AbortSignal;
  },
) => Promise<FetchResponseLike>;

const chatCompletionsUrl = (baseUrl: string): string => {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new AgentProviderError(
      'invalid_configuration',
      'Provider configuration is invalid',
    );
  }
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new AgentProviderError(
      'invalid_configuration',
      'Provider configuration is invalid',
    );
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.endsWith('/chat/completions')) {
    url.pathname = `${pathname}/chat/completions`;
  }
  return url.toString();
};

export class FetchOpenAICompatibleTransport
  implements OpenAICompatibleTransport
{
  constructor(
    private readonly fetchFn: OpenAICompatibleFetch = fetch as unknown as OpenAICompatibleFetch,
  ) {}

  async post(request: OpenAICompatibleRequest): Promise<unknown> {
    const url = chatCompletionsUrl(request.baseUrl);
    let response: FetchResponseLike;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${request.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request.body),
        signal: request.signal,
      });
    } catch {
      throw new AgentProviderError(
        'transport_failed',
        'Provider request failed',
      );
    }

    if (!response.ok) {
      throw new AgentProviderError(
        'http_error',
        `Provider request failed with HTTP ${response.status}`,
      );
    }

    try {
      return await response.json();
    } catch {
      throw new AgentProviderError(
        'invalid_response',
        'Provider returned an invalid response',
      );
    }
  }
}

export const resolveCredential = async (
  resolver: CredentialResolver,
  secretRef: string,
): Promise<string> => {
  const apiKey = await resolver.resolve(secretRef);
  if (!apiKey || !apiKey.trim()) {
    throw new AgentProviderError(
      'credential_unavailable',
      'Provider credential is unavailable',
    );
  }
  return apiKey;
};

const extractTextContent = (response: unknown): string => {
  if (response === null || typeof response !== 'object') {
    throw new AgentProviderError(
      'invalid_response',
      'Provider returned an invalid response',
    );
  }
  const choices = (response as {choices?: unknown}).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AgentProviderError(
      'invalid_response',
      'Provider returned an invalid response',
    );
  }
  const choice = choices[0];
  const message =
    choice !== null && typeof choice === 'object'
      ? (choice as {message?: unknown}).message
      : undefined;
  const content =
    message !== null && typeof message === 'object'
      ? (message as {content?: unknown}).content
      : undefined;

  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    const text = content
      .map(part =>
        part !== null &&
        typeof part === 'object' &&
        typeof (part as {text?: unknown}).text === 'string'
          ? ((part as {text: string}).text as string)
          : '',
      )
      .join('');
    if (text) {
      return text;
    }
  }
  throw new AgentProviderError(
    'invalid_response',
    'Provider returned an invalid response',
  );
};

export const parseStructuredResponse = (
  response: unknown,
): Record<string, unknown> => {
  const raw = extractTextContent(response).trim();
  const fence = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const json = fence ? fence[1] : raw;
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new Error('not_an_object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new AgentProviderError(
      'invalid_structured_response',
      'Provider returned invalid structured output',
    );
  }
};

const ACTIONS = new Set([
  'tap',
  'input',
  'swipe',
  'back',
  'wait',
  'finish',
  'ask_user',
]);
const RISKS = new Set(['low', 'medium', 'high']);

const invalidStructuredResponse = (): never => {
  throw new AgentProviderError(
    'invalid_structured_response',
    'Provider returned invalid structured output',
  );
};

export const parseActionDecisionResponse = (
  response: unknown,
): ActionDecision => {
  const value = parseStructuredResponse(response);
  if (
    value.schemaVersion !== 1 ||
    typeof value.subtaskId !== 'string' ||
    typeof value.action !== 'string' ||
    !ACTIONS.has(value.action) ||
    typeof value.expectedState !== 'string' ||
    typeof value.risk !== 'string' ||
    !RISKS.has(value.risk)
  ) {
    return invalidStructuredResponse();
  }
  return value as unknown as ActionDecision;
};

export const parseObservationResponse = (response: unknown): Observation => {
  return sanitizeObservation(parseStructuredResponse(response));
};
