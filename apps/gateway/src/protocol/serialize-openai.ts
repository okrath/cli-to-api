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

function finishReason(stopReason: "end_turn" | "max_tokens" | "error"): "stop" | "length" {
  return stopReason === "max_tokens" ? "length" : "stop";
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
  finishReason: string | null,
): string {
  return JSON.stringify({
    id: `chatcmpl-${opts.requestId}`,
    object: "chat.completion.chunk",
    created,
    model: opts.model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  });
}

export function* serializeOpenAiStream(
  events: Iterable<CliEvent>,
  opts: OpenAiSerializeOptions,
): Generator<string> {
  yield* streamOpenAiFrames(events, opts);
}

function createdAt(opts: OpenAiSerializeOptions): number {
  return opts.created ?? Math.floor(Date.now() / 1000);
}

function* streamOpenAiFrames(
  events: Iterable<CliEvent>,
  opts: OpenAiSerializeOptions,
): Generator<string> {
  const created = createdAt(opts);
  let started = false;
  let lastUsage: Extract<CliEvent, { type: "usage" }> | undefined;
  let sentRole = false;

  for (const event of events) {
    if (!sentRole) {
      yield chunkFrame(opts, created, { role: "assistant", content: "" }, null);
      sentRole = true;
    }

    if (event.type === "thinking_delta") {
      started = true;
      yield chunkFrame(opts, created, { reasoning_content: event.text }, null);
    } else if (event.type === "text_delta") {
      started = true;
      yield chunkFrame(opts, created, { content: event.text }, null);
    } else if (event.type === "usage") {
      lastUsage = event;
    } else if (event.type === "error") {
      const mapped = mapCliError(event, "openai");
      if (!started) {
        throw mapped;
      }
      yield JSON.stringify({ error: mapped.body.error });
      yield "[DONE]";
      return;
    } else if (event.type === "done") {
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

export async function writeOpenAiStream(
  write: (frame: string) => void,
  events: AsyncIterable<CliEvent>,
  opts: OpenAiSerializeOptions,
): Promise<void> {
  const created = createdAt(opts);
  let started = false;
  let lastUsage: Extract<CliEvent, { type: "usage" }> | undefined;
  let sentRole = false;

  for await (const event of events) {
    if (!sentRole) {
      write(chunkFrame(opts, created, { role: "assistant", content: "" }, null));
      sentRole = true;
    }

    if (event.type === "thinking_delta") {
      started = true;
      write(chunkFrame(opts, created, { reasoning_content: event.text }, null));
    } else if (event.type === "text_delta") {
      started = true;
      write(chunkFrame(opts, created, { content: event.text }, null));
    } else if (event.type === "usage") {
      lastUsage = event;
    } else if (event.type === "error") {
      const mapped = mapCliError(event, "openai");
      if (!started) {
        throw mapped;
      }
      write(JSON.stringify({ error: mapped.body.error }));
      write("[DONE]");
      return;
    } else if (event.type === "done") {
      write(chunkFrame(opts, created, {}, finishReason(event.stopReason)));
      if (opts.includeUsage && lastUsage) {
        write(
          JSON.stringify({
            id: `chatcmpl-${opts.requestId}`,
            object: "chat.completion.chunk",
            created,
            model: opts.model,
            choices: [],
            usage: buildUsage(lastUsage),
          }),
        );
      }
      write("[DONE]");
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
    message: { role: "assistant"; content: string; reasoning_content?: string };
    finish_reason: "stop" | "length";
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
  let stopReason: "end_turn" | "max_tokens" | "error" = "end_turn";

  for (const event of events) {
    if (event.type === "thinking_delta") {
      reasoning += event.text;
    } else if (event.type === "text_delta") {
      content += event.text;
    } else if (event.type === "usage") {
      lastUsage = event;
    } else if (event.type === "error") {
      const mapped = mapCliError(event, "openai");
      return { status: mapped.status, error: mapped.body.error as Record<string, unknown> };
    } else if (event.type === "done") {
      stopReason = event.stopReason;
    }
  }

  const message: { role: "assistant"; content: string; reasoning_content?: string } = {
    role: "assistant",
    content,
  };
  if (reasoning.length > 0) {
    message.reasoning_content = reasoning;
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
