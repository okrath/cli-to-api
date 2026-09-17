export interface ChatDelta {
  role?: "assistant";
  content?: string;
  reasoning_content?: string;
}

export function formatSseChunk(
  id: string,
  model: string,
  created: number,
  delta: ChatDelta,
  finishReason: string | null = null
): string {
  const payload = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
  };

  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function formatSseDone(): string {
  return "data: [DONE]\n\n";
}
