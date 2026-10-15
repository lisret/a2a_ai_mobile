import {mapProviderCatalog} from '../../../features/model/services/ModelListService';
import {DefaultModelConfigFacade} from '../../../application/facades/ModelConfigFacade';
import type {
  ModelCatalogRefreshInput,
  ModelCatalogViewState,
  ModelConfigApplicationPort,
} from '../../../application/facades/UiRuntimeContracts';
import type {
  ProviderModelCatalogResult,
  ProviderModelDescriptor,
} from '../../../core/engine/operateRuntime/model/ModelProviderContracts';

const descriptor = (id: string): ProviderModelDescriptor => ({
  id,
  displayName: id,
  inputModalities: ['text'],
  outputModalities: ['text'],
  capabilities: {chat: true, vision: 'unknown', toolCalls: 'unknown', reasoning: 'unknown'},
  contextWindow: null,
  maxOutputTokens: null,
  metadataSource: 'remote',
});

describe('mapProviderCatalog (UI-only narrow mapper)', () => {
  it('maps a fresh ready result to ready with {id,label} models', () => {
    const result: ProviderModelCatalogResult = {
      status: 'ready',
      models: [descriptor('gpt-4o'), descriptor('gpt-4o-mini')],
      source: 'remote',
      stale: false,
      manualModelIdAllowed: true,
    };
    const view = mapProviderCatalog(result, 7);
    expect(view.status).toBe('ready');
    expect(view.requestGeneration).toBe(7);
    expect(view.models).toEqual([
      {id: 'gpt-4o', label: 'gpt-4o'},
      {id: 'gpt-4o-mini', label: 'gpt-4o-mini'},
    ]);
  });

  it('maps a stale ready result to the UI stale status', () => {
    const result: ProviderModelCatalogResult = {
      status: 'ready',
      models: [descriptor('claude-3-5')],
      source: 'cache',
      stale: true,
      manualModelIdAllowed: true,
    };
    expect(mapProviderCatalog(result, 1).status).toBe('stale');
  });

  it('maps unsupported / auth_failed / network_failed / empty distinctly', () => {
    expect(
      mapProviderCatalog(
        {status: 'unsupported', models: [], source: 'none', manualModelIdAllowed: true},
        1,
      ).status,
    ).toBe('unsupported');
    expect(
      mapProviderCatalog(
        {status: 'auth_failed', models: [], manualModelIdAllowed: true},
        1,
      ).status,
    ).toBe('auth_failed');
    expect(
      mapProviderCatalog(
        {status: 'network_failed', models: [], manualModelIdAllowed: true},
        1,
      ).status,
    ).toBe('network_failed');
    expect(
      mapProviderCatalog(
        {status: 'empty', models: [], manualModelIdAllowed: true},
        1,
      ).status,
    ).toBe('empty');
  });

  it('surfaces signed-static candidates on unsupported so manual entry is still guided', () => {
    const result: ProviderModelCatalogResult = {
      status: 'unsupported',
      models: [descriptor('glm-4.5')],
      source: 'signed_static',
      manualModelIdAllowed: true,
    };
    const view = mapProviderCatalog(result, 3);
    expect(view.status).toBe('unsupported');
    expect(view.models).toEqual([{id: 'glm-4.5', label: 'glm-4.5'}]);
  });
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return {promise, resolve};
}

describe('catalog request race through the facade', () => {
  it('keeps only the latest generation and marks the slower earlier request stale', async () => {
    const openai = deferred<ModelCatalogViewState>();
    const anthropic = deferred<ModelCatalogViewState>();
    const queue = [openai.promise, anthropic.promise];

    const port: ModelConfigApplicationPort = {
      read: jest.fn(),
      readList: jest.fn(),
      save: jest.fn(),
      selectBinding: jest.fn(),
      deleteBinding: jest.fn(),
      fetchCatalog: jest.fn((_input: ModelCatalogRefreshInput) =>
        queue.shift()!,
      ),
    } as unknown as ModelConfigApplicationPort;

    const facade = new DefaultModelConfigFacade(port);

    const base = {
      list: 'unified' as const,
      mode: 'preset' as const,
      baseUrlOverride: null,
      credential: {action: 'keep'} as const,
    };
    const first = facade.refreshCatalog({
      ...base,
      presetId: 'openai',
      requestGeneration: 1,
    });
    const second = facade.refreshCatalog({
      ...base,
      presetId: 'anthropic',
      requestGeneration: 2,
    });

    // Anthropic (newer generation) resolves first, then OpenAI (older) resolves.
    anthropic.resolve(
      mapProviderCatalog(
        {
          status: 'ready',
          models: [descriptor('claude-3-5-sonnet')],
          source: 'remote',
          stale: false,
          manualModelIdAllowed: true,
        },
        2,
      ),
    );
    openai.resolve(
      mapProviderCatalog(
        {
          status: 'ready',
          models: [descriptor('gpt-4o')],
          source: 'remote',
          stale: false,
          manualModelIdAllowed: true,
        },
        1,
      ),
    );

    const secondView = await second;
    const firstView = await first;

    expect(secondView.status).toBe('ready');
    expect(secondView.models).toEqual([
      {id: 'claude-3-5-sonnet', label: 'claude-3-5-sonnet'},
    ]);
    // The slower, superseded OpenAI request must not overwrite the UI.
    expect(firstView.status).toBe('stale');
    expect(firstView.models).toEqual([]);
  });
});
