import type {ModelListKey} from '../../shared/types/Model';
import type {
  ModelCatalogRefreshInput,
  ModelCatalogViewState,
  ModelConfigApplicationPort,
  ModelConfigFacade,
  ModelConfigListViewState,
  ModelConfigSaveInput,
  ModelConfigViewState,
} from './UiRuntimeContracts';

export class DefaultModelConfigFacade implements ModelConfigFacade {
  private readonly latestGeneration = new Map<string, number>();

  constructor(private readonly port: ModelConfigApplicationPort) {}

  getListViewState(list: ModelListKey): Promise<ModelConfigListViewState> {
    return this.port.readList(list);
  }

  getViewState(input: {
    list: ModelListKey;
    bindingId?: string;
  }): Promise<ModelConfigViewState> {
    return this.port.read(input);
  }

  async refreshCatalog(
    input: ModelCatalogRefreshInput,
  ): Promise<ModelCatalogViewState> {
    const key = this.catalogKey(input.list, input.bindingId);
    const generation = input.requestGeneration;
    const previous = this.latestGeneration.get(key);
    if (previous === undefined || generation > previous) {
      this.latestGeneration.set(key, generation);
    }
    const result = await this.port.fetchCatalog(input);
    const latest = this.latestGeneration.get(key);
    if (latest !== undefined && latest > generation) {
      return {requestGeneration: generation, status: 'stale', models: []};
    }
    return result;
  }

  save(input: ModelConfigSaveInput): Promise<ModelConfigViewState> {
    return this.port.save(input);
  }

  selectBinding(input: {
    list: ModelListKey;
    bindingId: string;
    expectedRevision: number;
  }): Promise<ModelConfigListViewState> {
    return this.port.selectBinding(input);
  }

  deleteBinding(input: {
    list: ModelListKey;
    bindingId: string;
    expectedRevision: number;
  }): Promise<ModelConfigListViewState> {
    return this.port.deleteBinding(input);
  }

  private catalogKey(list: ModelListKey, bindingId?: string): string {
    return `${list}::${bindingId ?? ''}`;
  }
}
