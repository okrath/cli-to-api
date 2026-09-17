import { z } from "zod";
import type { EffortLevel } from "../db/schema.js";
import type { ChatMessage } from "./content-normalizer.js";

export const AnthropicThinkingSchema = z.object({
  type: z.enum(["enabled", "disabled"]),
  budget_tokens: z.number().int().positive().optional(),
});

export const AnthropicContentBlockSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  source: z
    .object({
      type: z.string(),
      media_type: z.string().optional(),
      data: z.string().optional(),
    })
    .optional(),
  thinking: z.string().optional(),
  signature: z.string().optional(),
});

export const AnthropicMessageParamSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.union([z.string(), z.array(z.union([z.string(), AnthropicContentBlockSchema]))]),
});

export const AnthropicMessagesBodySchema = z.object({
  model: z.string().min(1, "Model is required"),
  messages: z.array(AnthropicMessageParamSchema).min(1, "At least one message is required"),
  system: z
    .union([z.string(), z.array(z.object({ type: z.string(), text: z.string() }))])
    .optional(),
  max_tokens: z.number().int().positive().optional(),
  metadata: z.object({ user_id: z.string().optional() }).passthrough().optional(),
  stop_sequences: z.array(z.string()).optional(),
  stream: z.boolean().optional().default(false),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  top_k: z.number().optional(),
  thinking: AnthropicThinkingSchema.optional(),
});

export type AnthropicMessagesBody = z.infer<typeof AnthropicMessagesBodySchema>;

/**
 * Normalizes an Anthropic Messages request into internal Gateway ChatMessage[]
 */
export function normalizeAnthropicMessages(body: AnthropicMessagesBody): ChatMessage[] {
  const normalized: ChatMessage[] = [];

  // 1. Process System Prompt if declared
  if (body.system) {
    if (typeof body.system === "string" && body.system.trim().length > 0) {
      normalized.push({
        role: "system",
        content: body.system.trim(),
      });
    } else if (Array.isArray(body.system)) {
      const combined = body.system
        .map((b) => b.text || "")
        .filter(Boolean)
        .join("\n\n")
        .trim();
      if (combined.length > 0) {
        normalized.push({
          role: "system",
          content: combined,
        });
      }
    }
  }

  // 2. Process User / Assistant message sequence
  for (const msg of body.messages) {
    if (typeof msg.content === "string") {
      normalized.push({
        role: msg.role,
        content: msg.content,
      });
    } else if (Array.isArray(msg.content)) {
      const parts: string[] = [];
      for (const item of msg.content) {
        if (typeof item === "string") {
          parts.push(item);
        } else if (item && typeof item === "object") {
          if (item.type === "text" && item.text) {
            parts.push(item.text);
          } else if (item.type === "image") {
            parts.push("[Image]");
          } else if (item.text) {
            parts.push(item.text);
          }
        }
      }
      normalized.push({
        role: msg.role,
        content: parts.join("\n").trim(),
      });
    }
  }

  return normalized;
}

/**
 * Resolves reasoning effort from Anthropic thinking config or request header
 */
export function resolveAnthropicEffort(
  body: AnthropicMessagesBody,
  headerEffort?: string
): EffortLevel | null {
  if (body.thinking?.type === "enabled") {
    const budget = body.thinking.budget_tokens ?? 4096;
    if (budget > 16384) return "xhigh";
    if (budget > 8192) return "high";
    if (budget > 2048) return "medium";
    return "low";
  }

  if (
    headerEffort === "none" ||
    headerEffort === "low" ||
    headerEffort === "medium" ||
    headerEffort === "high" ||
    headerEffort === "xhigh"
  ) {
    return headerEffort;
  }

  return null;
}
