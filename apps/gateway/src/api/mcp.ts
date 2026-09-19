import type { FastifyInstance } from "fastify";
import {
  deliverToolResults,
  getBridge,
  listBridgeTools,
  onMcpCall as bridgeOnMcpCall,
} from "../router/tool-bridge.js";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export function registerMcpRoutes(app: FastifyInstance, opts: { version: string }): void {
  app.route({
    method: ["GET", "POST", "DELETE"],
    url: "/mcp/:bridgeId",
    handler: async (request, reply) => {
      const { bridgeId } = request.params as { bridgeId: string };

      if (request.method === "GET") {
        return reply.code(405).send();
      }

      if (request.method === "DELETE") {
        if (!getBridge(bridgeId)) {
          return reply.code(404).send({ error: "unknown bridge" });
        }
        return reply.code(200).send();
      }

      const bridge = getBridge(bridgeId);
      if (!bridge) {
        return reply.code(404).send({ error: "unknown bridge" });
      }

      const body = request.body;
      if (Array.isArray(body)) {
        return reply.code(400).send({ error: "batch requests not supported" });
      }

      const msg = body as JsonRpcRequest;
      const method = msg.method ?? "";
      request.log.debug({ bridgeId, method }, "mcp request");

      if (msg.id == null) {
        return reply.code(202).send();
      }

      const id = msg.id;

      switch (method) {
        case "server/discover":
          return reply.send({ jsonrpc: "2.0", id, result: {} });

        case "initialize": {
          const params = msg.params ?? {};
          const protocolVersion = String(params.protocolVersion ?? "2024-11-05");
          return reply.send({
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion,
              capabilities: { tools: {} },
              serverInfo: { name: "cta", version: opts.version },
            },
          });
        }

        case "tools/list":
          return reply.send({
            jsonrpc: "2.0",
            id,
            result: { tools: listBridgeTools(bridge) },
          });

        case "tools/call": {
          const params = msg.params ?? {};
          const name = String(params.name ?? "");
          const args = (params.arguments ?? {}) as Record<string, unknown>;
          const meta = params._meta as Record<string, unknown> | undefined;
          const toolUseId =
            typeof meta?.["claudecode/toolUseId"] === "string"
              ? meta["claudecode/toolUseId"]
              : undefined;

          try {
            const result = await bridgeOnMcpCall(bridge, {
              name,
              argumentsJson: JSON.stringify(args),
              toolUseId,
            });
            return reply.send({
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: result.content }],
                isError: result.isError,
              },
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message === "tool result timed out" || message.includes("timed out")) {
              return reply.send({
                jsonrpc: "2.0",
                id,
                error: { code: -32000, message: "tool result timed out" },
              });
            }
            throw err;
          }
        }

        case "ping":
          return reply.send({ jsonrpc: "2.0", id, result: {} });

        default:
          return reply.send({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Method not found: ${method}` },
          });
      }
    },
  });
}

// Re-export for tests that wire deliverToolResults through the endpoint
export { deliverToolResults };
