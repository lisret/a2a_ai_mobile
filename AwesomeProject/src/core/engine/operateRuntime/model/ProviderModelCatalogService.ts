// Account-scoped remote enumeration with signed-static fallback and terminal states.
import type {CredentialStore} from '../contracts/CredentialStore';
import type {
  ModelCatalogCache,
  ModelEndpointProfileV1,
  ProviderModelCatalogPort,
  ProviderModelCatalogResult,
  ProviderModelDescriptor,
  ProviderPresetV1,
  ProviderProtocolV1,
  ProviderRegistrationV1,
} from './ModelProviderContracts';
import {
  CATALOG_SCHEMA_VERSION,
  PROVIDER_CAPABILITY_CATALOG_V1,
  REGISTRY_VERSION,
  type SignedProviderCatalogEntryV1,
} from './staticCatalog/ProviderCapabilityCatalogV1';
import {
  CATALOG_RESPONSE_CAP_BYTES,
  ProviderTransportError,
  type ProviderFetch,
  applyAuth,
  requestJson,
  resolveEndpointUrl,
} from './transports/providerHttp';

export interface ProviderModelCatalogServiceDependencies {
  readonly registrations: readonly ProviderRegistrationV1[];
  readonly credentials: CredentialStore;
  readonly fetchImpl: ProviderFetch;
  readonly cache: ModelCatalogCache;
  readonly now: () => number;
}

const MAX_PAGES = 100;
const PER_PAGE_TIMEOUT_MS = 10_000;
const TOTAL_TIMEOUT_MS = 30_000;

