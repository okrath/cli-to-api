import type { CliEvent } from "../core/types.js";
import { mapCliError } from "./errors.js";

export interface AnthropicSerializeOptions {
  requestId: string;
  model: string;
}

export interface AnthropicStreamFrame {
  event: string;
  data: unknown;
}

function stopReasonFromDone(reason: "end_turn" | "max_tokens" | "error"): "end_turn" | "max_tokens" {
  return reason === "max_tokens" ? "max_tokens" : "end_turn";
}

function usageFromEvent(event: Extract<CliEvent, { type: "usage" }>) {
  return {
    input_tokens: event.input,
    cache_read_input_tokens: event.cachedInput,
    cache_creation_input_tokens: event.cacheWrite,
    output_tokens: event.output,
  };
}

export async function* anthropicStreamFrames(
  events: AsyncIterable<CliEvent>,
  opts: AnthropicSerializeOptions,
): AsyncGenerator<AnthropicStreamFrame> {
  let messageStarted = false;
  let lastUsage: Extract<CliEvent, { type: "usage" }> | undefined;
  let thinkingStarted = false;
  let textStarted = false;
  let doneReason: "end_turn" | "max_tokens" | "error" = "end_turn";
  let started = false;
  const textIndex = () => (thinkingStarted ? 1 : 0);

  const ensureMessageStart = (): AnthropicStreamFrame => {
    messageStarted = true;
    return {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: `msg_${opts.requestId}`,
          type: "message",
          role: "assistant",
          model: opts.model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      },
    };
  };

  for await (const event of events) {
    if (event.type === "session") {
      continue;
    }

    if (event.type === "error") {
      const mapped = mapCliError(event, "anthropic");
      if (!started) {
        throw mapped;
      }
      yield { event: "error", data: mapped.body };
      return;
    }

    if (!messageStarted) {
      yield ensureMessageStart();
    }

    if (event.type === "usage") {
      lastUsage = event;
      continue;
    }

    if (event.type === "thinking_delta") {
      started = true;
      if (!thinkingStarted) {
        thinkingStarted = true;
        yield {
          event: "content_block_start",
          data: {
            type: "content_block_start",
            index: 0,
            content_block: { type: "thinking", thinking: "" },
          },
        };
      }
      yield {
        event: "content_block_delta",
        data: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "thinking_delta", thinking: event.text },
        },
      };
    } else if (event.type === "text_delta") {
      started = true;
      if (thinkingStarted && !textStarted) {
        yield { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } };
      }
      if (!textStarted) {
        textStarted = true;
        yield {
          event: "content_block_start",
          data: {
            type: "content_block_start",
            index: textIndex(),
            content_block: { type: "text", text: "" },
          },
        };
      }
      yield {
        event: "content_block_delta",
        data: {
          type: "content_block_delta",
          index: textIndex(),
          delta: { type: "text_delta", text: event.text },
        },
      };
    } else if (event.type === "done") {
      doneReason = event.stopReason;
    }
  }

  if (!messageStarted) {
    return;
  }

  if (thinkingStarted && !textStarted) {
    yield { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } };
  }
  if (textStarted) {
    yield { event: "content_block_stop", data: { type: "content_block_stop", index: textIndex() } };
  }

  const usage = lastUsage
    ? usageFromEvent(lastUsage)
    : { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 };

  yield {
    event: "message_delta",
    data: {
      type: "message_delta",
      delta: { stop_reason: stopReasonFromDone(doneReason), stop_sequence: null },
      usage: {
        output_tokens: usage.output_tokens ?? 0,
        input_tokens: usage.input_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens,
      },
    },
  };
  yield { event: "message_stop", data: { type: "message_stop" } };
}

export async function collectAnthropicStreamFrames(
  events: AsyncIterable<CliEvent>,
  opts: AnthropicSerializeOptions,
): Promise<string[]> {
  const frames: string[] = [];
  for await (const frame of anthropicStreamFrames(events, opts)) {
    frames.push(`event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`);
  }
  return frames;
}

export interface AnthropicMessage {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: Array<{ type: "thinking"; thinking: string } | { type: "text"; text: string }>;
  stop_reason: "end_turn" | "max_tokens";
  stop_sequence: null;
  usage: {
    input_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
    output_tokens: number;
  };
}

export function serializeAnthropicMessage(
  events: Iterable<CliEvent>,
  opts: AnthropicSerializeOptions,
): AnthropicMessage | { status: number; body: Record<string, unknown> } {
  let thinking = "";
  let text = "";
  let lastUsage: Extract<CliEvent, { type: "usage" }> | undefined;
  let doneReason: "end_turn" | "max_tokens" | "error" = "end_turn";

  for (const event of events) {
    if (event.type === "thinking_delta") {
      thinking += event.text;
    } else if (event.type === "text_delta") {
      text += event.text;
    } else if (event.type === "usage") {
      lastUsage = event;
    } else if (event.type === "error") {
      const mapped = mapCliError(event, "anthropic");
      return { status: mapped.status, body: mapped.body };
    } else if (event.type === "done") {
      doneReason = event.stopReason;
    }
  }

  const content: Array<{ type: "thinking"; thinking: string } | { type: "text"; text: string }> = [];
  if (thinking.length > 0) {
    content.push({ type: "thinking", thinking });
  }
  content.push({ type: "text", text });

  const usage = lastUsage
    ? usageFromEvent(lastUsage)
    : {
        input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        output_tokens: 0,
      };

  return {
    id: `msg_${opts.requestId}`,
    type: "message",
    role: "assistant",
    model: opts.model,
    content,
    stop_reason: stopReasonFromDone(doneReason),
    stop_sequence: null,
    usage,
  };
}
