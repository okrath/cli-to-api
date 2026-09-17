export type MessageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: string } }
  | { type: string; [key: string]: unknown };

export type MessageContent = string | MessageContentPart[] | unknown;

export interface ChatMessage {
  role: string;
  content: MessageContent;
}

/**
 * Strips historical <think>...</think> and <thought>...</thought> blocks from message content
 * to prevent context window inflation in multi-turn conversations.
 */
export function stripThinkingTags(text: string): string {
  if (!text) return "";
  return text
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<thought\b[^>]*>[\s\S]*?<\/thought>/gi, "")
    .trim();
}

/**
 * Safely extracts a text string from an OpenAI message content,
 * handling both plain strings and OpenAI-standard multimodal/structured content arrays.
 */
export function normalizeContentToString(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (content === null || content === undefined) {
    return "";
  }

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === "string") {
        if (item.trim()) parts.push(item);
      } else if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        if (typeof obj.text === "string" && obj.text.trim()) {
          parts.push(obj.text);
        } else if (obj.type === "image_url") {
          parts.push("[image]");
        } else if (typeof obj.content === "string" && obj.content.trim()) {
          parts.push(obj.content);
        }
      }
    }
    return parts.join("\n");
  }

  if (typeof content === "object") {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === "string") {
      return obj.text;
    }
    if (obj.content !== undefined) {
      return normalizeContentToString(obj.content);
    }
  }

  return String(content || "");
}
