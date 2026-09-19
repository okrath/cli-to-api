import type { ChatMessage } from "../core/types.js";

function renderToolResult(msg: ChatMessage): string {
  const label = msg.isError
    ? `[tool_result id=${msg.toolCallId} error]`
    : `[tool_result id=${msg.toolCallId}]`;
  return `${label}\n${msg.content}`;
}

export function trailingToolMessages(conversation: ChatMessage[]): ChatMessage[] {
  return trailingToolResults(conversation);
}

function trailingToolResults(conversation: ChatMessage[]): ChatMessage[] {
  const trailing: ChatMessage[] = [];
  for (let i = conversation.length - 1; i >= 0; i--) {
    const msg = conversation[i]!;
    if (msg.role === "tool") {
      trailing.unshift(msg);
    } else {
      break;
    }
  }
  return trailing;
}

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
    const toolTail = trailingToolResults(conversation);
    if (toolTail.length > 0) {
      const blocks = toolTail.map(renderToolResult).join("\n");
      return { prompt: `${blocks}\nContinue with these tool results.` };
    }
    const lastUser = [...conversation].reverse().find((m) => m.role === "user");
    return { prompt: lastUser?.content ?? "" };
  }

  const userMessages = conversation.filter((m) => m.role === "user");
  const assistantMessages = conversation.filter((m) => m.role === "assistant");
  const hasToolHistory = conversation.some((m) => m.role === "tool" || m.toolCalls?.length);

  let prompt: string;
  if (userMessages.length === 1 && assistantMessages.length === 0 && !hasToolHistory) {
    prompt = userMessages[0]!.content;
  } else {
    const lines: string[] = ["<conversation>"];
    for (const msg of conversation) {
      if (msg.role === "user") {
        lines.push("[user]", msg.content);
      } else if (msg.role === "assistant") {
        lines.push("[assistant]");
        if (msg.content.length > 0) {
          lines.push(msg.content);
        }
        for (const call of msg.toolCalls ?? []) {
          lines.push(`[tool_call id=${call.id} name=${call.name}]`, call.argumentsJson);
        }
      } else if (msg.role === "tool") {
        lines.push(renderToolResult(msg));
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
