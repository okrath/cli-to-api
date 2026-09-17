import { FastifyRequest, FastifyReply } from "fastify";
import { env } from "../../config/env.js";

export async function authMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Allow healthz without auth
  if (req.url === "/healthz" || req.url === "/api/health") {
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({
      error: {
        message: "You didn't provide an API key. You need to provide your API key in an Authorization header using Bearer auth (i.e. Authorization: Bearer YOUR_KEY).",
        type: "invalid_request_error",
        param: null,
        code: "invalid_api_key",
      },
    });
  }

  const token = authHeader.replace("Bearer ", "").trim();
  // Valid if matches default API key or admin token or starts with sk-cta-
  const isValid = token === env.DEFAULT_API_KEY || token === env.ADMIN_TOKEN || token.startsWith("sk-cta-");

  if (!isValid) {
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
