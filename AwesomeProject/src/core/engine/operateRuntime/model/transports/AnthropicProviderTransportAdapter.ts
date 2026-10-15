// Anthropic Messages payloads plus x-api-key / anthropic-version headers.
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

export const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 1024;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const contentBlocks = (message: ProviderChatMessageV1): unknown[] => {
  const blocks: unknown[] = [{type: 'text', text: message.text}];
  if (message.imageDataURI) {
    const match = /^data:(.+?);base64,(.*)$/.exec(message.imageDataURI);
    if (match) {
      blocks.push({
        type: 'image',
        source: {type: 'base64', media_type: match[1], data: match[2]},
      });
    }
  }
  return blocks;
};

export class AnthropicProviderTransportAdapter
  implements ProviderTransportAdapter
{
  readonly id = 'anthropic' as const;

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
    if (target.protocol !== 'anthropic_messages') {
      throw new ProviderTransportError('provider_transport_protocol_mismatch');
    }
    const url = resolveEndpointUrl(target.baseURL, target.chatPath);
    const secret = await resolveSecret(target, this.credentials);
    const {headers, url: finalUrl} = applyAuth(url, target.auth, secret, {
      'Content-Type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
    });
    const system = messages
      .filter(message => message.role === 'system')
      .map(message => message.text)
      .join('\n');
    const conversation = messages
      .filter(message => message.role !== 'system')
      .map(message => ({
        role: message.role,
        content: contentBlocks(message),
      }));
    const body: Record<string, unknown> = {
      model: binding.modelId,
      max_tokens: DEFAULT_MAX_TOKENS,
      messages: conversation,
    };
    if (system) {
      body.system = system;
    }
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
    const root = asRecord(result.json);
    const content = root?.content;
    let text = '';
    if (Array.isArray(content)) {
      text = content
        .map(item => asRecord(item))
        .filter(item => item?.type === 'text' && typeof item.text === 'string')
        .map(item => item!.text as string)
        .join('');
    }
    const usage = asRecord(root?.usage);
    return {
      text,
      finishReason:
        typeof root?.stop_reason === 'string' ? (root.stop_reason as string) : null,
      usage: {
        inputTokens:
          typeof usage?.input_tokens === 'number' ? usage.input_tokens : null,
        outputTokens:
          typeof usage?.output_tokens === 'number' ? usage.output_tokens : null,
      },
    };
  }
}
