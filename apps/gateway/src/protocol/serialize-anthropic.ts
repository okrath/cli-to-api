import type { ServerResponse } from "node:http";
import type { CliEvent } from "../core/types.js";
import { mapCliError } from "./errors.js";
import { writeFrame } from "./sse.js";

export interface AnthropicSerializeOptions {
  requestId: string;
  model: string;
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

type FrameWriter = (event: string, data: unknown) => void;

export function collectAnthropicStreamFrames(
  events: Iterable<CliEvent>,
  opts: AnthropicSerializeOptions,
): string[] {
  const frames: string[] = [];
  writeAnthropicStream(events, opts, (event, data) => {
    frames.push(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });
  return frames;
}

function writeAnthropicStream(
  events: Iterable<CliEvent>,
  opts: AnthropicSerializeOptions,
  push: FrameWriter,
): void {
  const eventList = [...events];
  let lastUsage: Extract<CliEvent, { type: "usage" }> | undefined;
  const firstUsage = eventList.find(
    (event): event is Extract<CliEvent, { type: "usage" }> => event.type === "usage",
  );
  let thinkingStarted = false;
  let textStarted = false;
  let doneReason: "end_turn" | "max_tokens" | "error" = "end_turn";
  let started = false;
  const textIndex = () => (thinkingStarted ? 1 : 0);

  const initialUsage = firstUsage
    ? {
        input_tokens: firstUsage.input,
        cache_read_input_tokens: firstUsage.cachedInput,
        cache_creation_input_tokens: firstUsage.cacheWrite,
      }
    : { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

  push("message_start", {
    type: "message_start",
    message: {
      id: `msg_${opts.requestId}`,
      type: "message",
      role: "assistant",
      model: opts.model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: initialUsage,
    },
  });

  for (const event of eventList) {
    if (event.type === "usage") {
      lastUsage = event;
      continue;
    }

    if (event.type === "thinking_delta") {
      started = true;
      if (!thinkingStarted) {
        thinkingStarted = true;
        push("content_block_start", {
          type: "content_block_start",
          index: 0,
          content_block: { type: "thinking", thinking: "" },
        });
      }
      push("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: event.text },
      });
    } else if (event.type === "text_delta") {
      started = true;
      if (thinkingStarted && !textStarted) {
        push("content_block_stop", { type: "content_block_stop", index: 0 });
      }
      if (!textStarted) {
        textStarted = true;
        push("content_block_start", {
          type: "content_block_start",
          index: textIndex(),
          content_block: { type: "text", text: "" },
        });
      }
      push("content_block_delta", {
        type: "content_block_delta",
        index: textIndex(),
        delta: { type: "text_delta", text: event.text },
      });
    } else if (event.type === "error") {
      const mapped = mapCliError(event, "anthropic");
      if (!started) {
        throw mapped;
      }
      push("error", mapped.body);
      return;
    } else if (event.type === "done") {
      doneReason = event.stopReason;
    }
  }

  if (thinkingStarted && !textStarted) {
    push("content_block_stop", { type: "content_block_stop", index: 0 });
  }
  if (textStarted) {
    push("content_block_stop", { type: "content_block_stop", index: textIndex() });
  }

  const usage = lastUsage
    ? usageFromEvent(lastUsage)
    : { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 };

  push("message_delta", {
    type: "message_delta",
    delta: { stop_reason: stopReasonFromDone(doneReason), stop_sequence: null },
    usage: {
      output_tokens: usage.output_tokens ?? 0,
      input_tokens: usage.input_tokens,
      cache_read_input_tokens: usage.cache_read_input_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens,
    },
  });
  push("message_stop", { type: "message_stop" });
}

export async function streamAnthropicEvents(
  raw: ServerResponse,
  events: AsyncIterable<CliEvent>,
  opts: AnthropicSerializeOptions,
): Promise<void> {
  let firstEventReceived = false;
  const heartbeat = setInterval(() => {
    if (!firstEventReceived) {
      writeFrame(raw, "{}", "ping");
    }
  }, 15_000);

  const push = (event: string, data: unknown) => {
    firstEventReceived = true;
    writeFrame(raw, JSON.stringify(data), event);
  };

  try {
    const buffered: CliEvent[] = [];
    for await (const event of events) {
      firstEventReceived = true;
      buffered.push(event);
    }
    writeAnthropicStream(buffered, opts, push);
  } finally {
    clearInterval(heartbeat);
  }
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
