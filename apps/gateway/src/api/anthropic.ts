import type { FastifyInstance } from "fastify";
import type { GatewayConfig } from "../config.js";
import type { DbHandle } from "../db/db.js";
import { normalizeAnthropic } from "../protocol/normalize-anthropic.js";
import { handleChatRequest, wrapNormalize } from "./chat-handler.js";

export function registerAnthropicRoutes(app: FastifyInstance, db: DbHandle, config: GatewayConfig): void {
  const normalize = wrapNormalize(normalizeAnthropic);

  app.post("/messages", async (request, reply) => {
    const chatRequest = normalize(request, reply, request.body);
    if (!chatRequest) {
      return;
    }
    await handleChatRequest(request, reply, db, chatRequest, request.body, { dataDir: config.dataDir });
  });
}
