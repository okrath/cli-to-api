import type { FastifyReply } from "fastify";
import { z } from "zod";

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug.length > 0 ? slug : "item";
}

export function sendAdminError(reply: FastifyReply, status: number, message: string): void {
  reply.code(status).send({ error: { message } });
}

export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
  reply: FastifyReply,
): z.infer<T> | undefined {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    sendAdminError(reply, 400, message);
    return undefined;
  }
  return parsed.data;
}

export const effortSchema = z.enum(["none", "low", "medium", "high", "xhigh"]);
