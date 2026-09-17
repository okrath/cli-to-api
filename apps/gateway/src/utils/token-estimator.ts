import { normalizeContentToString, MessageContent } from "./content-normalizer.js";

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * High-performance adaptive multilingual character-class token estimator:
 * - ASCII alphanumeric & standard code: ~3.7 characters / token
 * - Unicode, CJK, and accented Vietnamese text: ~2.2 characters / token
 */
export function estimateTextTokens(text: string): number {
  if (!text || text.length === 0) return 0;

  let nonAsciiCount = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 127) {
      nonAsciiCount++;
    }
  }

  const asciiCount = text.length - nonAsciiCount;
  const estimated = Math.ceil(asciiCount / 3.7 + nonAsciiCount / 2.2);
  return Math.max(1, estimated);
}

/**
 * Estimate prompt tokens from an array of OpenAI messages.
 */
export function estimatePromptTokens(
  messages: Array<{ role: string; content: MessageContent }>
): number {
  if (!messages || messages.length === 0) return 0;
  let totalTokens = 0;
  for (const m of messages) {
    const text = normalizeContentToString(m.content);
    // +2 tokens overhead per message for role/structure formatting
    totalTokens += estimateTextTokens(text) + 2;
  }
  return Math.max(1, totalTokens);
}

/**
 * Composite prompt & completion token usage estimator.
 */
export function estimateTokenUsage(
  messages: Array<{ role: string; content: MessageContent }>,
  completionText: string
): TokenUsage {
  const promptTokens = estimatePromptTokens(messages);
  const completionTokens = completionText ? estimateTextTokens(completionText) : 0;

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}
