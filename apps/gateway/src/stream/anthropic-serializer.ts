export interface AnthropicContentBlock {
  type: "thinking" | "text";
  thinking?: string;
  text?: string;
  signature?: string;
}

export interface AnthropicMessageResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Serializes a unary non-streaming message response in Anthropic format
 */
export function formatAnthropicMessage(options: {
  id: string;
  model: string;
  content: string;
  thoughtContent?: string | null;
  inputTokens: number;
  outputTokens: number;
  stopReason?: "end_turn" | "max_tokens" | "stop_sequence" | null;
}): AnthropicMessageResponse {
  const contentBlocks: AnthropicContentBlock[] = [];

  if (options.thoughtContent && options.thoughtContent.trim().length > 0) {
    contentBlocks.push({
      type: "thinking",
      thinking: options.thoughtContent,
    });
  }

  contentBlocks.push({
    type: "text",
    text: options.content || "",
  });

  return {
    id: options.id.startsWith("msg_") ? options.id : `msg_${options.id}`,
    type: "message",
    role: "assistant",
    content: contentBlocks,
    model: options.model,
    stop_reason: options.stopReason || "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: options.inputTokens,
      output_tokens: options.outputTokens,
    },
  };
}

/**
 * Formats an Anthropic SSE message_start event
 */
export function formatAnthropicMessageStart(
  messageId: string,
  model: string,
  inputTokens: number
): string {
  const id = messageId.startsWith("msg_") ? messageId : `msg_${messageId}`;
  const payload = {
    type: "message_start",
    message: {
      id,
      type: "message",
      role: "assistant",
      content: [],
      model,
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: inputTokens,
        output_tokens: 1,
      },
    },
  };
  return `event: message_start\ndata: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Formats an Anthropic SSE content_block_start event
 */
export function formatAnthropicBlockStart(
  index: number,
  blockType: "thinking" | "text"
): string {
  const payload = {
    type: "content_block_start",
    index,
    content_block:
      blockType === "thinking"
        ? { type: "thinking", thinking: "" }
        : { type: "text", text: "" },
  };
  return `event: content_block_start\ndata: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Formats an Anthropic SSE content_block_delta event
 */
export function formatAnthropicBlockDelta(
  index: number,
  deltaType: "thinking_delta" | "text_delta",
  chunk: string
): string {
  const payload = {
    type: "content_block_delta",
    index,
    delta:
      deltaType === "thinking_delta"
        ? { type: "thinking_delta", thinking: chunk }
        : { type: "text_delta", text: chunk },
  };
  return `event: content_block_delta\ndata: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Formats an Anthropic SSE content_block_stop event
 */
export function formatAnthropicBlockStop(index: number): string {
  const payload = {
    type: "content_block_stop",
    index,
  };
  return `event: content_block_stop\ndata: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Formats an Anthropic SSE message_delta event
 */
export function formatAnthropicMessageDelta(
  outputTokens: number,
  stopReason: "end_turn" | "max_tokens" | "stop_sequence" = "end_turn"
): string {
  const payload = {
    type: "message_delta",
    delta: {
      stop_reason: stopReason,
      stop_sequence: null,
    },
    usage: {
      output_tokens: outputTokens,
    },
  };
  return `event: message_delta\ndata: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Formats an Anthropic SSE message_stop event
 */
export function formatAnthropicMessageStop(): string {
  const payload = {
    type: "message_stop",
  };
  return `event: message_stop\ndata: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Formats an Anthropic SSE ping event
 */
export function formatAnthropicPing(): string {
  return `event: ping\ndata: {"type":"ping"}\n\n`;
}

/**
 * Formats an Anthropic SSE error event
 */
export function formatAnthropicSseError(
  errorType: string,
  message: string
): string {
  const payload = {
    type: "error",
    error: {
      type: errorType,
      message,
    },
  };
  return `event: error\ndata: ${JSON.stringify(payload)}\n\n`;
}
