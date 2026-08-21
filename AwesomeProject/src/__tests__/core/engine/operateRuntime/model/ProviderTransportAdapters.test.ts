import {OpenAIProviderTransportAdapter} from '../../../../../core/engine/operateRuntime/model/transports/OpenAIProviderTransportAdapter';
import {AnthropicProviderTransportAdapter} from '../../../../../core/engine/operateRuntime/model/transports/AnthropicProviderTransportAdapter';
import {GeminiProviderTransportAdapter} from '../../../../../core/engine/operateRuntime/model/transports/GeminiProviderTransportAdapter';
import {CustomProviderTransportAdapter} from '../../../../../core/engine/operateRuntime/model/transports/CustomProviderTransportAdapter';
import type {ProviderFetch} from '../../../../../core/engine/operateRuntime/model/transports/providerHttp';
import type {CredentialStore} from '../../../../../core/engine/operateRuntime/contracts/CredentialStore';
import type {
  ModelBindingV1,
  ProviderChatMessageV1,
  ProviderExecutionTargetV1,
} from '../../../../../core/engine/operateRuntime/model/ModelProviderContracts';

const binding: ModelBindingV1 = {
  id: 'binding-1',
  role: 'direct',
  profileId: 'profile-1',
  modelId: 'gpt-4o',
  maxSteps: 10,
};

const messages: readonly ProviderChatMessageV1[] = [
  {role: 'system', text: 'be terse'},
  {role: 'user', text: 'hi'},
];

const caps = {
  chat: true as const,
  vision: 'unknown' as const,
  toolCalls: 'unknown' as const,
  reasoning: 'unknown' as const,
};

const baseTarget = (
  over: Partial<ProviderExecutionTargetV1>,
): ProviderExecutionTargetV1 =>
  ({
    provider: 'openai',
    transportAdapterId: 'openai',
    protocol: 'openai_responses',
    baseURL: 'https://api.openai.com/v1',
    auth: {kind: 'bearer'},
    chatPath: '/responses',
    region: null,
    channel: null,
    secretRef: 'model:openai',
    inputModalities: ['text'],
    outputModalities: ['text'],
    capabilities: caps,
    capabilityTrust: 'verified_remote',
    ...over,
  }) as ProviderExecutionTargetV1;

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {get: () => null},
  text: async () => JSON.stringify(body),
});

const credentials = (secret: string | null): CredentialStore => ({
  isAvailable: jest.fn().mockResolvedValue(true),
  put: jest.fn(),
  get: jest.fn().mockResolvedValue(secret),
  delete: jest.fn(),
});

describe('provider transport adapters', () => {
  it('sends an OpenAI responses request with bearer auth and parses output', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, {output_text: 'ok', status: 'completed', usage: {input_tokens: 3, output_tokens: 1}}),
      ) as unknown as ProviderFetch;
    const adapter = new OpenAIProviderTransportAdapter(
      credentials('sk-openai'),
      fetchImpl,
    );
    const result = await adapter.sendChat({
      target: baseTarget({}),
      binding,
      messages,
      signal: new AbortController().signal,
      timeoutMs: 30_000,
    });
    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.headers.Authorization).toBe('Bearer sk-openai');
    expect(JSON.parse(init.body)).toMatchObject({model: 'gpt-4o'});
    expect(result).toEqual({
      text: 'ok',
      finishReason: 'completed',
      usage: {inputTokens: 3, outputTokens: 1},
    });
  });

  it('sends an Anthropic messages request with x-api-key and version header', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, {content: [{type: 'text', text: 'hey'}], stop_reason: 'end_turn', usage: {input_tokens: 2, output_tokens: 4}}),
      ) as unknown as ProviderFetch;
    const adapter = new AnthropicProviderTransportAdapter(
      credentials('sk-ant'),
      fetchImpl,
    );
    const result = await adapter.sendChat({
      target: baseTarget({
        transportAdapterId: 'anthropic',
        protocol: 'anthropic_messages',
        baseURL: 'https://api.anthropic.com/v1',
        chatPath: '/messages',
        auth: {kind: 'header', headerName: 'x-api-key', prefix: ''},
      }),
      binding: {...binding, modelId: 'claude-3-5-sonnet-latest'},
      messages,
      signal: new AbortController().signal,
      timeoutMs: 30_000,
    });
    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-ant');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    expect(JSON.parse(init.body).system).toBe('be terse');
    expect(result.text).toBe('hey');
  });

  it('sends a Gemini request with the model in the path and x-goog-api-key', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, {candidates: [{content: {parts: [{text: 'yo'}]}, finishReason: 'STOP'}], usageMetadata: {promptTokenCount: 1, candidatesTokenCount: 1}}),
      ) as unknown as ProviderFetch;
    const adapter = new GeminiProviderTransportAdapter(
      credentials('goog-key'),
      fetchImpl,
    );
    const result = await adapter.sendChat({
      target: baseTarget({
        transportAdapterId: 'gemini',
        protocol: 'gemini_generate_content',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        chatPath: '/models/{modelId}:generateContent',
        auth: {kind: 'header', headerName: 'x-goog-api-key', prefix: ''},
      }),
      binding: {...binding, modelId: 'gemini-1.5-pro'},
      messages,
      signal: new AbortController().signal,
      timeoutMs: 30_000,
    });
    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
    );
    expect(init.headers['x-goog-api-key']).toBe('goog-key');
    expect(result.text).toBe('yo');
  });

  it('fails an adapter/protocol mismatch before performing any I/O', async () => {
    const fetchImpl = jest.fn() as unknown as ProviderFetch;
    const adapter = new OpenAIProviderTransportAdapter(
      credentials('sk'),
      fetchImpl,
    );
    await expect(
      adapter.sendChat({
        target: baseTarget({transportAdapterId: 'anthropic'}),
        binding,
        messages,
        signal: new AbortController().signal,
        timeoutMs: 30_000,
      }),
    ).rejects.toThrow('provider_transport_adapter_mismatch');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never serializes an authorization value on the immutable target', () => {
    const target = baseTarget({});
    expect(JSON.stringify(target)).not.toContain('sk-openai');
    expect(JSON.stringify(target)).not.toContain('Authorization');
  });

  it('maps a 401 to a stable sanitized auth failure', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(401, {error: 'nope'})) as unknown as ProviderFetch;
    const adapter = new OpenAIProviderTransportAdapter(
      credentials('sk'),
      fetchImpl,
    );
    await expect(
      adapter.sendChat({
        target: baseTarget({}),
        binding,
        messages,
        signal: new AbortController().signal,
        timeoutMs: 30_000,
      }),
    ).rejects.toThrow('provider_transport_auth_failed');
  });

  it('aborts the underlying request on caller cancellation', async () => {
    const controller = new AbortController();
    const fetchImpl = jest.fn(
      (_url: string, init: {signal: AbortSignal}) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    ) as unknown as ProviderFetch;
    const adapter = new CustomProviderTransportAdapter(
      credentials('sk'),
      fetchImpl,
    );
    const promise = adapter.sendChat({
      target: baseTarget({
        transportAdapterId: 'custom',
        protocol: 'custom_http_json',
        baseURL: 'https://custom.example/v1',
        chatPath: '/chat',
      }),
      binding,
      messages,
      signal: controller.signal,
      timeoutMs: 30_000,
    });
    controller.abort();
    await expect(promise).rejects.toThrow('provider_transport_cancelled');
  });
});
