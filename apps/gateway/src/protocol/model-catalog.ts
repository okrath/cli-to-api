import { eq } from "drizzle-orm";
import { adapters, detectAdapters } from "../adapters/index.js";
import type { DbHandle } from "../db/db.js";
import { groups } from "../db/schema.js";

export const KNOWN_ADAPTER_IDS = ["claude-code", "codex", "agy", "omp", "fake"] as const;
export type KnownAdapterId = (typeof KNOWN_ADAPTER_IDS)[number];

const ALIAS_MODELS = [
  "claude-sonnet-4-5",
  "claude-opus-4-1",
  "claude-haiku-4-5",
  "gpt-5",
] as const;

export interface ModelCatalog {
  groups: Array<{ id: string; name: string; enabled: boolean }>;
  installedAdapters: Set<string>;
}

export type ResolvedModel =
  | { kind: "group"; groupId: string }
  | { kind: "direct"; adapterId: string; modelId: string };

function resolveClaudeAlias(name: string): Extract<ResolvedModel, { kind: "direct" }> | null {
  if (!/^claude-/.test(name)) {
    return null;
  }
  let modelId = "sonnet";
  if (/opus/i.test(name)) {
    modelId = "opus";
  } else if (/haiku/i.test(name)) {
    modelId = "haiku";
  }
  return { kind: "direct", adapterId: "claude-code", modelId };
}

function resolveCodexAlias(name: string): Extract<ResolvedModel, { kind: "direct" }> | null {
  if (!/^(gpt-|o[0-9]|codex)/.test(name)) {
    return null;
  }
  return { kind: "direct", adapterId: "codex", modelId: name };
}

export function resolveModel(name: string, catalog: ModelCatalog): ResolvedModel | null {
  if (name.startsWith("group:")) {
    const group = catalog.groups.find((entry) => entry.id === name && entry.enabled);
    return group ? { kind: "group", groupId: group.id } : null;
  }

  const slashIdx = name.indexOf("/");
  if (slashIdx > 0) {
    const adapterId = name.slice(0, slashIdx);
    const modelId = name.slice(slashIdx + 1);
    if (modelId.length > 0 && catalog.installedAdapters.has(adapterId)) {
      return { kind: "direct", adapterId, modelId };
    }
    return null;
  }

  const claude = resolveClaudeAlias(name);
  if (claude && catalog.installedAdapters.has(claude.adapterId)) {
    return claude;
  }

  const codex = resolveCodexAlias(name);
  if (codex && catalog.installedAdapters.has(codex.adapterId)) {
    return codex;
  }

  return null;
}

export function listOpenAiModels(catalog: ModelCatalog): {
  object: "list";
  data: Array<{ id: string; object: "model"; created: number; owned_by: string }>;
} {
  const created = Math.floor(Date.now() / 1000);
  const data: Array<{ id: string; object: "model"; created: number; owned_by: string }> = [];

  for (const group of catalog.groups.filter((entry) => entry.enabled)) {
    data.push({ id: group.id, object: "model", created, owned_by: "cli-to-api" });
  }

  for (const [adapterId, adapter] of Object.entries(adapters)) {
    if (!catalog.installedAdapters.has(adapterId)) {
      continue;
    }
    for (const model of adapter.models) {
      data.push({
        id: `${adapterId}/${model.id}`,
        object: "model",
        created,
        owned_by: adapterId,
      });
    }
  }

  for (const alias of ALIAS_MODELS) {
    data.push({ id: alias, object: "model", created, owned_by: "cli-to-api" });
  }

  return { object: "list", data };
}

export function listAnthropicModels(catalog: ModelCatalog): {
  data: Array<{ type: "model"; id: string; display_name: string; created_at: string }>;
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
} {
  const openAiList = listOpenAiModels(catalog);
  const data = openAiList.data.map((entry) => ({
    type: "model" as const,
    id: entry.id,
    display_name: entry.id,
    created_at: new Date(entry.created * 1000).toISOString(),
  }));

  return {
    data,
    has_more: false,
    first_id: data[0]?.id ?? null,
    last_id: data[data.length - 1]?.id ?? null,
  };
}

export function loadGroupsFromDb(db: DbHandle): ModelCatalog["groups"] {
  return db.db
    .select({ id: groups.id, name: groups.name, enabled: groups.enabled })
    .from(groups)
    .where(eq(groups.enabled, true))
    .all();
}

export async function buildCatalog(db: DbHandle): Promise<ModelCatalog> {
  const rows = await detectAdapters();
  const installedAdapters = new Set(rows.filter((row) => row.installed).map((row) => row.id));
  return {
    groups: loadGroupsFromDb(db),
    installedAdapters,
  };
}

export function buildCatalogSync(
  groupsList: ModelCatalog["groups"],
  installedAdapters: Iterable<string>,
): ModelCatalog {
  return {
    groups: groupsList,
    installedAdapters: new Set(installedAdapters),
  };
}
