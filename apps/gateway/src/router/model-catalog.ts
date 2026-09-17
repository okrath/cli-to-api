import { AdapterRegistry, globalAdapterRegistry } from "../adapters/registry.js";
import type { ModelTier } from "../adapters/schema.js";
import { sqlite } from "../db/index.js";

export interface OpenAiModelObject {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  permission: Array<{
    id: string;
    object: "model_permission";
    created: number;
    allow_create_engine: boolean;
    allow_sampling: boolean;
    allow_logprobs: boolean;
    allow_search_indices: boolean;
    allow_view: boolean;
    allow_fine_tuning: boolean;
    organization: string;
    group: null;
    is_blocking: boolean;
  }>;
  root: string;
  parent: null;
  meta: {
    provider?: string;
    tier?: ModelTier | "virtual" | "pipeline";
    context_window?: number;
    cost_weight?: number;
    is_virtual?: boolean;
    is_group?: boolean;
    default_effort?: string;
    targets_count?: number;
    description?: string;
  };
}

export class ModelCatalog {
  constructor(private registry: AdapterRegistry = globalAdapterRegistry) {}

  public getOpenAiModelsList(installedOnly = true, includeLegacyAuto = false): { object: "list"; data: OpenAiModelObject[] } {
    const now = Math.floor(Date.now() / 1000);
    const result: OpenAiModelObject[] = [];
    const seenIds = new Set<string>();

    const activeAdapters = installedOnly
      ? this.registry.getAllAdapters().filter((a) => (a.resolvedExecutable.isInstalled ?? Boolean(a.resolvedExecutable.resolvedPath)))
      : this.registry.getAllAdapters();
    const activeAdapterIds = new Set(activeAdapters.map((a) => a.config.id));

    // 1. Add User-Defined Routing Groups / Pipelines from SQLite
    try {
      const pipelineRows = sqlite
        .prepare(
          `SELECT p.*, count(t.id) as targets_count 
           FROM routing_pipelines p 
           LEFT JOIN pipeline_targets t ON t.pipeline_id = p.id AND t.is_enabled = 1 
           WHERE p.is_enabled = 1 
           GROUP BY p.id`
        )
        .all() as Array<{
          id: string;
          name: string;
          description: string | null;
          virtual_model_id: string;
          default_effort_level: string;
          fallback_policy: string;
          targets_count: number;
        }>;

      for (const row of pipelineRows) {
        if (!seenIds.has(row.virtual_model_id)) {
          seenIds.add(row.virtual_model_id);
          result.push(
            this.createModelObject(row.virtual_model_id, now, "custom-group", {
              tier: "virtual",
              is_virtual: true,
              is_group: true,
              default_effort: row.default_effort_level,
              targets_count: Number(row.targets_count),
              description: row.description || `Routing group '${row.name}' (Default Effort: ${row.default_effort_level})`,
            })
          );
        }

        if (row.id !== row.virtual_model_id && !seenIds.has(row.id)) {
          seenIds.add(row.id);
          result.push(
            this.createModelObject(row.id, now, "custom-group", {
              tier: "virtual",
              is_virtual: true,
              is_group: true,
              default_effort: row.default_effort_level,
              targets_count: Number(row.targets_count),
              description: row.description || `Routing group alias for '${row.name}'`,
            })
          );
        }
      }
    } catch {
      // Table might not exist yet during early tests before migrations
    }

    // 2. Add Virtual Auto Tier models ONLY if explicitly requested via includeLegacyAuto
    if (includeLegacyAuto) {
      const virtualTiers = [
        { id: "auto", tier: "virtual" as const, desc: "Global load balancing across all healthy providers & models" },
        { id: "auto-low", tier: "low" as const, desc: "Automatically balance across low-cost, fast response models (Haiku, Flash, Mini)" },
        { id: "auto-medium", tier: "medium" as const, desc: "Automatically balance across medium balanced models (Sonnet, GPT-4o)" },
        { id: "auto-high", tier: "high" as const, desc: "Automatically balance across high intelligence reasoning models (Opus, GPT-5.6)" },
        { id: "auto-xhigh", tier: "xhigh" as const, desc: "Automatically balance across extreme reasoning models (GPT-5.6 Asta, o3-high)" },
      ];

      for (const vt of virtualTiers) {
        if (!seenIds.has(vt.id)) {
          seenIds.add(vt.id);
          result.push(
            this.createModelObject(vt.id, now, "system", {
              tier: vt.tier,
              is_virtual: true,
              description: vt.desc,
            })
          );
        }
      }
    }
    // 3. Add Namespaced models for active adapters only
    const allCatalogModels = this.registry.getAllCatalogModels();

    for (const entry of allCatalogModels) {
      if (installedOnly && !activeAdapterIds.has(entry.adapterId)) {
        continue;
      }

      // Full namespaced model: e.g. "claude-code/opus" or "codex-cli/gpt-5.6-sol"
      if (!seenIds.has(entry.fullModelId)) {
        seenIds.add(entry.fullModelId);
        result.push(this.createModelObject(entry.fullModelId, now, entry.adapterId, {
          provider: entry.adapterId,
          tier: entry.model.tier,
          context_window: entry.model.context_window,
          cost_weight: entry.model.cost_weight,
          is_virtual: false,
        }));
      }

      // Short namespaced alias: e.g. "claude/opus", "claude/sonnet", "codex/gpt-5.6-sol"
      const shortPrefix = entry.adapterId.replace(/-(?:cli|code)$/, "");
      const shortModelId = `${shortPrefix}/${entry.model.id}`;
      if (!seenIds.has(shortModelId)) {
        seenIds.add(shortModelId);
        result.push(this.createModelObject(shortModelId, now, entry.adapterId, {
          provider: entry.adapterId,
          tier: entry.model.tier,
          context_window: entry.model.context_window,
          cost_weight: entry.model.cost_weight,
          is_virtual: false,
        }));
      }

      // 4. Add Flat aliases if marked is_default
      const isDefault = entry.model.is_default;
      if (isDefault && !seenIds.has(entry.model.id)) {
        seenIds.add(entry.model.id);
        result.push(this.createModelObject(entry.model.id, now, entry.adapterId, {
          provider: entry.adapterId,
          tier: entry.model.tier,
          context_window: entry.model.context_window,
          cost_weight: entry.model.cost_weight,
          is_virtual: false,
          description: `Flat alias defaulting to ${shortModelId}`,
        }));
      }
    }

    return { object: "list", data: result };
  }

