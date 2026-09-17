import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as pty from "node-pty";
import crypto from "node:crypto";
import { provisionSandbox } from "../../supervisor/sandbox.js";
import { resolveBinary, getFreshHostPathString } from "../../adapters/resolver.js";
import { dataDir, projectRoot } from "../../config/paths.js";
import { killProcessTree } from "../../supervisor/process-group.js";
import type { WebSocket } from "ws";

interface TerminalTicket {
  ticket: string;
  mode: "host" | "sandbox";
  adapterId?: string;
  accountId?: string;
  clientIp?: string;
  expiresAt: number;
}

const ticketStore = new Map<string, TerminalTicket>();

// Periodic cleanup of expired tickets
setInterval(() => {
  const now = Date.now();
  for (const [key, t] of ticketStore.entries()) {
    if (t.expiresAt < now) {
      ticketStore.delete(key);
    }
  }
}, 15000).unref();

export function issueTerminalTicket(params: {
  mode: "host" | "sandbox";
  adapterId?: string;
  accountId?: string;
  clientIp?: string;
}): string {
  const ticket = `tkt_${crypto.randomBytes(24).toString("hex")}`;
  ticketStore.set(ticket, {
    ticket,
    mode: params.mode,
    adapterId: params.adapterId,
    accountId: params.accountId,
    clientIp: params.clientIp,
    expiresAt: Date.now() + 30000, // 30s TTL for ticket exchange
  });
  return ticket;
}

export function consumeTerminalTicket(ticket: string, clientIp?: string): {
  valid: boolean;
  mode?: "host" | "sandbox";
  adapterId?: string;
  accountId?: string;
  error?: string;
} {
  const found = ticketStore.get(ticket);
  if (!found) {
    return { valid: false, error: "Ticket not found or expired" };
  }

  // Enforce single-use
  ticketStore.delete(ticket);

  if (found.expiresAt < Date.now()) {
    return { valid: false, error: "Ticket expired" };
  }

  // Bind to IP if provided
  if (found.clientIp && clientIp && !isLoopback(clientIp) && found.clientIp !== clientIp) {
    return { valid: false, error: "Client IP mismatch for terminal ticket" };
  }

  return {
    valid: true,
    mode: found.mode,
    adapterId: found.adapterId,
    accountId: found.accountId,
  };
}

