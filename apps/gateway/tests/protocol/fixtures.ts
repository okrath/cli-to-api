import type { CliEvent } from "../../src/core/types.js";

/** CliEvent sequence matching claude-code-2.1.276-pong.jsonl parse output. */
export const PONG_EVENTS: CliEvent[] = [
  { type: "session", cliSessionId: "7b935286-c7c9-4f34-8017-51e6f58bb846" },
  { type: "thinking_delta", text: "" },
  { type: "text_delta", text: "p" },
  { type: "text_delta", text: "ong" },
  {
    type: "usage",
    input: 10,
    cachedInput: 21894,
    cacheWrite: 12828,
    output: 43,
    reasoning: 35,
    costUsd: 0.0290234,
  },
  { type: "done", stopReason: "end_turn" },
];