  public getModelsByTier(tier: string, installedOnly = true) {
    const all = this.registry.getModelsByTier(tier as ModelTier | "all");
    if (!installedOnly) return all;
    const activeAdapterIds = new Set(
      this.registry.getAllAdapters()
        .filter((a) => (a.resolvedExecutable.isInstalled ?? Boolean(a.resolvedExecutable.resolvedPath)))
        .map((a) => a.config.id)
    );
    return all.filter((m) => activeAdapterIds.has(m.adapterId));
  }

  public getAdapter(adapterId: string) {
    const direct = this.registry.getAdapter(adapterId);
    if (direct) return direct;

    // Match short alias: e.g. "claude" -> "claude-code", "codex" -> "codex-cli"
    const all = this.registry.getAllAdapters();
    return all.find(
      (a) =>
        a.config.id === `${adapterId}-code` ||
        a.config.id === `${adapterId}-cli` ||
        a.config.id.startsWith(adapterId)
    );
  }

  public getDefaultProviderForModel(modelId: string): string | undefined {
    const direct = this.registry.getDefaultProviderForModel(modelId);
    if (direct) return direct;

    // Check if any adapter models match id
    for (const a of this.registry.getAllAdapters()) {
      if (a.config.models.some((m) => m.id === modelId)) {
        return a.config.id;
      }
    }
    return undefined;
  }

  private createModelObject(
    id: string,
    created: number,
    ownedBy: string,
    meta: OpenAiModelObject["meta"]
  ): OpenAiModelObject {
    return {
      id,
      object: "model",
      created,
      owned_by: ownedBy,
      permission: [
        {
          id: `modelperm-${id}`,
          object: "model_permission",
          created,
          allow_create_engine: false,
          allow_sampling: true,
          allow_logprobs: true,
          allow_search_indices: false,
          allow_view: true,
          allow_fine_tuning: false,
          organization: "*",
          group: null,
          is_blocking: false,
        },
      ],
      root: id,
      parent: null,
      meta,
    };
  }
}

export const globalModelCatalog = new ModelCatalog();