function isLoopback(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function isValidOrigin(origin: string | undefined, hostHeader: string | undefined): boolean {
  if (!origin) return true; // Direct non-browser clients permitted
  try {
    const originUrl = new URL(origin);
    if (!hostHeader) return true;
    const originHost = originUrl.host.toLowerCase();
    const expectedHost = hostHeader.toLowerCase();
    return (
      originHost === expectedHost ||
      originUrl.hostname === "localhost" ||
      originUrl.hostname === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

export function spawnHostPty(cols = 100, rows = 28): pty.IPty {
  const isWin = process.platform === "win32";
  const freshPathStr = getFreshHostPathString();

  if (freshPathStr) {
    process.env.PATH = freshPathStr;
    if (isWin) {
      process.env.Path = freshPathStr;
    }
  }

  const hostEnv: Record<string, string> = {
    ...process.env,
    PATH: freshPathStr || process.env.PATH || "",
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
  };
  if (isWin) {
    hostEnv.Path = freshPathStr || process.env.Path || "";
    hostEnv["PYTHONIOENCODING"] = "utf-8";
    hostEnv["LANG"] = "en_US.UTF-8";
  }
  let shellBinary: string;
  let shellArgs: string[] = [];

  if (isWin) {
    const pwshCore = resolveBinary("pwsh.exe");
    const pwshWin = resolveBinary("powershell.exe");

    if (pwshCore.isInstalled && pwshCore.resolvedPath) {
      shellBinary = pwshCore.resolvedPath;
      shellArgs = ["-NoLogo"];
    } else if (pwshWin.isInstalled && pwshWin.resolvedPath) {
      shellBinary = pwshWin.resolvedPath;
      shellArgs = ["-NoLogo"];
    } else {
      shellBinary = process.env.ComSpec || "cmd.exe";
    }
  } else {
    shellBinary = process.env.SHELL || "/bin/bash";
  }

  const safeCols = Math.max(10, Math.floor(cols));
  const safeRows = Math.max(4, Math.floor(rows));

  return pty.spawn(shellBinary, shellArgs, {
    name: "xterm-256color",
    cols: safeCols,
    rows: safeRows,
    cwd: projectRoot,
    env: hostEnv, // Native un-jailed host environment with fresh PATH
  });
}

export async function registerWebShellWs(fastify: FastifyInstance): Promise<void> {
  // POST /api/terminal/ticket - Issues ephemeral single-use ticket
  fastify.post("/api/terminal/ticket", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as {
      mode?: "host" | "sandbox";
      adapterId?: string;
      accountId?: string;
    };

    const mode = body.mode === "host" ? "host" : "sandbox";
    const clientIp = req.ip || req.socket.remoteAddress;

    const ticket = issueTerminalTicket({
      mode,
      adapterId: body.adapterId,
      accountId: body.accountId,
      clientIp,
    });

    return reply.send({
      ticket,
      mode,
      expiresIn: 30,
    });
  });

  // WebSocket GET /api/ws/terminal
  fastify.get("/api/ws/terminal", { websocket: true }, (socket: WebSocket, req: FastifyRequest) => {
    const query = (req.query || {}) as Record<string, string | undefined>;
    const origin = req.headers.origin;
    const hostHeader = req.headers.host;
    const clientIp = req.ip || req.socket.remoteAddress || "";

    // 1. Anti-CSWSH Origin Check
    if (!isValidOrigin(origin, hostHeader)) {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: "error", message: "Forbidden: CSWSH Origin mismatch" }));
      }
      socket.close(4403, "CSWSH Origin mismatch");
      return;
    }

    // 2. Ticket Verification or Backward-Compatible Query Fallback
    const ticketParam = query.ticket;
    let mode: "host" | "sandbox" = query.mode === "host" ? "host" : "sandbox";
    let adapterId = query.adapterId || "system";
    let accountId = query.accountId || "default";
    const initialCols = query.cols ? Math.max(10, parseInt(query.cols, 10)) : (mode === "host" ? 100 : 80);
    const initialRows = query.rows ? Math.max(4, parseInt(query.rows, 10)) : (mode === "host" ? 28 : 24);
    if (ticketParam) {
      const auth = consumeTerminalTicket(ticketParam, clientIp);
      if (!auth.valid) {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: "error", message: auth.error || "Unauthorized ticket" }));
        }
        socket.close(4401, "Unauthorized ticket");
        return;
      }
      mode = auth.mode || mode;
      if (auth.adapterId) adapterId = auth.adapterId;
      if (auth.accountId) accountId = auth.accountId;
    } else if (mode === "host") {
      // Host shell requires authenticated ticket
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: "error", message: "Unauthorized: Host terminal requires ticket" }));
      }
      socket.close(4401, "Host terminal requires ticket");
      return;
    }

    // 3. Execution Plane Dispatch
    if (mode === "host") {
      // Plane A: Elevated Host Server Terminal
      let ptyProcess: pty.IPty;
      try {
        ptyProcess = spawnHostPty(initialCols, initialRows);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: "error", message: `Failed to spawn host shell: ${message}` }));
          socket.close(1011, message);
        }
        return;
      }

      setupPtySocketBridge(ptyProcess, socket);
    } else {
      // Plane B: Account Sandbox Jail
      provisionSandbox({
        dataDir,
        adapterId,
        accountId,
      }).then((sandbox) => {
        const isWin = process.platform === "win32";
        const shellBinary = isWin ? resolveBinary("cmd.exe").spawnExecutable : "bash";

        let ptyProcess: pty.IPty;
        try {
          ptyProcess = pty.spawn(shellBinary, [], {
            name: "xterm-256color",
            cols: initialCols,
            rows: initialRows,
            cwd: sandbox.workspaceDir,
            env: {
              ...sandbox.env,
              TERM: "xterm-256color",
              COLORTERM: "truecolor",
            } as Record<string, string>,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify({ type: "error", message }));
            socket.close();
          }
          return;
        }

        setupPtySocketBridge(ptyProcess, socket);
      }).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: "error", message }));
          socket.close();
        }
      });
    }
  });
}

function setupPtySocketBridge(ptyProcess: pty.IPty, socket: WebSocket) {
  // Pipe PTY output -> WebSocket
  ptyProcess.onData((data: string) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: "data", data }));
    }
  });

  // Pipe WebSocket input -> PTY
  socket.on("message", (raw: Buffer | string) => {
    try {
      const text = raw.toString();
      const msg = JSON.parse(text);
      if (msg.type === "data" && typeof msg.data === "string") {
        ptyProcess.write(msg.data);
      } else if (msg.type === "resize" && typeof msg.cols === "number" && typeof msg.rows === "number") {
        const safeCols = Math.max(10, Math.floor(msg.cols));
        const safeRows = Math.max(4, Math.floor(msg.rows));
        try {
          ptyProcess.resize(safeCols, safeRows);
        } catch (err) {
          console.warn("[webshell] pty resize error suppressed:", err);
        }
      }
    } catch {
      ptyProcess.write(raw.toString());
    }
  });

  socket.on("close", () => {
    try {
      ptyProcess.kill();
      killProcessTree(ptyProcess.pid).catch(() => {});
    } catch {
      // Ignore kill error
    }
  });
}
