import { describe, it, expect } from "vitest";
import { preparePromptTransport } from "../../apps/gateway/src/supervisor/prompt-transport.js";
import { dataDir } from "../../apps/gateway/src/config/paths.js";
import fs from "node:fs";
import path from "node:path";

describe("PromptTransport Manager", () => {
  const accountDir = path.join(dataDir, "sandboxes", "test-adapter", "test-acc");

  it("uses standard argv for small prompts (<4000 chars)", async () => {
    const smallPrompt = "Write a short poem about coding.";
    const invocation = await preparePromptTransport({
      argsTemplate: ["run", "--prompt", "{prompt}"],
      prompt: smallPrompt,
      model: "test-model",
      accountDir,
      preferredTransport: "auto",
    });

    expect(invocation.isTempFile).toBe(false);
    expect(invocation.finalArgs).toEqual(["run", "--prompt", smallPrompt]);
    expect(invocation.cleanupHook).toBeUndefined();
  });

  it("automatically switches to temp_file for large prompts (>4000 chars)", async () => {
    const largePrompt = "A".repeat(5000);
    const invocation = await preparePromptTransport({
      argsTemplate: ["run", "--prompt", "{prompt}"],
      argsTemplateFile: ["run", "--file", "{prompt_file}"],
      prompt: largePrompt,
      model: "test-model",
      accountDir,
      preferredTransport: "auto",
    });

    expect(invocation.isTempFile).toBe(true);
    expect(invocation.finalArgs[1]).toBe("--file");
    const filePath = invocation.finalArgs[2];
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, "utf8")).toBe(largePrompt);

    // Verify cleanup hook removes file
    if (invocation.cleanupHook) {
      await invocation.cleanupHook();
    }
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("supports stdin mode when requested", async () => {
    const prompt = "Input via stdin";
    const invocation = await preparePromptTransport({
      argsTemplate: ["run", "--model", "{model}", "{prompt}"],
      prompt,
      model: "test-model",
      accountDir,
      preferredTransport: "stdin",
    });

    expect(invocation.isTempFile).toBe(false);
    expect(invocation.stdinContent).toBe(prompt);
    expect(invocation.finalArgs).toEqual(["run", "--model", "test-model"]);
  });
});
