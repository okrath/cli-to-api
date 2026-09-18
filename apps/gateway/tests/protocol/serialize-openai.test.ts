import { describe, expect, it } from "vitest";
import {
  serializeOpenAiCompletion,
  serializeOpenAiStream,
} from "../../src/protocol/serialize-openai.js";
import { PONG_EVENTS } from "./fixtures.js";

const opts = {
  requestId: "abc123",
  model: "claude-sonnet-4-5",
  includeUsage: true,
  created: 1_700_000_000,
};

describe("serializeOpenAiStream", () => {
  it("matches snapshot for pong events", () => {
    const frames = [...serializeOpenAiStream(PONG_EVENTS, opts)];
    expect(frames).toMatchSnapshot();
  });
});

describe("serializeOpenAiCompletion", () => {
  it("matches snapshot for pong events", () => {
    const body = serializeOpenAiCompletion(PONG_EVENTS, opts);
    expect(body).toMatchSnapshot();
  });
});
