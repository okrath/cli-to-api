import { ModelCatalog, globalModelCatalog } from "./model-catalog.js";
import { globalAccountPool } from "./account-pool.js";
import { globalPipelineStore } from "./pipeline-store.js";
import { globalSwrrBalancer } from "./swrr-balancer.js";
import type { PipelineExecutionCandidate } from "./pipeline-executor.js";
import type { AdapterConfig } from "../adapters/schema.js";
import type { EffortLevel } from "../db/schema.js";
import { db } from "../db/index.js";
import { accounts } from "../db/schema.js";
import { eq, and, or, lte } from "drizzle-orm";

export interface ResolvedTarget {
  adapter: AdapterConfig;
  account: {
    id: string;
    sandboxDir: string;
    maxSlots?: number;
  };
  actualModelId: string;
  debugProvider: string;
  debugModelTier: string;
  effectiveEffort?: EffortLevel | null;
  pipelineId?: string;
  pipelineCandidates?: PipelineExecutionCandidate[];
}

export class LoadBalancer {
  constructor(private catalog: ModelCatalog = globalModelCatalog) {}

  public async resolveTarget(
    requestedModel: string,
    pinnedAccountId?: string,
    requestEffort?: EffortLevel | null
  ): Promise<ResolvedTarget> {
    const now = Math.floor(Date.now() / 1000);

    // 0. User-Defined Routing Groups / Dynamic Pipelines
    const pipeline =
      (await globalPipelineStore.getPipelineByVirtualModel(requestedModel)) ||
      (await globalPipelineStore.getPipeline(requestedModel));

    if (pipeline && pipeline.isEnabled) {
      return this.resolvePipelineTarget(pipeline, pinnedAccountId, requestEffort, now);
    }

    // 1. Virtual Auto Tiers: auto, auto-low, auto-medium, auto-high, auto-xhigh
    if (requestedModel.startsWith("auto")) {
      const tier = requestedModel === "auto" ? "all" : requestedModel.replace("auto-", "");
      const candidateModels = this.catalog.getModelsByTier(tier);

      if (candidateModels.length === 0) {
        throw new Error(`404: No active models declared matching virtual tier '${requestedModel}'`);
      }

      // Collect healthy accounts across eligible models
      const pool: Array<{
        adapterConfig: AdapterConfig;
        accountRecord: typeof accounts.$inferSelect;
        modelId: string;
        modelTier: string;
      }> = [];

      for (const item of candidateModels) {
        const loaded = this.catalog.getAdapter(item.adapterId);
        if (!loaded) continue;

        const healthyAccounts = await this.getHealthyAccounts(item.adapterId, now);
        for (const acc of healthyAccounts) {
          pool.push({
            adapterConfig: loaded.config,
            accountRecord: acc,
            modelId: item.model.id,
            modelTier: item.model.tier,
          });
        }
      }

      if (pool.length === 0) {
        const resetIn = await this.getEarliestCooldownReset(candidateModels.map((c) => c.adapterId));
        throw new Error(`429: All accounts for virtual tier '${requestedModel}' are busy or in cooldown (resets in ${resetIn}s)`);
      }

      // Least-Connections selection with latency tiebreaker
      pool.sort((a, b) => {
        const activeA = globalAccountPool.getActiveSlots(a.accountRecord.id);
        const activeB = globalAccountPool.getActiveSlots(b.accountRecord.id);
        if (activeA !== activeB) return activeA - activeB;
        return a.accountRecord.avgLatencyMs - b.accountRecord.avgLatencyMs;
      });

      const chosen = pool[0];
      return {
        adapter: chosen.adapterConfig,
        account: {
          id: chosen.accountRecord.id,
          sandboxDir: chosen.accountRecord.sandboxDir,
          maxSlots: chosen.accountRecord.maxSlots,
        },
        actualModelId: chosen.modelId,
        debugProvider: chosen.adapterConfig.id,
        debugModelTier: chosen.modelTier,
        effectiveEffort: requestEffort || null,
      };
    }

    // 2. Namespaced Targeting: "provider/model" (e.g. "codex-cli/gpt-5.6-asta")
    if (requestedModel.includes("/")) {
      const [rawProvider, rawModel] = requestedModel.split("/");
      const loaded = this.catalog.getAdapter(rawProvider);
      if (!loaded) {
        throw new Error(`404: Unknown provider namespace '${rawProvider}'`);
      }
      const isInstalled = loaded.resolvedExecutable.isInstalled ?? Boolean(loaded.resolvedExecutable.resolvedPath);
      if (!isInstalled) {
        throw new Error(`404: Provider '${rawProvider}' executable '${loaded.config.executable}' is not installed on host PATH`);
      }

      const providerId = loaded.config.id;
      let effectiveModelId = rawModel;

      // Model name normalization and prefix stripping per CLI
      if (providerId === "claude-code") {
        if (rawModel === "opus" || rawModel === "claude-3-opus") {
          effectiveModelId = "opus";
        } else if (rawModel === "sonnet" || rawModel === "claude-3-7-sonnet") {
          effectiveModelId = "sonnet";
        } else if (rawModel === "haiku" || rawModel === "claude-3-5-haiku") {
          effectiveModelId = "haiku";
        }
      } else if (providerId === "codex-cli") {
        if (rawModel === "gpt-5.6" || rawModel === "gpt-5.6-asta" || rawModel === "gpt-5.6-sol" || rawModel === "sol") {
          effectiveModelId = "gpt-5.6-sol";
        } else if (rawModel === "gpt-4o" || rawModel === "gpt-5.6-terra" || rawModel === "terra") {
          effectiveModelId = "gpt-5.6-terra";
        } else if (rawModel === "gpt-4o-mini" || rawModel === "gpt-5.6-luna" || rawModel === "luna") {
          effectiveModelId = "gpt-5.6-luna";
        } else if (rawModel === "gpt-5.5") {
          effectiveModelId = "gpt-5.5";
        } else if (rawModel === "gpt-6-astra" || rawModel === "astra") {
          effectiveModelId = "gpt-6-astra";
        }
      }

      const modelMeta = loaded.config.models.find((m) => m.id === effectiveModelId) || loaded.config.models.find((m) => m.id === rawModel);
      const tier = modelMeta?.tier || "medium";

      const healthy = await this.getHealthyAccounts(providerId, now);
      if (healthy.length === 0) {
        const resetIn = await this.getEarliestCooldownReset([providerId]);
        throw new Error(`429: All accounts for provider '${providerId}' are busy or in cooldown (resets in ${resetIn}s)`);
      }

      let chosen = pinnedAccountId ? healthy.find((a) => a.id === pinnedAccountId) : undefined;
      if (!chosen) {
        // Least-Connections sort
        healthy.sort((a, b) => {
          const activeA = globalAccountPool.getActiveSlots(a.id);
          const activeB = globalAccountPool.getActiveSlots(b.id);
          if (activeA !== activeB) return activeA - activeB;
          return a.avgLatencyMs - b.avgLatencyMs;
        });
        chosen = healthy[0];
      }
      return {
        adapter: loaded.config,
        account: {
          id: chosen.id,
          sandboxDir: chosen.sandboxDir,
          maxSlots: chosen.maxSlots,
        },
        actualModelId: effectiveModelId,
        debugProvider: providerId,
        debugModelTier: tier,
        effectiveEffort: requestEffort || null,
      };
    }

    // 3. Direct Adapter ID as Model (e.g. "my-cli" or "agy")
    const directAdapter = this.catalog.getAdapter(requestedModel);
    if (directAdapter) {
      const defaultModel = directAdapter.config.models.find((m) => m.is_default) || directAdapter.config.models[0];
      if (defaultModel) {
        return this.resolveTarget(`${directAdapter.config.id}/${defaultModel.id}`, pinnedAccountId, requestEffort);
      }
    }

    // 4. Flat Aliases: "gpt-5.6-asta" -> lookup default provider
    const defaultProvider = this.catalog.getDefaultProviderForModel(requestedModel);
    if (!defaultProvider) {
      throw new Error(`404: Unknown model '${requestedModel}'. Please specify provider namespace (e.g. codex-cli/${requestedModel})`);
    }

    return this.resolveTarget(`${defaultProvider}/${requestedModel}`, pinnedAccountId, requestEffort);
  }

