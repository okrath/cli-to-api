import { db } from "../db/index.js";
import { routingPipelines, pipelineTargets, failoverEvents } from "../db/schema.js";
import type { EffortLevel, TargetKind } from "../db/schema.js";
import { eq, desc, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export interface PipelineTargetConfig {
  id?: string;
  targetKind?: TargetKind;
  priorityTier?: number;
  weight?: number;
  adapterId: string;
  modelId: string;
  targetAccountId?: string | null;
  effortOverride?: EffortLevel | null;
  isEnabled?: boolean;
}

export interface CreatePipelineInput {
  id?: string;
  name: string;
  description?: string;
  virtualModelId?: string;
  defaultEffortLevel?: EffortLevel;
  fallbackPolicy?: "cascade_failover" | "strict_reject";
  maxPipelineDepth?: number;
  isEnabled?: boolean;
  metadataJson?: string;
  targets?: PipelineTargetConfig[];
}

export interface UpdatePipelineInput {
  name?: string;
  description?: string;
  virtualModelId?: string;
  defaultEffortLevel?: EffortLevel;
  fallbackPolicy?: "cascade_failover" | "strict_reject";
  maxPipelineDepth?: number;
  isEnabled?: boolean;
  metadataJson?: string;
  targets?: PipelineTargetConfig[];
}

export interface RoutingPipelineRecord {
  id: string;
  name: string;
  description: string | null;
  virtualModelId: string;
  defaultEffortLevel: EffortLevel;
  fallbackPolicy: "cascade_failover" | "strict_reject";
  maxPipelineDepth: number;
  isEnabled: boolean;
  metadataJson: string;
  createdAt: number | null;
  updatedAt: number | null;
}

export interface PipelineTargetRecord {
  id: string;
  pipelineId: string;
  targetKind: TargetKind;
  priorityTier: number;
  weight: number;
  adapterId: string;
  modelId: string;
  targetAccountId: string | null;
  effortOverride: EffortLevel | null;
  isEnabled: boolean;
  createdAt: number | null;
}

export interface RoutingPipelineWithTargets extends RoutingPipelineRecord {
  targets: PipelineTargetRecord[];
}

export class PipelineStore {
  public async listPipelines(includeTargets = true): Promise<RoutingPipelineWithTargets[] | RoutingPipelineRecord[]> {
    const pipelines = await db.select().from(routingPipelines).orderBy(desc(routingPipelines.createdAt));
    if (!includeTargets) return pipelines as RoutingPipelineRecord[];

    const allTargets = await db.select().from(pipelineTargets).orderBy(pipelineTargets.priorityTier);
    const targetsByPipeline = new Map<string, PipelineTargetRecord[]>();

    for (const t of allTargets) {
      const list = targetsByPipeline.get(t.pipelineId) || [];
      list.push(t as PipelineTargetRecord);
      targetsByPipeline.set(t.pipelineId, list);
    }

    return pipelines.map((p) => ({
      ...(p as RoutingPipelineRecord),
      targets: targetsByPipeline.get(p.id) || [],
    }));
  }

  public async getPipeline(id: string): Promise<RoutingPipelineWithTargets | null> {
    const found = await db.select().from(routingPipelines).where(eq(routingPipelines.id, id));
    if (found.length === 0) return null;

    const targets = await db
      .select()
      .from(pipelineTargets)
      .where(eq(pipelineTargets.pipelineId, id))
      .orderBy(pipelineTargets.priorityTier);

    return {
      ...(found[0] as RoutingPipelineRecord),
      targets: targets as PipelineTargetRecord[],
    };
  }

  public async getPipelineByVirtualModel(virtualModelId: string): Promise<RoutingPipelineWithTargets | null> {
    const found = await db
      .select()
      .from(routingPipelines)
      .where(eq(routingPipelines.virtualModelId, virtualModelId));

    if (found.length === 0) return null;

    const targets = await db
      .select()
      .from(pipelineTargets)
      .where(eq(pipelineTargets.pipelineId, found[0].id))
      .orderBy(pipelineTargets.priorityTier);

    return {
      ...(found[0] as RoutingPipelineRecord),
      targets: targets as PipelineTargetRecord[],
    };
  }

  public async createPipeline(input: CreatePipelineInput): Promise<RoutingPipelineWithTargets | null> {
    const id = input.id || `group:${input.name.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`;
    const virtualModelId = input.virtualModelId || id;

    await db.insert(routingPipelines).values({
      id,
      name: input.name,
      description: input.description || null,
      virtualModelId,
      defaultEffortLevel: input.defaultEffortLevel || "medium",
      fallbackPolicy: input.fallbackPolicy || "cascade_failover",
      maxPipelineDepth: input.maxPipelineDepth ?? 3,
      isEnabled: input.isEnabled ?? true,
      metadataJson: input.metadataJson || "{}",
    });

    if (input.targets && input.targets.length > 0) {
      for (const t of input.targets) {
        await db.insert(pipelineTargets).values({
          id: t.id || randomUUID(),
          pipelineId: id,
          targetKind: t.targetKind || "MODEL",
          priorityTier: t.priorityTier ?? 1,
          weight: t.weight ?? 100,
          adapterId: t.adapterId,
          modelId: t.modelId,
          targetAccountId: t.targetKind === "ACCOUNT" ? (t.targetAccountId || null) : null,
          effortOverride: t.effortOverride || null,
          isEnabled: t.isEnabled ?? true,
        });
      }
    }

    return this.getPipeline(id);
  }

  public async updatePipeline(id: string, input: UpdatePipelineInput): Promise<RoutingPipelineWithTargets | null> {
    const existing = await this.getPipeline(id);
    if (!existing) return null;

    const updateValues: {
      name?: string;
      description?: string | null;
      virtualModelId?: string;
      defaultEffortLevel?: EffortLevel;
      fallbackPolicy?: "cascade_failover" | "strict_reject";
      maxPipelineDepth?: number;
      isEnabled?: boolean;
      metadataJson?: string;
      updatedAt?: SQL;
    } = {
      updatedAt: sql`(strftime('%s', 'now'))`,
    };

    if (input.name !== undefined) updateValues.name = input.name;
    if (input.description !== undefined) updateValues.description = input.description;
    if (input.virtualModelId !== undefined) updateValues.virtualModelId = input.virtualModelId;
    if (input.defaultEffortLevel !== undefined) updateValues.defaultEffortLevel = input.defaultEffortLevel;
    if (input.fallbackPolicy !== undefined) updateValues.fallbackPolicy = input.fallbackPolicy;
    if (input.maxPipelineDepth !== undefined) updateValues.maxPipelineDepth = input.maxPipelineDepth;
    if (input.isEnabled !== undefined) updateValues.isEnabled = input.isEnabled;
    if (input.metadataJson !== undefined) updateValues.metadataJson = input.metadataJson;

    await db.update(routingPipelines).set(updateValues).where(eq(routingPipelines.id, id));

    if (input.targets !== undefined) {
      // Replace targets for this pipeline
      await db.delete(pipelineTargets).where(eq(pipelineTargets.pipelineId, id));
      for (const t of input.targets) {
        await db.insert(pipelineTargets).values({
          id: t.id || randomUUID(),
          pipelineId: id,
          targetKind: t.targetKind || "MODEL",
          priorityTier: t.priorityTier ?? 1,
          weight: t.weight ?? 100,
          adapterId: t.adapterId,
          modelId: t.modelId,
          targetAccountId: t.targetKind === "ACCOUNT" ? (t.targetAccountId || null) : null,
          effortOverride: t.effortOverride || null,
          isEnabled: t.isEnabled ?? true,
        });
      }
    }

    return this.getPipeline(id);
  }

  public async deletePipeline(id: string): Promise<boolean> {
    const existing = await this.getPipeline(id);
    if (!existing) return false;
    await db.delete(routingPipelines).where(eq(routingPipelines.id, id));
    return true;
  }

  public async recordFailoverEvent(data: {
    pipelineId: string;
    requestId: string;
    fromAccountId: string;
    toAccountId: string;
    triggerReason: string;
    failoverLatencyMs?: number;
  }): Promise<void> {
    await db.insert(failoverEvents).values({
      pipelineId: data.pipelineId,
      requestId: data.requestId,
      fromAccountId: data.fromAccountId,
      toAccountId: data.toAccountId,
      triggerReason: data.triggerReason,
      failoverLatencyMs: data.failoverLatencyMs ?? 0,
    });
  }

  public async listFailoverEvents(pipelineId?: string, limit = 50) {
    if (pipelineId) {
      return db
        .select()
        .from(failoverEvents)
        .where(eq(failoverEvents.pipelineId, pipelineId))
        .orderBy(desc(failoverEvents.timestamp))
        .limit(limit);
    }
    return db
      .select()
      .from(failoverEvents)
      .orderBy(desc(failoverEvents.timestamp))
      .limit(limit);
  }
}

export const globalPipelineStore = new PipelineStore();
