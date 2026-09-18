import crypto from "node:crypto";
import { db } from "../db/index.js";
import { conversationThreads } from "../db/schema.js";
import { eq, and, gt } from "drizzle-orm";
import { normalizeContentToString, ChatMessage } from "../utils/content-normalizer.js";

export type { ChatMessage };

export interface ThreadResolutionParams {
  explicitId?: string;
  authHeader?: string;
  clientIp?: string;
  messages: ChatMessage[];
  adapterId: string;
  requestedModel: string;
}

export interface ThreadResolutionResult {
  threadId: string;
  isResume: boolean;
  cliSessionId?: string;
  deltaPrompt: string;
  boundAccountId?: string;
  rootHash: string;
  leafHash: string;
  clientScope: string;
}

export class SessionThreadManager {
  /**
   * Generates a client scope token hash to prevent collisions across multiple users or localhost tabs.
   */
  public computeClientScope(authHeader?: string, clientIp?: string): string {
    const raw = `${authHeader || "anon"}::${clientIp || "127.0.0.1"}`;
    return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
  }

  /**
   * Computes the Merkle root hash for the initial turn (message[0]).
   */
  public computeRootHash(clientScope: string, m0: ChatMessage): string {
    const textContent = normalizeContentToString(m0?.content);
    const raw = `${clientScope}::${m0?.role || "user"}::${textContent.trim()}`;
    return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
  }

  /**
   * Computes the Merkle leaf hash for the cumulative conversation chain.
   */
  public computeLeafHash(clientScope: string, messages: ChatMessage[]): string {
    if (messages.length === 0) return "";
    let current = this.computeRootHash(clientScope, messages[0]);

    for (let i = 1; i < messages.length; i++) {
      const m = messages[i];
      const textContent = normalizeContentToString(m?.content);
      const chunk = `${current}::${m.role}::${textContent.trim()}`;
      current = crypto.createHash("sha256").update(chunk).digest("hex").slice(0, 24);
    }
    return current;
  }

  /**
   * Resolves whether an incoming chat completion request belongs to an existing conversation thread.
   */
  public async resolveThread(params: ThreadResolutionParams): Promise<ThreadResolutionResult> {
    const { explicitId, authHeader, clientIp, messages, adapterId } = params;
    const now = Math.floor(Date.now() / 1000);

    const clientScope = this.computeClientScope(authHeader, clientIp);
    const firstUserMsg = messages.find((m) => m.role === "user") || messages[0] || { role: "user", content: "" };
    const rootHash = this.computeRootHash(clientScope, firstUserMsg);
    const leafHash = this.computeLeafHash(clientScope, messages);

    const threadId = explicitId?.trim() || `th_${clientScope}_${rootHash}`;

    // Query active thread in database
    const existing = await db
      .select()
      .from(conversationThreads)
      .where(
        and(
          eq(conversationThreads.id, threadId),
          eq(conversationThreads.status, "ACTIVE"),
          gt(conversationThreads.expiresAt, now)
        )
      );

    // If active thread exists AND conversation contains prior assistant turns -> Resumed linear conversation!
    const hasPriorAssistantTurn = messages.some((m) => m.role === "assistant");
    if (existing.length > 0 && hasPriorAssistantTurn) {
      const thread = existing[0];
      const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
      const rawContent = lastUserMessage?.content ?? messages[messages.length - 1]?.content;
      const deltaPrompt = normalizeContentToString(rawContent);

      return {
        threadId,
        isResume: true,
        cliSessionId: thread.cliSessionId || undefined,
        deltaPrompt,
        boundAccountId: thread.accountId,
        rootHash,
        leafHash,
        clientScope,
      };
    }

    // New conversation (Turn 1 / root)
    const initialPrompt = this.flattenMessages(messages);
    const isClaude = adapterId === "claude-code" || adapterId === "claude";
    const initialSessionId = isClaude ? crypto.randomUUID() : undefined;

    return {
      threadId,
      isResume: false,
      cliSessionId: initialSessionId,
      deltaPrompt: initialPrompt,
      rootHash,
      leafHash,
      clientScope,
    };
  }

  /**
   * Persists or updates thread state in SQLite upon turn completion.
   */
  public async saveThreadState(params: {
    threadId: string;
    clientScope: string;
    rootHash: string;
    leafHash: string;
    adapterId: string;
    accountId: string;
    cliSessionId?: string;
  }): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const slidingTtlSeconds = 3600; // 60 minutes sliding TTL
    const expiresAt = now + slidingTtlSeconds;

    const existing = await db
      .select()
      .from(conversationThreads)
      .where(eq(conversationThreads.id, params.threadId));

    if (existing.length === 0) {
      await db.insert(conversationThreads).values({
        id: params.threadId,
        clientScope: params.clientScope,
        rootHash: params.rootHash,
        leafHash: params.leafHash,
        adapterId: params.adapterId,
        accountId: params.accountId,
        cliSessionId: params.cliSessionId,
        totalTurns: 1,
        lastActiveAt: now,
        expiresAt,
        status: "ACTIVE",
      });
    } else {
      const current = existing[0];
      await db
        .update(conversationThreads)
        .set({
          leafHash: params.leafHash,
          cliSessionId: params.cliSessionId || current.cliSessionId,
          totalTurns: current.totalTurns + 1,
          lastActiveAt: now,
          expiresAt,
          status: "ACTIVE",
        })
        .where(eq(conversationThreads.id, params.threadId));
    }
  }

  private flattenMessages(messages: ChatMessage[]): string {
    if (messages.length === 1) {
      return normalizeContentToString(messages[0].content);
    }

    return messages
      .map((m) => {
        const rolePrefix =
          m.role === "system"
            ? "System Instructions:"
            : m.role === "user"
              ? "Human:"
              : "Assistant:";
        const text = normalizeContentToString(m.content);
        return `${rolePrefix}\n${text}`;
      })
      .join("\n\n");
  }
}

export const globalSessionThreadManager = new SessionThreadManager();
