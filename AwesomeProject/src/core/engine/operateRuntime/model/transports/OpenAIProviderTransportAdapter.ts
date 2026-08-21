// OpenAI request/response shapes; reused by every OpenAI-compatible preset.
import type {CredentialStore} from '../../contracts/CredentialStore';
import type {
  ModelBindingV1,
  ProviderChatMessageV1,
  ProviderChatResultV1,
  ProviderExecutionTargetV1,
  ProviderTransportAdapter,
} from '../ModelProviderContracts';
import {
  CHAT_RESPONSE_CAP_BYTES,
  ProviderTransportError,
  type ProviderFetch,
  applyAuth,
  requestJson,
  resolveEndpointUrl,
  resolveSecret,
  statusError,
} from './providerHttp';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const chatCompletionsContent = (
  message: ProviderChatMessageV1,
): unknown => {
  if (!message.imageDataURI) {
    return message.text;
  }
  return [
    {type: 'text', text: message.text},
    {type: 'image_url', image_url: {url: message.imageDataURI}},
  ];
};

const parseChatCompletions = (json: unknown): ProviderChatResultV1 => {
  const root = asRecord(json);
  const choices = root?.choices;
  const first = Array.isArray(choices) ? asRecord(choices[0]) : null;
  const message = first ? asRecord(first.message) : null;
  const content = message?.content;
  const text = typeof content === 'string' ? content : '';
  const usage = asRecord(root?.usage);
  return {
    text,
    finishReason:
      typeof first?.finish_reason === 'string' ? first.finish_reason : null,
    usage: {
      inputTokens:
        typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : null,
      outputTokens:
        typeof usage?.completion_tokens === 'number'
          ? usage.completion_tokens
          : null,
    },
  };
};

const parseResponses = (json: unknown): ProviderChatResultV1 => {
  const root = asRecord(json);
  let text = typeof root?.output_text === 'string' ? root.output_text : '';
  const output = root?.output;
  if (!text && Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output as unknown[]) {
      const record = asRecord(item);
      const contentList = record?.content;
      if (Array.isArray(contentList)) {
        for (const chunk of contentList) {
          const chunkRecord = asRecord(chunk);
          if (typeof chunkRecord?.text === 'string') {
            parts.push(chunkRecord.text);
          }
        }
      }
    }
    text = parts.join('');
  }
  const usage = asRecord(root?.usage);
  return {
    text,
    finishReason:
      typeof root?.status === 'string' ? (root.status as string) : null,
    usage: {
      inputTokens:
        typeof usage?.input_tokens === 'number' ? usage.input_tokens : null,
      outputTokens:
        typeof usage?.output_tokens === 'number' ? usage.output_tokens : null,
    },
  };
};

export class OpenAIProviderTransportAdapter implements ProviderTransportAdapter {
  readonly id = 'openai' as const;

  constructor(
    private readonly credentials: CredentialStore,
    private readonly fetchImpl: ProviderFetch,
  ) {}

  async sendChat(request: {
    target: ProviderExecutionTargetV1;
    binding: ModelBindingV1;
    messages: readonly ProviderChatMessageV1[];
    signal: AbortSignal;
    timeoutMs: number;
  }): Promise<ProviderChatResultV1> {
    const {target, binding, messages, signal, timeoutMs} = request;
    if (target.transportAdapterId !== this.id) {
      throw new ProviderTransportError('provider_transport_adapter_mismatch');
    }
    const isResponses = target.protocol === 'openai_responses';
    if (target.protocol !== 'openai_chat_completions' && !isResponses) {
      throw new ProviderTransportError('provider_transport_protocol_mismatch');
    }
    const url = resolveEndpointUrl(target.baseURL, target.chatPath);
    const secret = await resolveSecret(target, this.credentials);
    const {headers, url: finalUrl} = applyAuth(url, target.auth, secret, {
      'Content-Type': 'application/json',
    });
    const body = isResponses
      ? {
          model: binding.modelId,
          input: messages.map(message => ({
            role: message.role,
            content: chatCompletionsContent(message),
          })),
        }
      : {
          model: binding.modelId,
          messages: messages.map(message => ({
            role: message.role,
            content: chatCompletionsContent(message),
          })),
        };
    const result = await requestJson({
      url: finalUrl,
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
      timeoutMs,
      maxBytes: CHAT_RESPONSE_CAP_BYTES,
      fetchImpl: this.fetchImpl,
    });
    if (!result.ok) {
      throw statusError(result.status);
    }
    return isResponses ? parseResponses(result.json) : parseChatCompletions(result.json);
  }
}
