import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { globalPipelineStore } from "../../router/pipeline-store.js";
import type { CreatePipelineInput, UpdatePipelineInput } from "../../router/pipeline-store.js";

export function registerAdminGroupsRoutes(fastify: FastifyInstance): void {
  // GET /api/routing-groups
  fastify.get("/api/routing-groups", async (_req: FastifyRequest, reply: FastifyReply) => {
    const list = await globalPipelineStore.listPipelines(true);
    return reply.send({ groups: list });
  });

  // POST /api/routing-groups
  fastify.post("/api/routing-groups", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as CreatePipelineInput;
    if (!body.name) {
      return reply.status(400).send({ error: "Missing required 'name' field" });
    }

    try {
      const created = await globalPipelineStore.createPipeline(body);
      return reply.status(201).send({ group: created });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  // GET /api/routing-groups/:id
  fastify.get("/api/routing-groups/:id", async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const group = await globalPipelineStore.getPipeline(id);
    if (!group) {
      return reply.status(404).send({ error: `Routing group '${id}' not found` });
    }
    return reply.send({ group });
  });

  // PUT /api/routing-groups/:id
  fastify.put("/api/routing-groups/:id", async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const body = req.body as UpdatePipelineInput;
    try {
      const updated = await globalPipelineStore.updatePipeline(id, body);
      if (!updated) {
        return reply.status(404).send({ error: `Routing group '${id}' not found` });
      }
      return reply.send({ group: updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  // DELETE /api/routing-groups/:id
  fastify.delete("/api/routing-groups/:id", async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const deleted = await globalPipelineStore.deletePipeline(id);
    if (!deleted) {
      return reply.status(404).send({ error: `Routing group '${id}' not found` });
    }
    return reply.send({ success: true });
  });

  // GET /api/routing-groups/:id/failovers
  fastify.get("/api/routing-groups/:id/failovers", async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const events = await globalPipelineStore.listFailoverEvents(id);
    return reply.send({ events });
  });
}
