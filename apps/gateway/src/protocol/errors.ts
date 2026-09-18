import type { FastifyReply } from "fastify";
import type { CliEvent } from "../core/types.js";

export type ErrorDialect = "openai" | "anthropic";

export class ProtocolError extends Error {
  readonly status: number;
  readonly dialect: ErrorDialect;
  readonly code: string;

  constructor(status: number, dialect: ErrorDialect, code: string, message: string) {
    super(message);
    this.name = "ProtocolError";
    this.status = status;
    this.dialect = dialect;
    this.code = code;
  }
}

export class RouteError extends Error {
  readonly code: string;
  readonly retryAfterSec?: number;

  constructor(code: string, message?: string, retryAfterSec?: number) {
    super(message ?? code);
    this.name = "RouteError";
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

export interface MappedError {
  status: number;
  body: Record<string, unknown>;
  retryAfterSec?: number;
}

function openAiErrorBody(message: string, type: string, code?: string): Record<string, unknown> {
  return {
    error: {
      message,
      type,
      ...(code !== undefined ? { code } : {}),
    },
  };
}

function anthropicErrorBody(message: string, type: string): Record<string, unknown> {
  return {
    type: "error",
    error: { type, message },
  };
}

export function mapProtocolError(err: ProtocolError): MappedError {
  if (err.dialect === "openai") {
    return {
      status: err.status,
      body: openAiErrorBody(err.message, "invalid_request_error", err.code || undefined),
    };
  }
  return {
    status: err.status,
    body: anthropicErrorBody(err.message, "invalid_request_error"),
  };
}

export function mapModelNotFound(dialect: ErrorDialect): MappedError {
  if (dialect === "openai") {
    return {
      status: 404,
      body: openAiErrorBody("Model not found", "invalid_request_error", "model_not_found"),
    };
  }
  return {
    status: 404,
    body: anthropicErrorBody("Model not found", "not_found_error"),
  };
}

export function mapRouteError(err: RouteError, dialect: ErrorDialect): MappedError {
  switch (err.code) {
    case "model_not_found":
      return mapModelNotFound(dialect);
    case "all_rate_limited":
      return {
        status: 429,
        retryAfterSec: err.retryAfterSec,
        body:
          dialect === "openai"
            ? openAiErrorBody(err.message, "rate_limit_error")
            : anthropicErrorBody(err.message, "rate_limit_error"),
      };
    case "queue_timeout":
      return {
        status: 503,
        retryAfterSec: err.retryAfterSec ?? 5,
        body:
          dialect === "openai"
            ? openAiErrorBody(err.message, "server_error")
            : anthropicErrorBody(err.message, "overloaded_error"),
      };
    case "upstream_auth":
      return {
        status: 502,
        body:
          dialect === "openai"
            ? openAiErrorBody(err.message, "server_error", "upstream_auth")
            : anthropicErrorBody(err.message, "api_error"),
      };
    case "upstream_timeout":
      return {
        status: 504,
        body:
          dialect === "openai"
            ? openAiErrorBody(err.message, "server_error", "upstream_timeout")
            : anthropicErrorBody(err.message, "api_error"),
      };
    case "upstream_crash":
    case "unknown":
      return {
        status: 502,
        body:
          dialect === "openai"
            ? openAiErrorBody(err.message, "server_error")
            : anthropicErrorBody(err.message, "api_error"),
      };
    default:
      return {
        status: 503,
        body:
          dialect === "openai"
            ? openAiErrorBody(err.message, "server_error")
            : anthropicErrorBody(err.message, "overloaded_error"),
      };
  }
}

export function mapCliError(event: Extract<CliEvent, { type: "error" }>, dialect: ErrorDialect): MappedError {
  switch (event.kind) {
    case "rate_limit":
      return {
        status: 429,
        retryAfterSec: event.retryAfterSec,
        body:
          dialect === "openai"
            ? openAiErrorBody(event.message, "rate_limit_error")
            : anthropicErrorBody(event.message, "rate_limit_error"),
      };
    case "auth":
      return mapRouteError(new RouteError("upstream_auth", event.message), dialect);
    case "timeout":
      return mapRouteError(new RouteError("upstream_timeout", event.message), dialect);
    case "crash":
      return mapRouteError(new RouteError("upstream_crash", event.message), dialect);
    default:
      return mapRouteError(new RouteError("unknown", event.message), dialect);
  }
}

export function sendMappedError(reply: FastifyReply, mapped: MappedError): void {
  if (mapped.retryAfterSec !== undefined) {
    reply.header("Retry-After", String(mapped.retryAfterSec));
  }
  reply.code(mapped.status).send(mapped.body);
}
