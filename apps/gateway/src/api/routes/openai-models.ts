import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { globalModelCatalog } from "../../router/model-catalog.js";

export function registerOpenAiModelsRoutes(fastify: FastifyInstance): void {
  // GET /v1/models
  fastify.get(
    "/v1/models",
    async (req: FastifyRequest<{ Querystring: { include_auto?: string } }>, reply: FastifyReply) => {
      const includeAuto = req.query?.include_auto === "true" || req.headers["x-include-auto"] === "true";
      const list = globalModelCatalog.getOpenAiModelsList(true, includeAuto);
      return reply.send(list);
    }
  );

  // GET /v1/models/:modelId
  fastify.get(
    "/v1/models/:modelId",
    async (
      req: FastifyRequest<{ Params: { modelId: string }; Querystring: { include_auto?: string } }>,
      reply: FastifyReply
    ) => {
      const { modelId } = req.params;
      const includeAuto = req.query?.include_auto === "true" || req.headers["x-include-auto"] === "true";
      const list = globalModelCatalog.getOpenAiModelsList(true, includeAuto);
      const found = list.data.find((m) => m.id === modelId);

      if (!found) {
        return reply.status(404).send({
          error: {
            message: `The model '${modelId}' does not exist`,
            type: "invalid_request_error",
            param: "model",
            code: "model_not_found",
          },
        });
      }

      return reply.send(found);
    }
  );
}
