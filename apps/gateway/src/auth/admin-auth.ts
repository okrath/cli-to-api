import { timingSafeEqual } from "node:crypto";
import { customAlphabet } from "nanoid";
import type { FastifyReply, FastifyRequest } from "fastify";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const tokenAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const generateTokenSuffix = customAlphabet(tokenAlphabet, 32);

export type AdminTokenStore = Map<string, number>;

export function createAdminTokenStore(): AdminTokenStore {
  return new Map();
}

export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function issueAdminToken(store: AdminTokenStore): { token: string; expiresAt: number } {
  const token = `adm_${generateTokenSuffix()}`;
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  store.set(token, expiresAt);
  return { token, expiresAt };
}

export function isAdminTokenValid(store: AdminTokenStore, token: string): boolean {
  const expiresAt = store.get(token);
  if (expiresAt === undefined) {
    return false;
  }
  if (Date.now() >= expiresAt) {
    store.delete(token);
    return false;
  }
  return true;
}

function extractAdminToken(request: FastifyRequest): string | undefined {
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    if (token.startsWith("adm_")) {
      return token;
    }
  }
  const query = request.query as { token?: string };
  if (typeof query.token === "string" && query.token.startsWith("adm_")) {
    return query.token;
  }
  return undefined;
}

export function registerAdminAuth(
  store: AdminTokenStore,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    const token = extractAdminToken(request);
    if (!token || !isAdminTokenValid(store, token)) {
      await reply.code(401).send({
        error: { message: "Unauthorized", type: "authentication_error" },
      });
      return;
    }
  };
}