  private async resolvePipelineTarget(
    pipeline: NonNullable<Awaited<ReturnType<typeof globalPipelineStore.getPipeline>>>,
    pinnedAccountId: string | undefined,
    requestEffort: EffortLevel | null | undefined,
    now: number
  ): Promise<ResolvedTarget> {
    const enabledTargets = pipeline.targets.filter((t) => t.isEnabled);
    if (enabledTargets.length === 0) {
      throw new Error(`404: No active targets configured in routing group '${pipeline.name}' (${pipeline.id})`);
    }

    // Group targets by priorityTier ascending (1 = P0, 2 = P1, 3 = P2)
    const tiersMap = new Map<number, typeof enabledTargets>();
    for (const t of enabledTargets) {
      const list = tiersMap.get(t.priorityTier) || [];
      list.push(t);
      tiersMap.set(t.priorityTier, list);
    }

    const sortedTiers = Array.from(tiersMap.keys()).sort((a, b) => a - b);
    const allExecutionCandidates: PipelineExecutionCandidate[] = [];

    for (const tierNum of sortedTiers) {
      const targetsInTier = tiersMap.get(tierNum) || [];
      const tierCandidates: PipelineExecutionCandidate[] = [];

      for (const target of targetsInTier) {
        const loaded = this.catalog.getAdapter(target.adapterId);
        if (!loaded) continue;

        const isInstalled = loaded.resolvedExecutable.isInstalled ?? Boolean(loaded.resolvedExecutable.resolvedPath);
        if (!isInstalled) continue;

        // Resolve 3-tier Context-Aware Effort for this target
        const effectiveEffort: EffortLevel | null =
          requestEffort ?? target.effortOverride ?? pipeline.defaultEffortLevel ?? "medium";

        // If targeted by specific account (must match targetKind and adapterId)
        const isSpecificAccount = target.targetKind === "ACCOUNT" && Boolean(target.targetAccountId);
        if (isSpecificAccount) {
          const specificAccs = await db.select().from(accounts).where(
            and(
              eq(accounts.id, target.targetAccountId!),
              eq(accounts.adapterId, target.adapterId),
              or(
                eq(accounts.status, "READY"),
                and(eq(accounts.status, "COOLDOWN"), lte(accounts.cooldownUntil, now))
              )
            )
          );

          if (specificAccs.length > 0) {
            const acc = specificAccs[0];
            tierCandidates.push({
              targetId: target.id,
              pipelineId: pipeline.id,
              adapterConfig: loaded.config,
              account: {
                id: acc.id,
                sandboxDir: acc.sandboxDir,
              },
              modelId: target.modelId,
              effectiveEffort,
              priorityTier: target.priorityTier,
            });
          }
        } else {
          // Targeted by CLI or Model -> query all healthy accounts for adapter
          const healthyAccs = await this.getHealthyAccounts(target.adapterId, now);
          for (const acc of healthyAccs) {
            tierCandidates.push({
              targetId: target.id,
              pipelineId: pipeline.id,
              adapterConfig: loaded.config,
              account: {
                id: acc.id,
                sandboxDir: acc.sandboxDir,
              },
              modelId: target.modelId,
              effectiveEffort,
              priorityTier: target.priorityTier,
            });
          }
        }
      }

      if (tierCandidates.length > 0) {
        // Apply SWRR selection to pick primary candidate in this tier
        const swrrItems = tierCandidates.map((c, idx) => {
          const targetConfig = targetsInTier.find((t) => t.id === c.targetId);
          return {
            id: `${c.targetId}:${c.account.id}`,
            weight: targetConfig?.weight ?? 100,
            index: idx,
          };
        });

        const selectedItem = globalSwrrBalancer.select(swrrItems);
        const primaryCandidate = selectedItem ? tierCandidates[selectedItem.index] : tierCandidates[0];

        // Put primary candidate first, followed by others
        const remainingInTier = tierCandidates.filter((c) => c !== primaryCandidate);
        // Sort remaining by active slots / latency
        remainingInTier.sort((a, b) => {
          const activeA = globalAccountPool.getActiveSlots(a.account.id);
          const activeB = globalAccountPool.getActiveSlots(b.account.id);
          return activeA - activeB;
        });

        allExecutionCandidates.push(primaryCandidate, ...remainingInTier);
      }
    }

    if (allExecutionCandidates.length === 0) {
      const adapterIds = Array.from(new Set(enabledTargets.map((t) => t.adapterId)));
      const resetIn = await this.getEarliestCooldownReset(adapterIds);
      throw new Error(
        `429: All accounts for routing group '${pipeline.name}' are busy or in cooldown (resets in ${resetIn}s)`
      );
    }

    let chosenCandidate = pinnedAccountId
      ? allExecutionCandidates.find((c) => c.account.id === pinnedAccountId)
      : undefined;

    if (!chosenCandidate) {
      chosenCandidate = allExecutionCandidates[0];
    }

    return {
      adapter: chosenCandidate.adapterConfig,
      account: chosenCandidate.account,
      actualModelId: chosenCandidate.modelId,
      debugProvider: chosenCandidate.adapterConfig.id,
      debugModelTier: "pipeline",
      effectiveEffort: chosenCandidate.effectiveEffort,
      pipelineId: pipeline.id,
      pipelineCandidates: allExecutionCandidates,
    };
  }

  private async getHealthyAccounts(adapterId: string, now: number) {
    return db.select().from(accounts).where(
      and(
        eq(accounts.adapterId, adapterId),
        or(
          eq(accounts.status, "READY"),
          and(eq(accounts.status, "COOLDOWN"), lte(accounts.cooldownUntil, now))
        )
      )
    );
  }

  private async getEarliestCooldownReset(adapterIds: string[]): Promise<number> {
    const list = await db.select().from(accounts).where(eq(accounts.status, "COOLDOWN"));
    const relevant = list.filter((a) => adapterIds.includes(a.adapterId));
    if (relevant.length === 0) return 60;
    const now = Math.floor(Date.now() / 1000);
    const resets = relevant.map((a) => Math.max(1, (a.cooldownUntil || now + 60) - now));
    return Math.min(...resets);
  }
}

export const globalLoadBalancer = new LoadBalancer();
