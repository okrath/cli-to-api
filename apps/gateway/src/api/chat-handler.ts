import type { FastifyReply, FastifyRequest } from "fastify";
import type { ChatRequest, CliEvent } from "../core/types.js";
import type { DbHandle } from "../db/db.js";
import {
  mapModelNotFound,
  mapProtocolError,
  mapRouteError,
  ProtocolError,
  RouteError,
  sendMappedError,
  type MappedError,
} from "../protocol/errors.js";
import { openAiIncludeUsage } from "../protocol/normalize-openai.js";
import { openAiStreamFrames, serializeOpenAiCompletion } from "../protocol/serialize-openai.js";
import {
  anthropicStreamFrames,
  serializeAnthropicMessage,
} from "../protocol/serialize-anthropic.js";
import {
  setStreamHeaders,
  startHeartbeat,
  writeFrame,
  writeOpenAiData,
  writeOpenAiDone,
  writeOpenAiPing,
} from "../protocol/sse.js";
import { routeRequest } from "../router/route-request.js";
import { recordRouteFailure, routeResponseHeaders } from "../usage/record-usage.js";

export interface ChatHandlerOptions {
  dataDir: string;
  mcpBaseUrl: string;
}

async function collectEvents(events: AsyncIterable<CliEvent>): Promise<CliEvent[]> {
  const collected: CliEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function wireClientAbort(request: FastifyRequest): AbortController {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };
  request.raw.on("close", abort);
  request.raw.on("aborted", abort);
  request.socket?.on("close", abort);
  if (request.raw.aborted || request.socket?.destroyed) {
    abort();
  }
  return controller;
}

export async function handleChatRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  db: DbHandle,
  chatRequest: ChatRequest,
  rawBody: unknown,
  options: ChatHandlerOptions,
): Promise<void> {
  reply.header("x-cta-request-id", chatRequest.requestId);

  let routed: { events: AsyncIterable<CliEvent>; meta: import("../router/route-request.js").RouteMeta };
  const startedAt = Date.now();
  try {
    routed = await routeRequest(chatRequest, {
      db,
      log: request.log,
      dataDir: options.dataDir,
      mcpBaseUrl: options.mcpBaseUrl,
    });
  } catch (err) {
    if (err instanceof RouteError) {
      if (err.code === "model_not_found") {
        sendMappedError(reply, mapModelNotFound(chatRequest.dialect));
        return;
      }
      recordRouteFailure(db, chatRequest, err, startedAt);
      sendMappedError(reply, mapRouteError(err, chatRequest.dialect));
      return;
    }
    throw err;
  }

  for (const [header, value] of Object.entries(routeResponseHeaders(routed.meta))) {
    reply.header(header, value);
  }

  const serializeOpts = {
    requestId: chatRequest.requestId,
    model: chatRequest.model,
  };

  if (chatRequest.dialect === "openai") {
    await handleOpenAiResponse(request, reply, chatRequest, routed.events, rawBody, serializeOpts);
    return;
  }

  await handleAnthropicResponse(request, reply, chatRequest, routed.events, serializeOpts);
}

export function createChatRequestId(request: FastifyRequest): string {
  return `req_${request.id.replace(/-/g, "").slice(0, 21)}`;
}

async function handleOpenAiResponse(
  _request: FastifyRequest,
  reply: FastifyReply,
  chatRequest: ChatRequest,
  events: AsyncIterable<CliEvent>,
  rawBody: unknown,
  serializeOpts: { requestId: string; model: string },
): Promise<void> {
  const includeUsage = openAiIncludeUsage(rawBody);

  if (chatRequest.stream) {
    let headersSent = false;
    let waitingForFrame = true;
    const heartbeat = startHeartbeat(15_000, () => {
      if (headersSent && waitingForFrame) {
        writeOpenAiPing(reply.raw);
      }
    });

    try {
      for await (const frame of openAiStreamFrames(events, { ...serializeOpts, includeUsage })) {
        waitingForFrame = false;
        if (!headersSent) {
          setStreamHeaders(reply.raw, chatRequest.requestId);
          reply.hijack();
          headersSent = true;
        }

        if (frame === "[DONE]") {
          writeOpenAiDone(reply.raw);
        } else {
          writeOpenAiData(reply.raw, frame);
        }
        waitingForFrame = true;
      }
    } catch (err) {
      if (isMappedError(err) && !headersSent) {
        sendMappedError(reply, err);
        return;
      }
      throw err;
    } finally {
      heartbeat.stop();
    }

    if (headersSent) {
      reply.raw.end();
    }
    return;
  }

  const collected = await collectEvents(events);
  const body = serializeOpenAiCompletion(collected, { ...serializeOpts, includeUsage: true });
  if ("error" in body) {
    reply.code(body.status).send({ error: body.error });
    return;
  }
  reply.send(body);
}

async function handleAnthropicResponse(
  _request: FastifyRequest,
  reply: FastifyReply,
  chatRequest: ChatRequest,
  events: AsyncIterable<CliEvent>,
  serializeOpts: { requestId: string; model: string },
): Promise<void> {
  if (chatRequest.stream) {
    let headersSent = false;
    let waitingForFrame = true;
    const heartbeat = startHeartbeat(15_000, () => {
      if (headersSent && waitingForFrame) {
        writeFrame(reply.raw, "{}", "ping");
      }
    });

    try {
      for await (const frame of anthropicStreamFrames(events, serializeOpts)) {
        waitingForFrame = false;
        if (!headersSent) {
          setStreamHeaders(reply.raw, chatRequest.requestId);
          reply.hijack();
          headersSent = true;
        }
        writeFrame(reply.raw, JSON.stringify(frame.data), frame.event);
        waitingForFrame = true;
      }
    } catch (err) {
      if (isMappedError(err) && !headersSent) {
        sendMappedError(reply, err);
        return;
      }
      throw err;
    } finally {
      heartbeat.stop();
    }

    if (headersSent) {
      reply.raw.end();
    }
    return;
  }

  const collected = await collectEvents(events);
  const body = serializeAnthropicMessage(collected, serializeOpts);
  if ("status" in body) {
    reply.code(body.status).send(body.body);
    return;
  }
  reply.send(body);
}

function isMappedError(err: unknown): err is MappedError {
  return typeof err === "object" && err !== null && "status" in err && "body" in err;
}

export function wrapNormalize<T>(
  normalize: (input: {
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
    requestId: string;
    apiKeyId: string;
    clientAbort: AbortSignal;
  }) => T,
) {
  return (request: FastifyRequest, reply: FastifyReply, body: unknown): T | undefined => {
    try {
      const controller = wireClientAbort(request);
      const requestId = createChatRequestId(request);
      request.chatRequestId = requestId;
      return normalize({
        body,
        headers: request.headers,
        requestId,
        apiKeyId: request.apiKeyId ?? "",
        clientAbort: controller.signal,
      });
    } catch (err) {
      if (err instanceof ProtocolError) {
        sendMappedError(reply, mapProtocolError(err));
        return undefined;
      }
      throw err;
    }
  };
}

declare module "fastify" {
  interface FastifyRequest {
    chatRequestId?: string;
  }
}
