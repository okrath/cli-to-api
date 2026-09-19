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

type BlockKind = "thinking" | "text" | "tool_use";

function stopReasonFromDone(
  reason: "end_turn" | "max_tokens" | "tool_use" | "error",
): "end_turn" | "max_tokens" | "tool_use" {
  if (reason === "max_tokens") {
    return "max_tokens";
  }
  if (reason === "tool_use") {
    return "tool_use";
  }
  return "end_turn";
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
  let doneReason: "end_turn" | "max_tokens" | "tool_use" | "error" = "end_turn";
  let started = false;
  let blockIndex = -1;
  let openBlock: BlockKind | null = null;

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

  const closeOpenBlock = function* (): Generator<AnthropicStreamFrame> {
    if (openBlock === null) {
      return;
    }
    yield { event: "content_block_stop", data: { type: "content_block_stop", index: blockIndex } };
    openBlock = null;
  };

  const openBlockOfKind = function* (kind: BlockKind): Generator<AnthropicStreamFrame> {
    yield* closeOpenBlock();
    blockIndex++;
    openBlock = kind;
    if (kind === "thinking") {
      yield {
        event: "content_block_start",
        data: {
          type: "content_block_start",
          index: blockIndex,
          content_block: { type: "thinking", thinking: "" },
        },
      };
    } else if (kind === "text") {
      yield {
        event: "content_block_start",
        data: {
          type: "content_block_start",
          index: blockIndex,
          content_block: { type: "text", text: "" },
        },
      };
    } else {
      yield {
        event: "content_block_start",
        data: {
          type: "content_block_start",
          index: blockIndex,
          content_block: { type: "tool_use", id: "", name: "", input: {} },
        },
      };
    }
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

    if (event.type === "usage") {
      lastUsage = event;
      continue;
    }

    if (event.type === "thinking_delta") {
      if (!messageStarted) {
        yield ensureMessageStart();
        started = true;
      }
      if (openBlock !== "thinking") {
        yield* openBlockOfKind("thinking");
      }
      yield {
        event: "content_block_delta",
        data: {
          type: "content_block_delta",
          index: blockIndex,
          delta: { type: "thinking_delta", thinking: event.text },
        },
      };
    } else if (event.type === "text_delta") {
      if (!messageStarted) {
        yield ensureMessageStart();
        started = true;
      }
      if (openBlock !== "text") {
        yield* openBlockOfKind("text");
      }
      yield {
        event: "content_block_delta",
        data: {
          type: "content_block_delta",
          index: blockIndex,
          delta: { type: "text_delta", text: event.text },
        },
      };
    } else if (event.type === "tool_call") {
      if (!messageStarted) {
        yield ensureMessageStart();
        started = true;
      }
      yield* closeOpenBlock();
      blockIndex++;
      openBlock = "tool_use";
      yield {
        event: "content_block_start",
        data: {
          type: "content_block_start",
          index: blockIndex,
          content_block: { type: "tool_use", id: event.id, name: event.name, input: {} },
        },
      };
      yield {
        event: "content_block_delta",
        data: {
          type: "content_block_delta",
          index: blockIndex,
          delta: { type: "input_json_delta", partial_json: event.argumentsJson },
        },
      };
      yield { event: "content_block_stop", data: { type: "content_block_stop", index: blockIndex } };
      openBlock = null;
    } else if (event.type === "done") {
      if (!messageStarted) {
        yield ensureMessageStart();
        started = true;
      }
      doneReason = event.stopReason;
    }
  }

  if (!messageStarted) {
    return;
  }

  yield* closeOpenBlock();

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

export type AnthropicContentBlock =
  | { type: "thinking"; thinking: string }
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export interface AnthropicMessage {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: AnthropicContentBlock[];
  stop_reason: "end_turn" | "max_tokens" | "tool_use";
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
  let doneReason: "end_turn" | "max_tokens" | "tool_use" | "error" = "end_turn";
  const content: AnthropicContentBlock[] = [];

  for (const event of events) {
    if (event.type === "thinking_delta") {
      thinking += event.text;
    } else if (event.type === "text_delta") {
      text += event.text;
    } else if (event.type === "tool_call") {
      if (thinking.length > 0) {
        content.push({ type: "thinking", thinking });
        thinking = "";
      }
      if (text.length > 0) {
        content.push({ type: "text", text });
        text = "";
      }
      content.push({
        type: "tool_use",
        id: event.id,
        name: event.name,
        input: JSON.parse(event.argumentsJson) as Record<string, unknown>,
      });
    } else if (event.type === "usage") {
      lastUsage = event;
    } else if (event.type === "error") {
      const mapped = mapCliError(event, "anthropic");
      return { status: mapped.status, body: mapped.body };
    } else if (event.type === "done") {
      doneReason = event.stopReason;
    }
  }

  if (thinking.length > 0) {
    content.push({ type: "thinking", thinking });
  }
  if (text.length > 0 || content.length === 0) {
    content.push({ type: "text", text });
  }

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