const unknownCaps: ProviderModelDescriptor['capabilities'] = {
  chat: 'unknown',
  vision: 'unknown',
  toolCalls: 'unknown',
  reasoning: 'unknown',
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

type CatalogStrategy =
  | {kind: 'unsupported'; candidates: readonly ProviderModelDescriptor[]}
  | {
      kind: 'remote';
      baseURL: string;
      modelListPath: string;
      protocol: ProviderProtocolV1;
      auth: ProviderRegistrationV1['auth'];
      pagination: ProviderRegistrationV1['catalog']['pagination'];
      signed: SignedProviderCatalogEntryV1 | null;
    };

export class ProviderModelCatalogService implements ProviderModelCatalogPort {
  private readonly latestGeneration = new Map<string, number>();

  constructor(
    private readonly deps: ProviderModelCatalogServiceDependencies,
  ) {}

  async listModels(request: {
    profile: ModelEndpointProfileV1;
    signal: AbortSignal;
    timeoutMs: number;
    requestGeneration: number;
  }): Promise<ProviderModelCatalogResult> {
    const {profile, signal, requestGeneration} = request;
    const previous = this.latestGeneration.get(profile.id) ?? 0;
    if (requestGeneration > previous) {
      this.latestGeneration.set(profile.id, requestGeneration);
    }
    const cacheKey = this.cacheKey(profile);
    const strategy = this.strategyFor(profile);

    if (strategy.kind === 'unsupported') {
      const unsupported: ProviderModelCatalogResult = {
        status: 'unsupported',
        models: strategy.candidates,
        source: strategy.candidates.length > 0 ? 'signed_static' : 'none',
        manualModelIdAllowed: true,
      };
      return unsupported;
    }

    const cached = await this.deps.cache.read(cacheKey);
    if (cached && cached.status === 'ready' && !cached.stale) {
      return cached;
    }

    let result: ProviderModelCatalogResult;
    try {
      result = await this.enumerateRemote(profile, strategy, signal);
    } catch (error) {
      result = this.classifyError(error);
    }

    if (result.status === 'network_failed') {
      const stale = await this.deps.cache.read(cacheKey);
      if (stale && stale.status === 'ready') {
        return stale;
      }
    }

    const durable = result.status === 'ready' || result.status === 'empty';
    if (durable && this.isCurrent(profile.id, requestGeneration)) {
      await this.deps.cache.write(cacheKey, result);
    }
    return result;
  }

  describeManualModel(
    profile: ModelEndpointProfileV1,
    modelId: string,
  ): ProviderModelDescriptor {
    const signed = this.signedEntry(profile);
    const facts = signed?.capabilityById[modelId];
    const descriptor: ProviderModelDescriptor = {
      id: modelId,
      displayName: modelId,
      inputModalities: ['text'],
      outputModalities: ['text'],
      capabilities: facts ?? unknownCaps,
      contextWindow: null,
      maxOutputTokens: null,
      metadataSource: 'manual',
    };
    return Object.freeze(descriptor);
  }

  private isCurrent(profileId: string, generation: number): boolean {
    return (this.latestGeneration.get(profileId) ?? 0) === generation;
  }

  private cacheKey(profile: ModelEndpointProfileV1): string {
    return `${profile.id}:${profile.generation}:${REGISTRY_VERSION}:${CATALOG_SCHEMA_VERSION}`;
  }

  private signedEntry(
    profile: ModelEndpointProfileV1,
  ): SignedProviderCatalogEntryV1 | null {
    if (profile.mode !== 'preset') {
      return null;
    }
    return (
      PROVIDER_CAPABILITY_CATALOG_V1.providers[
        profile.preset as ProviderPresetV1
      ] ?? null
    );
  }

  private strategyFor(profile: ModelEndpointProfileV1): CatalogStrategy {
    if (profile.mode === 'preset') {
      const registration = this.deps.registrations.find(
        item => item.preset === profile.preset,
      );
      if (!registration) {
        throw new ProviderTransportError('model_registry_unknown_preset');
      }
      const signed = this.signedEntry(profile);
      if (
        registration.catalog.kind === 'signed_static' ||
        registration.catalog.modelListPath === null
      ) {
        return {kind: 'unsupported', candidates: signed?.candidates ?? []};
      }
      return {
        kind: 'remote',
        baseURL: profile.baseURLOverride ?? registration.defaultBaseURL,
        modelListPath: registration.catalog.modelListPath,
        protocol: registration.protocol,
        auth: registration.auth,
        pagination: registration.catalog.pagination,
        signed,
      };
    }
    const spec = profile.custom;
    if (spec.modelListPath === null) {
      return {kind: 'unsupported', candidates: []};
    }
    return {
      kind: 'remote',
      baseURL: spec.baseURL,
      modelListPath: spec.modelListPath,
      protocol: spec.protocol,
      auth: spec.auth,
      pagination: 'none',
      signed: null,
    };
  }

  private classifyError(error: unknown): ProviderModelCatalogResult {
    if (
      error instanceof ProviderTransportError &&
      error.code === 'provider_transport_auth_failed'
    ) {
      const authFailed: ProviderModelCatalogResult = {
        status: 'auth_failed',
        models: [],
        manualModelIdAllowed: true,
      };
      return authFailed;
    }
    const networkFailed: ProviderModelCatalogResult = {
      status: 'network_failed',
      models: [],
      manualModelIdAllowed: true,
    };
    return networkFailed;
  }

  private async enumerateRemote(
    profile: ModelEndpointProfileV1,
    strategy: Extract<CatalogStrategy, {kind: 'remote'}>,
    signal: AbortSignal,
  ): Promise<ProviderModelCatalogResult> {
    const secret =
      strategy.auth.kind === 'none'
        ? null
        : await this.resolveSecret(profile.secretRef);
    const start = this.deps.now();
    const seenCursors = new Set<string>();
    const collected = new Map<string, ProviderModelDescriptor>();
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      if (this.deps.now() - start > TOTAL_TIMEOUT_MS) {
        throw new ProviderTransportError('provider_transport_timeout');
      }
      if (cursor !== null) {
        if (seenCursors.has(cursor)) {
          break;
        }
        seenCursors.add(cursor);
      }
      const url = resolveEndpointUrl(strategy.baseURL, strategy.modelListPath);
      const {headers, url: finalUrl} = applyAuth(url, strategy.auth, secret, {
        Accept: 'application/json',
      });
      const paged = this.applyCursor(finalUrl, strategy, cursor);
      const response = await requestJson({
        url: paged,
        method: 'GET',
        headers,
        signal,
        timeoutMs: PER_PAGE_TIMEOUT_MS,
        maxBytes: CATALOG_RESPONSE_CAP_BYTES,
        fetchImpl: this.deps.fetchImpl,
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new ProviderTransportError('provider_transport_auth_failed');
        }
        throw new ProviderTransportError('provider_transport_network_failed');
      }
      const {models, nextCursor} = this.parsePage(strategy.protocol, response.json);
      for (const model of models) {
        if (!collected.has(model.id)) {
          collected.set(model.id, model);
        }
      }
      if (!nextCursor) {
        break;
      }
      cursor = nextCursor;
    }

    const merged = this.mergeSigned([...collected.values()], strategy.signed);
    if (merged.length === 0) {
      const empty: ProviderModelCatalogResult = {
        status: 'empty',
        models: [],
        manualModelIdAllowed: true,
      };
      return empty;
    }
    const ready: ProviderModelCatalogResult = {
      status: 'ready',
      models: merged,
      source: 'remote',
      stale: false,
      manualModelIdAllowed: true,
    };
    return ready;
  }

  private applyCursor(
    url: string,
    strategy: {pagination: ProviderRegistrationV1['catalog']['pagination']},
    cursor: string | null,
  ): string {
    if (!cursor) {
      return url;
    }
    const parsed = new URL(url);
    if (strategy.pagination === 'cursor') {
      parsed.searchParams.set('after_id', cursor);
    } else if (strategy.pagination === 'page_token') {
      parsed.searchParams.set('pageToken', cursor);
    }
    return parsed.toString();
  }

  private parsePage(
    protocol: ProviderProtocolV1,
    json: unknown,
  ): {models: ProviderModelDescriptor[]; nextCursor: string | null} {
    const root = asRecord(json);
    if (protocol === 'gemini_generate_content') {
      const list = Array.isArray(root?.models) ? root!.models : [];
      const models = list
        .map(item => asRecord(item))
        .filter((item): item is Record<string, unknown> => item !== null)
        .map(item => {
          const name = typeof item.name === 'string' ? item.name : '';
          const id = name.replace(/^models\//, '');
          return this.descriptor(
            id,
            typeof item.displayName === 'string' ? item.displayName : id,
          );
        })
        .filter(model => model.id.length > 0);
      const token =
        typeof root?.nextPageToken === 'string' ? root.nextPageToken : null;
      return {models, nextCursor: token};
    }
    const data = Array.isArray(root?.data) ? root!.data : [];
    const models = data
      .map(item => asRecord(item))
      .filter((item): item is Record<string, unknown> => item !== null)
      .map(item =>
        this.descriptor(
          typeof item.id === 'string' ? item.id : '',
          typeof item.display_name === 'string'
            ? item.display_name
            : typeof item.id === 'string'
            ? item.id
            : '',
        ),
      )
      .filter(model => model.id.length > 0);
    const hasMore = root?.has_more === true;
    const lastId = typeof root?.last_id === 'string' ? root.last_id : null;
    return {models, nextCursor: hasMore ? lastId : null};
  }

  private descriptor(id: string, displayName: string): ProviderModelDescriptor {
    return {
      id,
      displayName,
      inputModalities: ['text'],
      outputModalities: ['text'],
      capabilities: {...unknownCaps},
      contextWindow: null,
      maxOutputTokens: null,
      metadataSource: 'remote',
    };
  }

  private mergeSigned(
    remote: ProviderModelDescriptor[],
    signed: SignedProviderCatalogEntryV1 | null,
  ): ProviderModelDescriptor[] {
    if (!signed) {
      return remote;
    }
    return remote.map(model => {
      const facts = signed.capabilityById[model.id];
      if (!facts) {
        return model;
      }
      return {
        ...model,
        capabilities: facts,
        inputModalities:
          facts.vision === true ? ['text', 'image'] : model.inputModalities,
      };
    });
  }

  private async resolveSecret(secretRef: string | null): Promise<string> {
    if (!secretRef) {
      throw new ProviderTransportError('provider_transport_missing_credential');
    }
    let secret: string | null;
    try {
      secret = await this.deps.credentials.get(secretRef);
    } catch {
      throw new ProviderTransportError('provider_transport_network_failed');
    }
    if (!secret) {
      throw new ProviderTransportError('provider_transport_missing_credential');
    }
    return secret;
  }
}
