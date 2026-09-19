import type { CliEvent } from "../core/types.js";
import { updateLive } from "./live.js";
import {
  finishBridge,
  noteParsedCall,
  parkRun,
  type Bridge,
  type ParkedRun,
} from "./tool-bridge.js";

const MCP_ROUND_END_MS = 250;

function subtractUsage(
  last: Extract<CliEvent, { type: "usage" }>,
  previous: Array<Extract<CliEvent, { type: "usage" }>>,
): Extract<CliEvent, { type: "usage" }> {
  const sum = (field: "input" | "cachedInput" | "cacheWrite" | "output" | "reasoning") =>
    previous.reduce((acc, u) => acc + u[field], 0);

  return {
    type: "usage",
    input: Math.max(0, last.input - sum("input")),
    cachedInput: Math.max(0, last.cachedInput - sum("cachedInput")),
    cacheWrite: Math.max(0, last.cacheWrite - sum("cacheWrite")),
    output: Math.max(0, last.output - sum("output")),
    reasoning: Math.max(0, last.reasoning - sum("reasoning")),
    costUsd: last.costUsd,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function* bridgeEvents(
  bridge: Bridge,
  run: ParkedRun,
): AsyncGenerator<CliEvent> {
  bridge.firstMcpCallAt = undefined;
  const yieldedCallIds = new Set<string>();
  let roundUsage: Extract<CliEvent, { type: "usage" }> | undefined;
  let roundEnded = false;
  let mcpEndAt: number | undefined;
  let wake: (() => void) | undefined;
  let wakePromise = new Promise<void>((resolve) => {
    wake = resolve;
  });

  bridge.onMcpCall = () => {
    if (roundEnded || bridge.firstMcpCallAt == null) return;
    mcpEndAt = bridge.firstMcpCallAt + MCP_ROUND_END_MS;
    wake?.();
    wake = undefined;
  };

  const emitBufferedUsage = function* () {
    if (!roundUsage || run.roundsUsage.length === 0) return;
    yield subtractUsage(roundUsage, run.roundsUsage);
  };

  const endToolUseRound = function* (toolCallIds: string[]) {
    if (roundEnded) return;
    roundEnded = true;

    run.detachClientAbort();
    run.timeout.pause();
    if (roundUsage) {
      run.roundsUsage.push(roundUsage);
    }
    bridge.expiresAt = Date.now() + bridge.resultTimeoutMs;
    updateLive(run.requestId, { state: "waiting_tool_result" });
    run.toolCallIds = toolCallIds;
    parkRun(bridge, run);
  };

  const finishMcpFirstRound = function* (): Generator<CliEvent> {
    const toolCallIds: string[] = [];
    for (const call of bridge.parsedCalls) {
      if (!yieldedCallIds.has(call.id)) {
        yieldedCallIds.add(call.id);
        toolCallIds.push(call.id);
        yield { type: "tool_call", id: call.id, name: call.name, argumentsJson: call.argumentsJson };
      }
    }
    for (const [id, pending] of bridge.pending) {
      if (!yieldedCallIds.has(id)) {
        yieldedCallIds.add(id);
        toolCallIds.push(id);
        yield {
          type: "tool_call",
          id,
          name: pending.name,
          argumentsJson: pending.argumentsJson,
        };
      }
    }
    yield { type: "done", stopReason: "tool_use" };
    yield* endToolUseRound(toolCallIds);
  };

  let nextPromise = run.source.next();

  while (true) {
    if (mcpEndAt != null && Date.now() >= mcpEndAt && !roundEnded) {
      yield* finishMcpFirstRound();
      return;
    }

    const delay = mcpEndAt != null ? Math.max(0, mcpEndAt - Date.now()) : null;
    const racers: Array<
      Promise<{ kind: "event"; result: IteratorResult<CliEvent> } | { kind: "timer" } | { kind: "wake" }>
    > = [nextPromise.then((result) => ({ kind: "event" as const, result }))];
    if (delay != null) {
      racers.push(sleep(delay).then(() => ({ kind: "timer" as const })));
    }
    if (wake != null) {
      racers.push(wakePromise.then(() => ({ kind: "wake" as const })));
    }
    const raced = await Promise.race(racers);

    if (raced.kind === "wake") {
      continue;
    }

    if (raced.kind === "timer") {
      if (mcpEndAt != null && Date.now() >= mcpEndAt && !roundEnded) {
        yield* finishMcpFirstRound();
        return;
      }
      continue;
    }

    const next = raced.result;
    if (next.done) {
      if (!roundEnded) {
        yield { type: "done", stopReason: "error" };
        finishBridge(bridge);
      }
      return;
    }

    const event = next.value;

    if (event.type === "session") {
      run.cliSessionId = event.cliSessionId;
    }

    if (event.type === "tool_call") {
      noteParsedCall(bridge, { id: event.id, name: event.name, argumentsJson: event.argumentsJson });
      yieldedCallIds.add(event.id);
      yield event;
      nextPromise = run.source.next();
      continue;
    }

    if (event.type === "usage") {
      roundUsage = event;
      if (run.roundsUsage.length === 0) {
        yield event;
      }
      nextPromise = run.source.next();
      continue;
    }

    if (event.type === "done") {
      if (event.stopReason === "tool_use") {
        const toolCallIds = [...yieldedCallIds];
        yield* emitBufferedUsage();
        yield event;
        yield* endToolUseRound(toolCallIds);
        return;
      }

      if (
        event.stopReason === "end_turn" ||
        event.stopReason === "max_tokens" ||
        event.stopReason === "error"
      ) {
        yield* emitBufferedUsage();
        yield event;
        finishBridge(bridge);
        return;
      }
    }

    yield event;
    nextPromise = run.source.next();
  }
}
