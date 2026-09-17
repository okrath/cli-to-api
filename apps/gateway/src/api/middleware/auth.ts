import { FastifyRequest, FastifyReply } from "fastify";
import { env } from "../../config/env.js";

export async function authMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Allow healthz without auth
  if (req.url === "/healthz" || req.url === "/api/health") {
    return;
  }

  const isAnthropic = req.url.startsWith("/v1/messages");
  const authHeader = req.headers.authorization;
  const xApiKey = req.headers["x-api-key"] as string | undefined;

  let token: string | undefined;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.replace("Bearer ", "").trim();
  } else if (xApiKey) {
    token = xApiKey.trim();
  }

  if (!token) {
    if (isAnthropic) {
      return reply.status(401).send({
        type: "error",
        error: {
          type: "authentication_error",
          message: "x-api-key header or Bearer authorization required",
        },
      });
    }
    return reply.status(401).send({
      error: {
        message: "You didn't provide an API key. You need to provide your API key in an Authorization header using Bearer auth (i.e. Authorization: Bearer YOUR_KEY).",
        type: "invalid_request_error",
        param: null,
        code: "invalid_api_key",
      },
    });
  }

  // Valid if matches default API key, admin token, or starts with sk-cta- or sk-ant-
  const isValid =
    token === env.DEFAULT_API_KEY ||
    token === env.ADMIN_TOKEN ||
    token.startsWith("sk-cta-") ||
    token.startsWith("sk-ant-");

  if (!isValid) {
    if (isAnthropic) {
      return reply.status(401).send({
        type: "error",
        error: {
          type: "authentication_error",
          message: "invalid x-api-key provided",
        },
      });
    }
    return reply.status(401).send({
      error: {
        message: "Incorrect API key provided.",
        type: "invalid_request_error",
        param: null,
        code: "invalid_api_key",
      },
    });
  }
}
