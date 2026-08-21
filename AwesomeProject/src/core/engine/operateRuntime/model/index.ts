// Model provider foundation barrel (Task 4A).
export * from './ModelProviderContracts';
export {
  createModelProviderRegistry,
  BUILT_IN_REGISTRATIONS,
  type ModelProviderRegistryDependencies,
} from './ModelProviderRegistry';
export {
  ProviderModelCatalogService,
  type ProviderModelCatalogServiceDependencies,
} from './ProviderModelCatalogService';
export {
  AsyncStorageModelCatalogCache,
  MODEL_CATALOG_CACHE_KEY,
  type AsyncStorageLike as ModelCatalogCacheStorage,
} from './ModelCatalogCache';
export {
  PROVIDER_CAPABILITY_CATALOG_V1,
  validateProviderCapabilityCatalogV1,
  REGISTRY_VERSION,
  CATALOG_SCHEMA_VERSION,
} from './staticCatalog/ProviderCapabilityCatalogV1';
export {OpenAIProviderTransportAdapter} from './transports/OpenAIProviderTransportAdapter';
export {AnthropicProviderTransportAdapter} from './transports/AnthropicProviderTransportAdapter';
export {GeminiProviderTransportAdapter} from './transports/GeminiProviderTransportAdapter';
export {CustomProviderTransportAdapter} from './transports/CustomProviderTransportAdapter';
export {
  ProviderTransportError,
  type ProviderFetch,
  type FetchResponseLike,
} from './transports/providerHttp';
