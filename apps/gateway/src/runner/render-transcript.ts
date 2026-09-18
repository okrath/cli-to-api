import type { ChatMessage } from "../core/types.js";

export function renderTranscript(
  messages: ChatMessage[],
  opts?: { resume?: boolean; prependSystemInPrompt?: boolean },
): { systemPrompt?: string; prompt: string } {
  let systemPrompt: string | undefined;
  let conversation = messages;

  if (messages[0]?.role === "system") {
    systemPrompt = messages[0].content;
    conversation = messages.slice(1);
  }

  if (opts?.resume) {
    const lastUser = [...conversation].reverse().find((m) => m.role === "user");
    return { prompt: lastUser?.content ?? "" };
  }

  const userMessages = conversation.filter((m) => m.role === "user");
  const assistantMessages = conversation.filter((m) => m.role === "assistant");

  let prompt: string;
  if (userMessages.length === 1 && assistantMessages.length === 0) {
    prompt = userMessages[0]!.content;
  } else {
    const lines: string[] = ["<conversation>"];
    for (const msg of conversation) {
      if (msg.role === "user") {
        lines.push("[user]", msg.content);
      } else if (msg.role === "assistant") {
        lines.push("[assistant]", msg.content);
      }
    }
    lines.push(
      "</conversation>",
      "Continue the conversation. Reply as the assistant to the last user message only.",
    );
    prompt = lines.join("\n");
  }

  if (systemPrompt && opts?.prependSystemInPrompt) {
    prompt = `<system>${systemPrompt}</system>\n\n${prompt}`;
    return { prompt };
  }

  return { systemPrompt, prompt };
}
