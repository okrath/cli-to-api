import type { ServerResponse } from "node:http";

export function writeFrame(raw: ServerResponse, data: string, event?: string): void {
  if (event !== undefined) {
    raw.write(`event: ${event}\n`);
  }
  raw.write(`data: ${data}\n\n`);
}

export function writeOpenAiData(raw: ServerResponse, data: string): void {
  raw.write(`data: ${data}\n\n`);
}

export function writeOpenAiDone(raw: ServerResponse): void {
  raw.write("data: [DONE]\n\n");
}

export function writeOpenAiPing(raw: ServerResponse): void {
  raw.write(": ping\n\n");
}

export function startHeartbeat(
  intervalMs: number,
  onTick: () => void,
): { stop: () => void } {
  const timer = setInterval(onTick, intervalMs);
  return {
    stop: () => clearInterval(timer),
  };
}

export function setStreamHeaders(raw: ServerResponse, requestId: string): void {
  raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "x-cta-request-id": requestId,
  });
}
