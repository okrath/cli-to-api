import { z } from "zod";
import type { ChatMessage, ChatRequest, Effort } from "../core/types.js";
import { ProtocolError } from "./errors.js";

const textPartSchema = z.object({ type: z.literal("text"), text: z.string() });

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.union([z.string(), z.array(textPartSchema)]),
});

const bodySchema = z
  .object({
    model: z.string().min(1),
    max_tokens: z.number().int().positive().optional(),
    system: z.union([z.string(), z.array(textPartSchema)]).optional(),
    messages: z.array(messageSchema).min(1),
    stream: z.boolean().optional(),
    thinking: z
      .union([
        z.object({ type: z.literal("enabled"), budget_tokens: z.number().int().positive() }),
        z.object({ type: z.literal("disabled") }),
      ])
      .optional(),
    metadata: z.object({ user_id: z.string().optional() }).optional(),
    tools: z.unknown().optional(),
  })
  .strict();

function extractTextContent(
  content: string | Array<{ type: "text"; text: string }>,
): string {
  if (typeof content === "string") {
    return content;
  }
  if (content.some((part) => part.type !== "text")) {
    throw new ProtocolError(400, "anthropic", "invalid_request_error", "only text content is supported");
  }
  return content.map((part) => part.text).join("");
}

function effortFromThinking(
  thinking: z.infer<typeof bodySchema>["thinking"],
): Effort | undefined {
  if (thinking === undefined) {
    return undefined;
  }
  if (thinking.type === "disabled") {
    return "none";
  }
  const budget = thinking.budget_tokens;
  if (budget <= 2048) {
    return "low";
  }
  if (budget <= 8192) {
    return "medium";
  }
  if (budget <= 32000) {
    return "high";
  }
  return "xhigh";
}

function normalizeSystem(system: z.infer<typeof bodySchema>["system"]): ChatMessage | undefined {
  if (system === undefined) {
    return undefined;
  }
  const content = typeof system === "string" ? system : extractTextContent(system);
  if (content.length === 0) {
    return undefined;
  }
  return { role: "system", content };
}

export interface NormalizeAnthropicInput {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  requestId: string;
  apiKeyId: string;
  clientAbort: AbortSignal;
}

export function normalizeAnthropic(input: NormalizeAnthropicInput): ChatRequest {
  const parsed = bodySchema.safeParse(input.body);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ") || "Invalid request body";
    throw new ProtocolError(400, "anthropic", "invalid_request_error", message);
  }

  const body = parsed.data;
  if (body.tools !== undefined) {
    throw new ProtocolError(400, "anthropic", "invalid_request_error", "not supported by this gateway");
  }

  const systemMessage = normalizeSystem(body.system);
  const messages: ChatMessage[] = systemMessage ? [systemMessage] : [];
  for (const msg of body.messages) {
    messages.push({ role: msg.role, content: extractTextContent(msg.content) });
  }

  const conversationHeader = input.headers["x-conversation-id"];
  const conversationHint =
    (typeof conversationHeader === "string" ? conversationHeader : undefined) ??
    body.metadata?.user_id;

  return {
    requestId: input.requestId,
    apiKeyId: input.apiKeyId,
    dialect: "anthropic",
    model: body.model,
    messages,
    stream: body.stream ?? false,
    effort: effortFromThinking(body.thinking),
    maxTokens: body.max_tokens ?? 8192,
    conversationHint,
    clientAbort: input.clientAbort,
  };
}
