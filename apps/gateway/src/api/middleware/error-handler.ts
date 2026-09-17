import { FastifyError, FastifyRequest, FastifyReply } from "fastify";

export function errorHandler(error: FastifyError, _req: FastifyRequest, reply: FastifyReply): void {
  const statusCode = error.statusCode || 500;
  const is429 = statusCode === 429 || error.message?.startsWith("429");

  const response = {
    error: {
      message: error.message || "Internal server error occurred",
      type: is429 ? "rate_limit_error" : statusCode >= 500 ? "api_error" : "invalid_request_error",
      param: null,
      code: is429 ? "rate_limit_exceeded" : statusCode === 401 ? "invalid_api_key" : "server_error",
    },
  };

  reply.status(is429 ? 429 : statusCode).send(response);
}
