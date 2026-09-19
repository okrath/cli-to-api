import { z } from "zod";
import type { ChatMessage, ChatRequest, Effort, ToolDefinition } from "../core/types.js";
import { ProtocolError } from "./errors.js";

const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

const textPartSchema = z.object({ type: z.literal("text"), text: z.string() });

const toolUseBlockSchema = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()).optional(),
});

const toolResultBlockSchema = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  content: z
    .union([z.string(), z.array(z.object({ type: z.literal("text"), text: z.string() }))])
    .optional(),
  is_error: z.boolean().optional(),
});

const assistantContentBlockSchema = z.discriminatedUnion("type", [
  textPartSchema,
  toolUseBlockSchema,
  z.object({ type: z.literal("thinking") }),
  z.object({ type: z.literal("redacted_thinking") }),
]);

const userContentBlockSchema = z.discriminatedUnion("type", [
  textPartSchema,
  toolResultBlockSchema,
]);

const messageSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("user"),
    content: z.union([z.string(), z.array(userContentBlockSchema)]),
  }),
  z.object({
    role: z.literal("assistant"),
    content: z.union([z.string(), z.array(assistantContentBlockSchema)]),
  }),
]);

const toolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  input_schema: z.record(z.unknown()),
});

const bodySchema = z.object({
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
  tools: z.array(toolDefinitionSchema).optional(),
  tool_choice: z
    .union([
      z.object({ type: z.literal("auto") }),
      z.object({ type: z.literal("none") }),
      z.object({ type: z.literal("any") }),
      z.object({ type: z.literal("tool"), name: z.string() }),
    ])
    .optional(),
});

function extractTextParts(
  content: string | Array<{ type: "text"; text: string }>,
): string {
  if (typeof content === "string") {
    return content;
  }
  return content.map((part) => part.text).join("");
}

function extractToolResultContent(
  content: z.infer<typeof toolResultBlockSchema>["content"],
): string {
  if (content === undefined) {
    return "";
  }
  if (typeof content === "string") {
    return content;
  }
  return content.map((part) => part.text).join("");
}

function validateToolName(name: string): void {
  if (!TOOL_NAME_PATTERN.test(name)) {
    throw new ProtocolError(400, "anthropic", "invalid_request_error", "invalid tool name");
  }
}

function normalizeTools(
  tools: z.infer<typeof toolDefinitionSchema>[] | undefined,
): ToolDefinition[] | undefined {
  if (tools === undefined || tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => {
    validateToolName(tool.name);
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    };
  });
}

function normalizeToolChoice(
  toolChoice: z.infer<typeof bodySchema>["tool_choice"],
): "auto" | "none" | undefined {
  if (toolChoice === undefined || toolChoice.type === "auto") {
    return "auto";
  }
  if (toolChoice.type === "none") {
    return "none";
  }
  throw new ProtocolError(
    400,
    "anthropic",
    "invalid_request_error",
    'tool_choice must be "auto" or "none"',
  );
}

function normalizeAssistantMessage(
  content: string | Array<z.infer<typeof assistantContentBlockSchema>>,
  knownToolCallIds: Set<string>,
): ChatMessage[] {
  if (typeof content === "string") {
    return [{ role: "assistant", content }];
  }

  const textParts: string[] = [];
  const toolCalls: ChatMessage["toolCalls"] = [];

  for (const block of content) {
    if (block.type === "text") {
      textParts.push(block.text);
    } else if (block.type === "tool_use") {
      validateToolName(block.name);
      knownToolCallIds.add(block.id);
      toolCalls!.push({
        id: block.id,
        name: block.name,
        argumentsJson: JSON.stringify(block.input ?? {}),
      });
    }
  }

  return [
    {
      role: "assistant",
      content: textParts.join(""),
      ...(toolCalls!.length > 0 ? { toolCalls } : {}),
    },
  ];
}

function normalizeUserMessage(
  content: string | Array<z.infer<typeof userContentBlockSchema>>,
  knownToolCallIds: Set<string>,
): ChatMessage[] {
  if (typeof content === "string") {
    return [{ role: "user", content }];
  }

  const textParts: string[] = [];
  const messages: ChatMessage[] = [];

  for (const block of content) {
    if (block.type === "text") {
      textParts.push(block.text);
    } else if (block.type === "tool_result") {
      if (!knownToolCallIds.has(block.tool_use_id)) {
        throw new ProtocolError(
          400,
          "anthropic",
          "invalid_request_error",
          "tool message without a matching tool call",
        );
      }
      messages.push({
        role: "tool",
        content: extractToolResultContent(block.content),
        toolCallId: block.tool_use_id,
        ...(block.is_error === true ? { isError: true } : {}),
      });
    } else {
      throw new ProtocolError(
        400,
        "anthropic",
        "invalid_request_error",
        "only text content is supported",
      );
    }
  }

  const joinedText = textParts.join("");
  if (joinedText.length > 0) {
    messages.push({ role: "user", content: joinedText });
  }

  return messages;
}

function normalizeSystem(system: z.infer<typeof bodySchema>["system"]): ChatMessage | undefined {
  if (system === undefined) {
    return undefined;
  }
  const content = typeof system === "string" ? system : extractTextParts(system);
  if (content.length === 0) {
    return undefined;
  }
  return { role: "system", content };
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

export interface NormalizeAnthropicInput {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  requestId: string;
  apiKeyId: string;
  retention?: "standard" | "ephemeral";
  clientAbort: AbortSignal;
}

export function normalizeAnthropic(input: NormalizeAnthropicInput): ChatRequest {
  const parsed = bodySchema.safeParse(input.body);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ") || "Invalid request body";
    throw new ProtocolError(400, "anthropic", "invalid_request_error", message);
  }

  const body = parsed.data;
  const toolChoice = normalizeToolChoice(body.tool_choice);
  const tools = toolChoice === "none" ? undefined : normalizeTools(body.tools);

  const systemMessage = normalizeSystem(body.system);
  const messages: ChatMessage[] = systemMessage ? [systemMessage] : [];
  const knownToolCallIds = new Set<string>();

  for (const msg of body.messages) {
    if (msg.role === "assistant") {
      messages.push(...normalizeAssistantMessage(msg.content, knownToolCallIds));
    } else {
      messages.push(...normalizeUserMessage(msg.content, knownToolCallIds));
    }
  }

  const conversationHeader = input.headers["x-conversation-id"];
  const conversationHint =
    (typeof conversationHeader === "string" ? conversationHeader : undefined) ??
    body.metadata?.user_id;

  const result: ChatRequest = {
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
    retention: input.retention ?? "standard",
  };

  if (tools) {
    result.tools = tools;
    result.toolChoice = toolChoice ?? "auto";
  }

  return result;
}
