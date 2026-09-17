import { LoadedAdapter } from "./loader.js";
import { AdapterModel, ModelTier } from "./schema.js";

export interface CatalogModelEntry {
  adapterId: string;
  adapterName: string;
  model: AdapterModel;
  fullModelId: string; // "adapterId/modelId"
}

export class AdapterRegistry {
  private adapters = new Map<string, LoadedAdapter>();

  public register(loaded: LoadedAdapter): void {
    this.adapters.set(loaded.config.id, loaded);
  }

  public registerAll(list: LoadedAdapter[]): void {
    for (const item of list) {
      this.register(item);
    }
  }

  public getAdapter(id: string): LoadedAdapter | undefined {
    return this.adapters.get(id);
  }

  public getAllAdapters(): LoadedAdapter[] {
    return Array.from(this.adapters.values());
  }

  public getAllCatalogModels(): CatalogModelEntry[] {
    const list: CatalogModelEntry[] = [];
    for (const adapter of this.adapters.values()) {
      for (const m of adapter.config.models) {
        list.push({
          adapterId: adapter.config.id,
          adapterName: adapter.config.name,
          model: m,
          fullModelId: `${adapter.config.id}/${m.id}`,
        });
      }
    }
    return list;
  }

  public getModelsByTier(tier: ModelTier | "all"): CatalogModelEntry[] {
    const all = this.getAllCatalogModels();
    if (tier === "all") return all;
    return all.filter(item => item.model.tier === tier);
  }

  public getDefaultProviderForModel(modelId: string): string | undefined {
    // 1. Direct search for model where is_default is true
    for (const adapter of this.adapters.values()) {
      const match = adapter.config.models.find(m => m.id === modelId && m.is_default);
      if (match) return adapter.config.id;
    }

    // 2. Search for any model matching modelId
    for (const adapter of this.adapters.values()) {
      const match = adapter.config.models.find(m => m.id === modelId);
      if (match) return adapter.config.id;
    }

    return undefined;
  }
}

export const globalAdapterRegistry = new AdapterRegistry();
