// Custom transport: applies the configured protocol/paths/auth without guessing
// provider identity. Never performs a live registry/profile lookup.
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

const openAIContent = (message: ProviderChatMessageV1): unknown =>
  message.imageDataURI
    ? [
        {type: 'text', text: message.text},
        {type: 'image_url', image_url: {url: message.imageDataURI}},
      ]
    : message.text;

export class CustomProviderTransportAdapter
  implements ProviderTransportAdapter
{
  readonly id = 'custom' as const;

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
    const path =
      target.protocol === 'gemini_generate_content'
        ? target.chatPath.replace(
            '{modelId}',
            encodeURIComponent(binding.modelId),
          )
        : target.chatPath;
    const url = resolveEndpointUrl(target.baseURL, path);
    const secret = await resolveSecret(target, this.credentials);
    const {headers, url: finalUrl} = applyAuth(url, target.auth, secret, {
      'Content-Type': 'application/json',
    });
    const body = this.buildBody(target, binding, messages);
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
    return this.parse(result.json);
  }

  private buildBody(
    target: ProviderExecutionTargetV1,
    binding: ModelBindingV1,
    messages: readonly ProviderChatMessageV1[],
  ): Record<string, unknown> {
    switch (target.protocol) {
      case 'anthropic_messages':
        return {
          model: binding.modelId,
          max_tokens: 1024,
          messages: messages
            .filter(message => message.role !== 'system')
            .map(message => ({
              role: message.role,
              content: [{type: 'text', text: message.text}],
            })),
        };
      case 'gemini_generate_content':
        return {
          contents: messages
            .filter(message => message.role !== 'system')
            .map(message => ({
              role: message.role === 'assistant' ? 'model' : 'user',
              parts: [{text: message.text}],
            })),
        };
      case 'openai_responses':
        return {
          model: binding.modelId,
          input: messages.map(message => ({
            role: message.role,
            content: openAIContent(message),
          })),
        };
      case 'openai_chat_completions':
      case 'custom_http_json':
      default:
        return {
          model: binding.modelId,
          messages: messages.map(message => ({
            role: message.role,
            content: openAIContent(message),
          })),
        };
    }
  }

  private parse(json: unknown): ProviderChatResultV1 {
    const root = asRecord(json);
    const choices = root?.choices;
    const first = Array.isArray(choices) ? asRecord(choices[0]) : null;
    const message = first ? asRecord(first.message) : null;
    let text = typeof message?.content === 'string' ? message.content : '';
    if (!text && typeof root?.output_text === 'string') {
      text = root.output_text;
    }
    const contentList = root?.content;
    if (!text && Array.isArray(contentList)) {
      text = (contentList as unknown[])
        .map(item => asRecord(item))
        .filter(item => typeof item?.text === 'string')
        .map(item => item!.text as string)
        .join('');
    }
    const usage = asRecord(root?.usage);
    return {
      text,
      finishReason:
        typeof first?.finish_reason === 'string' ? first.finish_reason : null,
      usage: {
        inputTokens:
          typeof usage?.prompt_tokens === 'number'
            ? usage.prompt_tokens
            : typeof usage?.input_tokens === 'number'
            ? usage.input_tokens
            : null,
        outputTokens:
          typeof usage?.completion_tokens === 'number'
            ? usage.completion_tokens
            : typeof usage?.output_tokens === 'number'
            ? usage.output_tokens
            : null,
      },
    };
  }
}
