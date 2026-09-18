import type { FastifyInstance } from "fastify";
import type { DbHandle } from "../db/db.js";
import {
  buildCatalog,
  listAnthropicModels,
  listOpenAiModels,
} from "../protocol/model-catalog.js";

export function registerModelsRoute(app: FastifyInstance, db: DbHandle): void {
  app.get("/models", async (request) => {
    const catalog = await buildCatalog(db);
    const anthropicVersion = request.headers["anthropic-version"];
    if (typeof anthropicVersion === "string" && anthropicVersion.length > 0) {
      return listAnthropicModels(catalog);
    }
    return listOpenAiModels(catalog);
  });
}
