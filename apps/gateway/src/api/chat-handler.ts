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
import { buildCatalog, resolveModel } from "../protocol/model-catalog.js";
import { openAiIncludeUsage } from "../protocol/normalize-openai.js";
import {
  serializeOpenAiCompletion,
  writeOpenAiStream,
} from "../protocol/serialize-openai.js";
import {
  serializeAnthropicMessage,
  streamAnthropicEvents,
} from "../protocol/serialize-anthropic.js";
import {
  setStreamHeaders,
  writeOpenAiData,
  writeOpenAiDone,
} from "../protocol/sse.js";
import { routeRequest } from "../router/route-request.js";

async function collectEvents(events: AsyncIterable<CliEvent>): Promise<CliEvent[]> {
  const collected: CliEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function wireClientAbort(request: FastifyRequest): AbortController {
  const controller = new AbortController();
  request.raw.on("close", () => {
    controller.abort();
  });
  return controller;
}

export async function handleChatRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  db: DbHandle,
  chatRequest: ChatRequest,
  rawBody: unknown,
): Promise<void> {
  const catalog = await buildCatalog(db);
  const resolved = resolveModel(chatRequest.model, catalog);
  if (!resolved) {
    sendMappedError(reply, mapModelNotFound(chatRequest.dialect));
    return;
  }

  let routed: { events: AsyncIterable<CliEvent> };
  try {
    routed = await routeRequest(chatRequest);
  } catch (err) {
    if (err instanceof RouteError) {
      sendMappedError(reply, mapRouteError(err, chatRequest.dialect));
      return;
    }
    throw err;
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
  request: FastifyRequest,
  reply: FastifyReply,
  chatRequest: ChatRequest,
  events: AsyncIterable<CliEvent>,
  rawBody: unknown,
  serializeOpts: { requestId: string; model: string },
): Promise<void> {
  const includeUsage = openAiIncludeUsage(rawBody);

  if (chatRequest.stream) {
    setStreamHeaders(reply.raw, request.id);
    reply.hijack();

    try {
      await writeOpenAiStream(
        (frame) => {
          if (frame === "[DONE]") {
            writeOpenAiDone(reply.raw);
          } else {
            writeOpenAiData(reply.raw, frame);
          }
        },
        events,
        { ...serializeOpts, includeUsage },
      );
    } catch (err) {
      if (isMappedError(err)) {
        reply.raw.writeHead(err.status, { "Content-Type": "application/json" });
        reply.raw.end(JSON.stringify(err.body));
        return;
      }
      throw err;
    }

    reply.raw.end();
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
  request: FastifyRequest,
  reply: FastifyReply,
  chatRequest: ChatRequest,
  events: AsyncIterable<CliEvent>,
  serializeOpts: { requestId: string; model: string },
): Promise<void> {
  if (chatRequest.stream) {
    setStreamHeaders(reply.raw, request.id);
    reply.hijack();

    try {
      await streamAnthropicEvents(reply.raw, events, serializeOpts);
    } catch (err) {
      if (isMappedError(err)) {
        reply.raw.writeHead(err.status, { "Content-Type": "application/json" });
        reply.raw.end(JSON.stringify(err.body));
        return;
      }
      throw err;
    }

    reply.raw.end();
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
      return normalize({
        body,
        headers: request.headers,
        requestId: createChatRequestId(request),
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
