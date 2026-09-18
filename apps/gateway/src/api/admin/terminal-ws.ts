import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import * as pty from "node-pty";
import { adapters } from "../../adapters/index.js";
import { isAdminTokenValid, type AdminTokenStore } from "../../auth/admin-auth.js";
import type { GatewayConfig } from "../../config.js";
import type { DbHandle } from "../../db/db.js";
import { loadAccount } from "../../db/repos.js";
import { baseEnv, ensureSandbox } from "../../runner/sandbox.js";

const MAX_TERMINALS = 8;

interface TerminalSession {
  pty: pty.IPty;
  socket: WebSocket;
}

const activeSessions = new Set<TerminalSession>();

export function killAllTerminals(): void {
  for (const session of activeSessions) {
    try {
      session.pty.kill();
    } catch {
      // Process may already be gone.
    }
    try {
      session.socket.close();
    } catch {
      // Socket may already be closed.
    }
  }
  activeSessions.clear();
}

function shellCommand(): { file: string; args: string[] } {
  if (process.platform === "win32") {
    return { file: "powershell.exe", args: ["-NoLogo"] };
  }
  const shell = process.env.SHELL || "/bin/bash";
  return { file: shell, args: [] };
}

function parseTarget(
  target: string,
): { kind: "host" } | { kind: "account"; accountId: string } | null {
  if (target === "host") {
    return { kind: "host" };
  }
  if (target.startsWith("account:")) {
    const accountId = target.slice("account:".length);
    return accountId.length > 0 ? { kind: "account", accountId } : null;
  }
  return null;
}

function parseResizeMessage(data: string): { cols: number; rows: number } | null {
  try {
    const parsed = JSON.parse(data) as { type?: string; cols?: number; rows?: number };
    if (parsed.type !== "resize") {
      return null;
    }
    const cols = Number(parsed.cols);
    const rows = Number(parsed.rows);
    if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) {
      return null;
    }
    return { cols: Math.floor(cols), rows: Math.floor(rows) };
  } catch {
    return null;
  }
}

export function registerTerminalWs(
  app: FastifyInstance,
  handle: DbHandle,
  config: GatewayConfig,
  adminTokens: AdminTokenStore,
): void {
  app.get("/ws/terminal", { websocket: true }, (socket, request) => {
    const query = request.query as {
      token?: string;
      target?: string;
      cols?: string;
      rows?: string;
    };

    if (!query.token || !isAdminTokenValid(adminTokens, query.token)) {
      socket.close(4401, "Unauthorized");
      return;
    }

    if (activeSessions.size >= MAX_TERMINALS) {
      socket.close(4403, "Too many terminal sessions");
      return;
    }

    const targetRaw = query.target ?? "host";
    const parsedTarget = parseTarget(targetRaw);
    if (!parsedTarget) {
      socket.close(4400, "Invalid target");
      return;
    }

    const cols = Math.max(Number(query.cols) || 80, 10);
    const rows = Math.max(Number(query.rows) || 24, 4);

    let cwd = config.repoRoot;
    let env: NodeJS.ProcessEnv = { ...process.env };

    if (parsedTarget.kind === "account") {
      const account = loadAccount(handle, parsedTarget.accountId);
      if (!account) {
        socket.close(4404, "Account not found");
        return;
      }

      const adapter = adapters[account.adapterId as keyof typeof adapters];
      if (!adapter) {
        socket.close(4400, "Unknown adapter");
        return;
      }

      const sandbox = ensureSandbox(config.dataDir, account.adapterId, account.id);
      cwd = sandbox.workspaceDir;
      env = {
        ...baseEnv(sandbox),
        ...adapter.buildEnv(sandbox),
        TERM: "xterm-256color",
      };
      delete env.CI;
      delete env.NO_COLOR;
      delete env.FORCE_COLOR;

      const banner = `[cli-to-api] sandbox for ${account.adapterId}/${account.id} — run "${adapter.executable} login" here.\r\n`;
      socket.send(banner);
    }

    const shell = shellCommand();
    let term: pty.IPty;
    try {
      term = pty.spawn(shell.file, shell.args, {
        name: "xterm-color",
        cols,
        rows,
        cwd,
        env: env as Record<string, string>,
      });
    } catch (err) {
      request.log.error({ err }, "Failed to spawn terminal");
      socket.close(4500, "Failed to spawn terminal");
      return;
    }

    const session: TerminalSession = { pty: term, socket };
    activeSessions.add(session);

    term.onData((data) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(data);
      }
    });

    term.onExit(() => {
      activeSessions.delete(session);
      if (socket.readyState === socket.OPEN) {
        socket.close();
      }
    });

    socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
      const data = raw.toString();
      const resize = parseResizeMessage(data);
      if (resize) {
        term.resize(resize.cols, resize.rows);
        return;
      }
      term.write(data);
    });

    socket.on("close", () => {
      activeSessions.delete(session);
      try {
        term.kill();
      } catch {
        // Process may already be gone.
      }
    });
  });
}
