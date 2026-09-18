import type { FastifyInstance } from "fastify";
import type { GatewayConfig } from "../config.js";
import type { DbHandle } from "../db/db.js";
import { normalizeOpenAi } from "../protocol/normalize-openai.js";
import { handleChatRequest, wrapNormalize } from "./chat-handler.js";

export function registerOpenAiRoutes(app: FastifyInstance, db: DbHandle, config: GatewayConfig): void {
  const normalize = wrapNormalize(normalizeOpenAi);

  app.post("/chat/completions", async (request, reply) => {
    const chatRequest = normalize(request, reply, request.body);
    if (!chatRequest) {
      return;
    }
    await handleChatRequest(request, reply, db, chatRequest, request.body, { dataDir: config.dataDir });
  });
}
