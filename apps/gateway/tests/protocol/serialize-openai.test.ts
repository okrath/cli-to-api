import { describe, expect, it } from "vitest";
import {
  openAiStreamFrames,
  serializeOpenAiCompletion,
} from "../../src/protocol/serialize-openai.js";
import { asAsyncEvents, PONG_EVENTS } from "./fixtures.js";

const opts = {
  requestId: "abc123",
  model: "claude-sonnet-4-5",
  includeUsage: true,
  created: 1_700_000_000,
};

describe("openAiStreamFrames", () => {
  it("matches snapshot for pong events", async () => {
    const frames: string[] = [];
    for await (const frame of openAiStreamFrames(await asAsyncEvents(PONG_EVENTS), opts)) {
      frames.push(frame);
    }
    expect(frames).toMatchSnapshot();
  });
});

describe("serializeOpenAiCompletion", () => {
  it("matches snapshot for pong events", () => {
    const body = serializeOpenAiCompletion(PONG_EVENTS, opts);
    expect(body).toMatchSnapshot();
  });
});
