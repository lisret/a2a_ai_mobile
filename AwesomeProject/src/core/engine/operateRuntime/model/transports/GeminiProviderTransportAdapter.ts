// Gemini generateContent payloads and Google API-key auth.
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

const parts = (message: ProviderChatMessageV1): unknown[] => {
  const list: unknown[] = [{text: message.text}];
  if (message.imageDataURI) {
    const match = /^data:(.+?);base64,(.*)$/.exec(message.imageDataURI);
    if (match) {
      list.push({inlineData: {mimeType: match[1], data: match[2]}});
    }
  }
  return list;
};

export class GeminiProviderTransportAdapter implements ProviderTransportAdapter {
  readonly id = 'gemini' as const;

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
    if (target.protocol !== 'gemini_generate_content') {
      throw new ProviderTransportError('provider_transport_protocol_mismatch');
    }
    const path = target.chatPath.replace(
      '{modelId}',
      encodeURIComponent(binding.modelId),
    );
    const url = resolveEndpointUrl(target.baseURL, path);
    const secret = await resolveSecret(target, this.credentials);
    const {headers, url: finalUrl} = applyAuth(url, target.auth, secret, {
      'Content-Type': 'application/json',
    });
    const systemText = messages
      .filter(message => message.role === 'system')
      .map(message => message.text)
      .join('\n');
    const contents = messages
      .filter(message => message.role !== 'system')
      .map(message => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: parts(message),
      }));
    const body: Record<string, unknown> = {contents};
    if (systemText) {
      body.systemInstruction = {parts: [{text: systemText}]};
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
    const candidates = root?.candidates;
    const firstCandidate = Array.isArray(candidates)
      ? asRecord(candidates[0])
      : null;
    const content = firstCandidate ? asRecord(firstCandidate.content) : null;
    let text = '';
    if (content && Array.isArray(content.parts)) {
      text = (content.parts as unknown[])
        .map(item => asRecord(item))
        .filter(item => typeof item?.text === 'string')
        .map(item => item!.text as string)
        .join('');
    }
    const usage = asRecord(root?.usageMetadata);
    return {
      text,
      finishReason:
        typeof firstCandidate?.finishReason === 'string'
          ? (firstCandidate.finishReason as string)
          : null,
      usage: {
        inputTokens:
          typeof usage?.promptTokenCount === 'number'
            ? usage.promptTokenCount
            : null,
        outputTokens:
          typeof usage?.candidatesTokenCount === 'number'
            ? usage.candidatesTokenCount
            : null,
      },
    };
  }
}
