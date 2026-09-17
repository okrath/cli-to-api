import { describe, it, expect, beforeAll } from "vitest";
import { globalSessionThreadManager } from "../../apps/gateway/src/router/session-thread-manager.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { db } from "../../apps/gateway/src/db/index.js";
import { conversationThreads } from "../../apps/gateway/src/db/schema.js";
import { eq } from "drizzle-orm";

describe("SessionThreadManager & Merkle Prefix Hashing", () => {
  beforeAll(async () => {
    runMigrations();
  });

  it("computes deterministic client scope token", () => {
    const s1 = globalSessionThreadManager.computeClientScope("Bearer sk-cta-dev", "127.0.0.1");
    const s2 = globalSessionThreadManager.computeClientScope("Bearer sk-cta-dev", "127.0.0.1");
    const s3 = globalSessionThreadManager.computeClientScope("Bearer other-token", "127.0.0.1");

    expect(s1).toBe(s2);
    expect(s1).not.toBe(s3);
  });

  it("computes identical root hash for identical initial prompt within same scope", () => {
    const scope = "scope_test_1";
    const m0 = { role: "user", content: "Đây là dàn ý tiểu thuyết: ..." };

    const h1 = globalSessionThreadManager.computeRootHash(scope, m0);
    const h2 = globalSessionThreadManager.computeRootHash(scope, m0);

    expect(h1).toBe(h2);
    expect(h1.length).toBeGreaterThan(10);
  });

  it("resolves Turn 1 as new thread, then Turn 2 as linear continuation with delta prompt", async () => {
    const authHeader = "Bearer sk-test-session";
    const clientIp = "192.168.1.50";
    const m0 = { role: "user", content: "Dàn ý: Nhân vật chính là A, sống tại Hà Nội." };

    // Turn 1
    const turn1 = await globalSessionThreadManager.resolveThread({
      authHeader,
      clientIp,
      messages: [m0],
      adapterId: "claude-code",
      requestedModel: "claude/opus",
    });

    expect(turn1.isResume).toBe(false);
    expect(turn1.cliSessionId).toBeDefined(); // Pre-generated UUID for Claude
    expect(turn1.deltaPrompt).toContain("Dàn ý: Nhân vật chính là A");

    // Save state after Turn 1
    await globalSessionThreadManager.saveThreadState({
      threadId: turn1.threadId,
      clientScope: turn1.clientScope,
      rootHash: turn1.rootHash,
      leafHash: turn1.leafHash,
      adapterId: "claude-code",
      accountId: "claude",
      cliSessionId: turn1.cliSessionId,
    });

    // Turn 2
    const m1_assistant = { role: "assistant", content: "Tôi đã hiểu dàn ý của bạn." };
    const m2_user = { role: "user", content: "Dựa vào đó hãy viết chương 1." };

    const turn2 = await globalSessionThreadManager.resolveThread({
      authHeader,
      clientIp,
      messages: [m0, m1_assistant, m2_user],
      adapterId: "claude-code",
      requestedModel: "claude/opus",
    });

    expect(turn2.isResume).toBe(true);
    expect(turn2.threadId).toBe(turn1.threadId);
    expect(turn2.cliSessionId).toBe(turn1.cliSessionId); // Preserved session ID!
    expect(turn2.boundAccountId).toBe("claude");

    // CRITICAL: deltaPrompt contains ONLY Turn 2 user message!
    expect(turn2.deltaPrompt).toBe("Dựa vào đó hãy viết chương 1.");
    expect(turn2.deltaPrompt).not.toContain("Dàn ý: Nhân vật chính là A");

    // Clean up
    await db.delete(conversationThreads).where(eq(conversationThreads.id, turn1.threadId));
  });
  it("handles OpenAI multimodal array content without throwing trim error", async () => {
    const authHeader = "Bearer sk-test-multimodal";
    const clientIp = "127.0.0.1";
    const m0 = {
      role: "system",
      content: "Bạn là trợ lý viết tiểu thuyết",
    };
    const m1_multimodal = {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: "data:image/webp;base64,123" } },
        { type: "text", text: "Hãy phân tích hình ảnh này" },
      ],
    };

    const turn1 = await globalSessionThreadManager.resolveThread({
      authHeader,
      clientIp,
      messages: [m0, m1_multimodal],
      adapterId: "claude-code",
      requestedModel: "claude/opus",
    });

    expect(turn1.threadId).toBeDefined();
    expect(turn1.deltaPrompt).toContain("Hãy phân tích hình ảnh này");
    expect(turn1.deltaPrompt).not.toContain("[object Object]");

    await db.delete(conversationThreads).where(eq(conversationThreads.id, turn1.threadId));
  });
});
