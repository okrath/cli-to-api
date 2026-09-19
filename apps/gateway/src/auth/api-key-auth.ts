import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chmodSync } from "node:fs";
import { resolve } from "node:path";
import { count, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from "fastify";
import type { DbHandle } from "../db/db.js";
import { apiKeys } from "../db/schema.js";

const keyAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const generateKeySuffix = customAlphabet(keyAlphabet, 32);

export function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function createApiKey(): { id: string; plaintext: string; prefix: string } {
  const plaintext = `sk-cta-${generateKeySuffix()}`;
  const id = `key_${generateKeySuffix().slice(0, 16)}`;
  const prefix = plaintext.slice(0, 12);
  return { id, plaintext, prefix };
}

export async function bootstrapApiKeyIfEmpty(
  handle: DbHandle,
  dataDir: string,
  logger: FastifyBaseLogger,
): Promise<void> {
  const existing = handle.db.select({ value: count() }).from(apiKeys).get()?.value ?? 0;
  if (existing > 0) {
    return;
  }

  const created = createApiKey();
  const now = Date.now();
  handle.db
    .insert(apiKeys)
    .values({
      id: created.id,
      keyHash: hashKey(created.plaintext),
      keyPrefix: created.prefix,
      name: "bootstrap",
      enabled: true,
      createdAt: now,
    })
    .run();

  logger.warn({ apiKeyPrefix: created.prefix }, "Bootstrap API key created");
  const keyPath = resolve(dataDir, "bootstrap-api-key.txt");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(keyPath, `${created.plaintext}\n`, { mode: 0o600 });
  try {
    chmodSync(keyPath, 0o600);
  } catch {
    // Windows may not support chmod the same way; best effort only.
  }
  logger.warn({ path: keyPath }, "Bootstrap API key written to file");
}

function extractApiKey(request: FastifyRequest): string | undefined {
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }
  const header = request.headers["x-api-key"];
  if (typeof header === "string" && header.length > 0) {
    return header;
  }
  return undefined;
}

declare module "fastify" {
  interface FastifyRequest {
    apiKeyId?: string;
    apiKeyRetention?: "standard" | "ephemeral";
  }
}

export function registerApiKeyAuth(
  handle: DbHandle,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    const plaintext = extractApiKey(request);
    if (!plaintext) {
      await reply.code(401).send({
        error: { message: "Missing API key", type: "authentication_error" },
      });
      return;
    }

    const keyHash = hashKey(plaintext);
    const row = handle.db
      .select({ id: apiKeys.id, enabled: apiKeys.enabled, retention: apiKeys.retention })
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .get();

    if (!row || !row.enabled) {
      await reply.code(401).send({
        error: { message: "Invalid API key", type: "authentication_error" },
      });
      return;
    }

    request.apiKeyId = row.id;
    request.apiKeyRetention = row.retention as "standard" | "ephemeral";
    handle.db
      .update(apiKeys)
      .set({ lastUsedAt: Date.now() })
      .where(eq(apiKeys.id, row.id))
      .run();
  };
}
