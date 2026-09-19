import { z } from "zod";
import type { ChatMessage, ChatRequest, Effort, ToolDefinition } from "../core/types.js";
import { ProtocolError } from "./errors.js";

const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

const textPartSchema = z.object({ type: z.literal("text"), text: z.string() });

const toolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

const messageSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.enum(["system", "developer", "user"]),
    content: z.union([z.string(), z.array(textPartSchema)]),
  }),
  z.object({
    role: z.literal("assistant"),
    content: z.union([z.string(), z.array(textPartSchema), z.null()]).optional(),
    tool_calls: z.array(toolCallSchema).optional(),
  }),
  z.object({
    role: z.literal("tool"),
    tool_call_id: z.string(),
    content: z.union([z.string(), z.array(textPartSchema)]),
  }),
]);

const toolDefinitionSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.unknown()).optional(),
  }),
});

const bodySchema = z.object({
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
  tools: z.array(toolDefinitionSchema).optional(),
  tool_choice: z
    .union([
      z.enum(["auto", "none", "required"]),
      z.object({
        type: z.literal("function"),
        function: z.object({ name: z.string() }),
      }),
    ])
    .optional(),
  parallel_tool_calls: z.boolean().optional(),
  functions: z.unknown().optional(),
  response_format: z.unknown().optional(),
});

function extractTextContent(
  content: string | Array<{ type: "text"; text: string }> | null | undefined,
  dialect: "openai",
): string {
  if (content == null) {
    return "";
  }
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

function parseToolArguments(raw: string): string {
  const trimmed = raw.trim();
  const json = trimmed === "" ? "{}" : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ProtocolError(
      400,
      "openai",
      "invalid_request_error",
      "tool call arguments must be a JSON object",
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProtocolError(
      400,
      "openai",
      "invalid_request_error",
      "tool call arguments must be a JSON object",
    );
  }
  return JSON.stringify(parsed);
}

function validateToolName(name: string): void {
  if (!TOOL_NAME_PATTERN.test(name)) {
    throw new ProtocolError(400, "openai", "invalid_request_error", "invalid tool name");
  }
}

function normalizeTools(
  tools: z.infer<typeof toolDefinitionSchema>[] | undefined,
): ToolDefinition[] | undefined {
  if (tools === undefined || tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => {
    validateToolName(tool.function.name);
    return {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters ?? { type: "object", properties: {} },
    };
  });
}

function normalizeToolChoice(
  toolChoice: z.infer<typeof bodySchema>["tool_choice"],
): "auto" | "none" | undefined {
  if (toolChoice === undefined || toolChoice === "auto") {
    return "auto";
  }
  if (toolChoice === "none") {
    return "none";
  }
  throw new ProtocolError(
    400,
    "openai",
    "invalid_request_error",
    'tool_choice must be "auto" or "none"',
  );
}

function normalizeMessages(rawMessages: z.infer<typeof bodySchema>["messages"]): ChatMessage[] {
  const systemParts: string[] = [];
  const rest: ChatMessage[] = [];
  const knownToolCallIds = new Set<string>();

  for (const msg of rawMessages) {
    if (msg.role === "system" || msg.role === "developer") {
      systemParts.push(extractTextContent(msg.content, "openai"));
      continue;
    }

    if (msg.role === "tool") {
      if (!knownToolCallIds.has(msg.tool_call_id)) {
        throw new ProtocolError(
          400,
          "openai",
          "invalid_request_error",
          "tool message without a matching tool call",
        );
      }
      rest.push({
        role: "tool",
        content: extractTextContent(msg.content, "openai"),
        toolCallId: msg.tool_call_id,
      });
      continue;
    }

    if (msg.role === "assistant") {
      const content = extractTextContent(msg.content ?? null, "openai");
      const toolCalls = msg.tool_calls?.map((call) => {
        validateToolName(call.function.name);
        const argumentsJson = parseToolArguments(call.function.arguments);
        knownToolCallIds.add(call.id);
        return {
          id: call.id,
          name: call.function.name,
          argumentsJson,
        };
      });
      rest.push({
        role: "assistant",
        content,
        ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
      });
      continue;
    }

    rest.push({ role: "user", content: extractTextContent(msg.content, "openai") });
  }

  if (systemParts.length === 0) {
    return rest;
  }
  return [{ role: "system", content: systemParts.join("\n\n") }, ...rest];
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

export interface NormalizeOpenAiInput {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  requestId: string;
  apiKeyId: string;
  retention?: "standard" | "ephemeral";
  clientAbort: AbortSignal;
}

export function normalizeOpenAi(input: NormalizeOpenAiInput): ChatRequest {
  const parsed = bodySchema.safeParse(input.body);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ") || "Invalid request body";
    throw new ProtocolError(400, "openai", "invalid_request_error", message);
  }

  const body = parsed.data;
  if (body.functions !== undefined || body.response_format !== undefined) {
    throw new ProtocolError(
      400,
      "openai",
      "invalid_request_error",
      "not supported by this gateway",
    );
  }

  const toolChoice = normalizeToolChoice(body.tool_choice);
  const tools = toolChoice === "none" ? undefined : normalizeTools(body.tools);

  const conversationHeader = input.headers["x-conversation-id"];
  const conversationHint =
    (typeof conversationHeader === "string" ? conversationHeader : undefined) ?? body.user;

  const result: ChatRequest = {
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
    retention: input.retention ?? "standard",
  };

  if (tools) {
    result.tools = tools;
    result.toolChoice = toolChoice ?? "auto";
  }

  return result;
}

export function openAiIncludeUsage(body: unknown): boolean {
  const parsed = bodySchema.safeParse(body);
  return parsed.success && parsed.data.stream_options?.include_usage === true;
}
