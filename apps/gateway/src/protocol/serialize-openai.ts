import type { CliEvent } from "../core/types.js";
import { mapCliError } from "./errors.js";

export interface OpenAiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details: { cached_tokens: number };
  completion_tokens_details: { reasoning_tokens: number };
}

export interface OpenAiSerializeOptions {
  requestId: string;
  model: string;
  includeUsage: boolean;
  created?: number;
}

type FinishReason = "stop" | "length" | "tool_calls";

function finishReason(stopReason: "end_turn" | "max_tokens" | "tool_use" | "error"): FinishReason {
  if (stopReason === "max_tokens") {
    return "length";
  }
  if (stopReason === "tool_use") {
    return "tool_calls";
  }
  return "stop";
}

function buildUsage(event: Extract<CliEvent, { type: "usage" }>): OpenAiUsage {
  const promptTokens = event.input + event.cachedInput + event.cacheWrite;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: event.output,
    total_tokens: promptTokens + event.output,
    prompt_tokens_details: { cached_tokens: event.cachedInput },
    completion_tokens_details: { reasoning_tokens: event.reasoning },
  };
}

function chunkFrame(
  opts: OpenAiSerializeOptions,
  created: number,
  delta: Record<string, unknown>,
  finish: string | null,
): string {
  return JSON.stringify({
    id: `chatcmpl-${opts.requestId}`,
    object: "chat.completion.chunk",
    created,
    model: opts.model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
}

function createdAt(opts: OpenAiSerializeOptions): number {
  return opts.created ?? Math.floor(Date.now() / 1000);
}

export async function* openAiStreamFrames(
  events: AsyncIterable<CliEvent>,
  opts: OpenAiSerializeOptions,
): AsyncGenerator<string> {
  const created = createdAt(opts);
  let started = false;
  let lastUsage: Extract<CliEvent, { type: "usage" }> | undefined;
  let sentRole = false;
  let toolCallIndex = 0;

  for await (const event of events) {
    if (event.type === "session") {
      continue;
    }

    if (event.type === "error") {
      const mapped = mapCliError(event, "openai");
      if (!started) {
        throw mapped;
      }
      yield JSON.stringify({ error: mapped.body.error });
      yield "[DONE]";
      return;
    }

    if (event.type === "thinking_delta" || event.type === "text_delta") {
      if (!sentRole) {
        yield chunkFrame(opts, created, { role: "assistant", content: "" }, null);
        sentRole = true;
      }
      started = true;
      if (event.type === "thinking_delta") {
        yield chunkFrame(opts, created, { reasoning_content: event.text }, null);
      } else {
        yield chunkFrame(opts, created, { content: event.text }, null);
      }
    } else if (event.type === "tool_call") {
      if (!sentRole) {
        yield chunkFrame(opts, created, { role: "assistant", content: "" }, null);
        sentRole = true;
      }
      started = true;
      yield chunkFrame(
        opts,
        created,
        {
          tool_calls: [
            {
              index: toolCallIndex,
              id: event.id,
              type: "function",
              function: { name: event.name, arguments: event.argumentsJson },
            },
          ],
        },
        null,
      );
      toolCallIndex++;
    } else if (event.type === "usage") {
      lastUsage = event;
    } else if (event.type === "done") {
      if (!sentRole) {
        yield chunkFrame(opts, created, { role: "assistant", content: "" }, null);
        sentRole = true;
        started = true;
      }
      yield chunkFrame(opts, created, {}, finishReason(event.stopReason));
      if (opts.includeUsage && lastUsage) {
        yield JSON.stringify({
          id: `chatcmpl-${opts.requestId}`,
          object: "chat.completion.chunk",
          created,
          model: opts.model,
          choices: [],
          usage: buildUsage(lastUsage),
        });
      }
      yield "[DONE]";
      return;
    }
  }
}

export interface OpenAiCompletion {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      reasoning_content?: string;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: FinishReason;
  }>;
  usage?: OpenAiUsage;
}

export function serializeOpenAiCompletion(
  events: Iterable<CliEvent>,
  opts: OpenAiSerializeOptions,
): OpenAiCompletion | { error: Record<string, unknown>; status: number } {
  const created = createdAt(opts);
  let content = "";
  let reasoning = "";
  let lastUsage: Extract<CliEvent, { type: "usage" }> | undefined;
  let stopReason: "end_turn" | "max_tokens" | "tool_use" | "error" = "end_turn";
  const toolCalls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }> = [];

  for (const event of events) {
    if (event.type === "thinking_delta") {
      reasoning += event.text;
    } else if (event.type === "text_delta") {
      content += event.text;
    } else if (event.type === "tool_call") {
      toolCalls.push({
        id: event.id,
        type: "function",
        function: { name: event.name, arguments: event.argumentsJson },
      });
    } else if (event.type === "usage") {
      lastUsage = event;
    } else if (event.type === "error") {
      const mapped = mapCliError(event, "openai");
      return { status: mapped.status, error: mapped.body.error as Record<string, unknown> };
    } else if (event.type === "done") {
      stopReason = event.stopReason;
    }
  }

  const message: OpenAiCompletion["choices"][0]["message"] = {
    role: "assistant",
    content: content.length > 0 ? content : toolCalls.length > 0 ? null : content,
  };
  if (reasoning.length > 0) {
    message.reasoning_content = reasoning;
  }
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  const result: OpenAiCompletion = {
    id: `chatcmpl-${opts.requestId}`,
    object: "chat.completion",
    created,
    model: opts.model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason(stopReason),
      },
    ],
  };

  if (lastUsage) {
    result.usage = buildUsage(lastUsage);
  }

  return result;
}
