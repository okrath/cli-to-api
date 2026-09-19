import type { Logger } from "pino";
import type { Adapter, CliDirs, CliEvent } from "../core/types.js";

export type HeldTerminalEvents = {
  usage?: Extract<CliEvent, { type: "usage" }>;
  done?: Extract<CliEvent, { type: "done" }>;
  cliSessionId?: string;
};

export function applyHeldTerminalEvent(
  held: HeldTerminalEvents,
  event: CliEvent,
  holdTerminal: boolean,
): CliEvent | undefined {
  if (event.type === "session") {
    held.cliSessionId = event.cliSessionId;
  }
  if (holdTerminal && (event.type === "usage" || event.type === "done")) {
    if (event.type === "usage") held.usage = event;
    if (event.type === "done") held.done = event;
    return undefined;
  }
  return event;
}

export function* yieldHeldUsage(
  held: HeldTerminalEvents,
  adapter: Adapter,
  dirs: CliDirs,
  log: Logger,
): Generator<CliEvent> {
  if (!held.usage) return;

  let usage = held.usage;
  if (held.cliSessionId && adapter.lastCallUsage) {
    const last = adapter.lastCallUsage(dirs, held.cliSessionId);
    if (last) {
      usage = {
        ...held.usage,
        input: last.input,
        cachedInput: last.cachedInput,
        cacheWrite: last.cacheWrite,
      };
    } else {
      log.debug(
        { adapter: adapter.id, cliSessionId: held.cliSessionId },
        "no last-call usage in CLI artifacts",
      );
    }
  }
  yield usage;
}

export function* yieldHeldDone(held: HeldTerminalEvents): Generator<CliEvent> {
  if (held.done) yield held.done;
}
