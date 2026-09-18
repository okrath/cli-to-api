import { z } from "zod";
import type { ChatMessage, ChatRequest, Effort } from "../core/types.js";
import { ProtocolError } from "./errors.js";

const textPartSchema = z.object({ type: z.literal("text"), text: z.string() });

const messageSchema = z.object({
  role: z.enum(["system", "developer", "user", "assistant"]),
  content: z.union([z.string(), z.array(textPartSchema)]),
});

const bodySchema = z
  .object({
    model: z.string().min(1),
    messages: z.array(messageSchema).min(1),
    stream: z.boolean().optional(),
    stream_options: z.object({ include_usage: z.boolean().optional() }).optional(),
    reasoning_effort: z
      .enum(["minimal", "none", "low", "medium", "high", "xhigh"])
      .optional(),
    max_tokens: z.number().int().positive().optional(),
    max_completion_tokens: z.number().int().positive().optional(),
    user: z.string().optional(),
    tools: z.unknown().optional(),
    functions: z.unknown().optional(),
    response_format: z.unknown().optional(),
  })
  .strict();

function extractTextContent(
  content: string | Array<{ type: "text"; text: string }>,
  dialect: "openai",
): string {
  if (typeof content === "string") {
    return content;
  }
  if (content.length === 0) {
    return "";
  }
  if (content.some((part) => part.type !== "text")) {
    throw new ProtocolError(400, dialect, "invalid_request_error", "only text content is supported");
  }
  return content.map((part) => part.text).join("");
}

function mapEffort(raw: z.infer<typeof bodySchema>["reasoning_effort"]): Effort | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (raw === "minimal") {
    return "low";
  }
  return raw;
}

function normalizeMessages(rawMessages: z.infer<typeof bodySchema>["messages"]): ChatMessage[] {
  const systemParts: string[] = [];
  const rest: ChatMessage[] = [];

  for (const msg of rawMessages) {
    const role = msg.role === "developer" ? "system" : msg.role;
    const content = extractTextContent(msg.content, "openai");
    if (role === "system") {
      systemParts.push(content);
    } else {
      rest.push({ role, content });
    }
  }

  if (systemParts.length === 0) {
    return rest;
  }
  return [{ role: "system", content: systemParts.join("\n\n") }, ...rest];
}

export interface NormalizeOpenAiInput {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  requestId: string;
  apiKeyId: string;
  clientAbort: AbortSignal;
}

export function normalizeOpenAi(input: NormalizeOpenAiInput): ChatRequest {
  const parsed = bodySchema.safeParse(input.body);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ") || "Invalid request body";
    throw new ProtocolError(400, "openai", "invalid_request_error", message);
  }

  const body = parsed.data;
  if (body.tools !== undefined || body.functions !== undefined || body.response_format !== undefined) {
    throw new ProtocolError(
      400,
      "openai",
      "invalid_request_error",
      "not supported by this gateway",
    );
  }

  const conversationHeader = input.headers["x-conversation-id"];
  const conversationHint =
    (typeof conversationHeader === "string" ? conversationHeader : undefined) ?? body.user;

  return {
    requestId: input.requestId,
    apiKeyId: input.apiKeyId,
    dialect: "openai",
    model: body.model,
    messages: normalizeMessages(body.messages),
    stream: body.stream ?? false,
    effort: mapEffort(body.reasoning_effort),
    maxTokens: body.max_completion_tokens ?? body.max_tokens,
    conversationHint,
    clientAbort: input.clientAbort,
  };
}

export function openAiIncludeUsage(body: unknown): boolean {
  const parsed = bodySchema.safeParse(body);
  return parsed.success && parsed.data.stream_options?.include_usage === true;
}
