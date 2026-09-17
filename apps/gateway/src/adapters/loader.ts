import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { AdapterConfig, AdapterConfigSchema } from "./schema.js";
import { resolveBinary, ResolvedBinary } from "./resolver.js";
import { db } from "../db/index.js";
import { adapters, models } from "../db/schema.js";
import { eq } from "drizzle-orm";

export interface LoadedAdapter {
  config: AdapterConfig;
  resolvedExecutable: ResolvedBinary;
}

export function loadAdapterFile(filePath: string): LoadedAdapter {
  const content = fs.readFileSync(filePath, "utf8");
  const parsedYaml: unknown = yaml.parse(content);
  const validated = AdapterConfigSchema.parse(parsedYaml);
  const resolved = resolveBinary(validated.executable);

  return {
    config: validated,
    resolvedExecutable: resolved,
  };
}

export async function syncAdapterToDatabase(loaded: LoadedAdapter): Promise<void> {
  const { config, resolvedExecutable } = loaded;

  // Upsert adapter record
  const existing = await db.select().from(adapters).where(eq(adapters.id, config.id));
  if (existing.length === 0) {
    await db.insert(adapters).values({
      id: config.id,
      name: config.name,
      version: config.version,
      executable: config.executable,
      resolvedPath: resolvedExecutable.resolvedPath || "",
      executionMode: config.execution_mode,
      configJson: JSON.stringify(config),
      isInstalled: resolvedExecutable.isInstalled,
      status: resolvedExecutable.isInstalled ? "INSTALLED" : "NOT_INSTALLED",
      lastProbedAt: Math.floor(Date.now() / 1000),
      isEnabled: true,
    });
  } else {
    await db.update(adapters).set({
      name: config.name,
      version: config.version,
      executable: config.executable,
      resolvedPath: resolvedExecutable.resolvedPath || "",
      executionMode: config.execution_mode,
      configJson: JSON.stringify(config),
      isInstalled: resolvedExecutable.isInstalled,
      status: resolvedExecutable.isInstalled ? "INSTALLED" : "NOT_INSTALLED",
      lastProbedAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    }).where(eq(adapters.id, config.id));
  }

  // Sync models
  for (const m of config.models) {
    const fullModelId = `${config.id}/${m.id}`;
    const existingModel = await db.select().from(models).where(eq(models.id, fullModelId));
    if (existingModel.length === 0) {
      await db.insert(models).values({
        id: fullModelId,
        adapterId: config.id,
        modelId: m.id,
        name: m.name,
        tier: m.tier,
        contextWindow: m.context_window,
        costWeight: m.cost_weight,
        isDefault: m.is_default,
      });
    } else {
      await db.update(models).set({
        name: m.name,
        tier: m.tier,
        contextWindow: m.context_window,
        costWeight: m.cost_weight,
        isDefault: m.is_default,
      }).where(eq(models.id, fullModelId));
    }
  }
}

export async function loadAndSyncAllAdapters(adaptersDir: string | string[]): Promise<LoadedAdapter[]> {
  const dirs = Array.isArray(adaptersDir) ? adaptersDir : [adaptersDir];
  const adapterMap = new Map<string, LoadedAdapter>();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
      continue;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
        const fullPath = path.join(dir, entry.name);
        try {
          const loaded = loadAdapterFile(fullPath);
          adapterMap.set(loaded.config.id, loaded);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`Failed to load adapter file '${entry.name}':`, message);
        }
      }
    }
  }

  const results: LoadedAdapter[] = [];
  for (const loaded of adapterMap.values()) {
    await syncAdapterToDatabase(loaded);
    results.push(loaded);
  }

  return results;
}
