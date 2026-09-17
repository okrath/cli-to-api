import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { Play, UserCheck, RefreshCw, ShieldAlert, Package, Code, Eraser } from "lucide-react";
import { apiClient } from "../../lib/api-client.js";

interface TerminalViewProps {
  mode?: "host" | "sandbox";
  adapterId?: string;
  accountId?: string;
}

export function TerminalView({
  mode = "sandbox",
  adapterId = "codex-cli",
  accountId = "default",
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState(0);

  // Safe terminal fit & backend PTY dimension synchronization
  const safeFit = useCallback(() => {
    const container = containerRef.current;
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;

    if (!container || !term || !fitAddon) return;

    // Only fit when container has rendered client dimensions
    if (container.clientWidth < 50 || container.clientHeight < 50) return;

    try {
      fitAddon.fit();
      const cols = Math.max(10, term.cols);
      const rows = Math.max(4, term.rows);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    } catch {
      // Suppress transient layout measurement errors during animation transitions
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let isDisposed = false;

    // Clean container before mounting xterm
    container.innerHTML = "";

    const term = new Terminal({
      theme: {
        background: "#090B0F",
        foreground: "#E2E8F0",
        cursor: mode === "host" ? "#F59E0B" : "#6366F1",
        selectionBackground: mode === "host" ? "#78350F" : "#312E81",
        black: "#12141C",
        red: "#EF4444",
        green: "#10B981",
        yellow: "#F59E0B",
        blue: "#3B82F6",
        magenta: "#8B5CF6",
        cyan: "#06B6D4",
        white: "#F8FAFC",
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      convertEol: true, // Prevents Windows shell staircase newline corruption
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(container);
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Trigger progressive fitting across paint ticks to avoid 0x0 container size
    const raf1 = requestAnimationFrame(() => safeFit());
    const timer1 = setTimeout(safeFit, 50);
    const timer2 = setTimeout(safeFit, 150);

    // Refit when web font finishes loading to prevent character overlapping
    document.fonts?.ready?.then(() => {
      if (!isDisposed) {
        requestAnimationFrame(() => safeFit());
      }
    });

    // ResizeObserver watches container layout changes (tab switch, sidebar toggle, split window)
    let roRaf: number | null = null;
    const ro = new ResizeObserver(() => {
      if (roRaf) cancelAnimationFrame(roRaf);
      roRaf = requestAnimationFrame(() => {
        safeFit();
      });
    });
    ro.observe(container);

    // Establish WebSocket Connection via Security Ticket
    const initConnection = async () => {
      try {
        setConnecting(true);
        setErrorMessage(null);

        const ticketData = await apiClient.getTerminalTicket(
          mode,
          mode === "sandbox" ? adapterId : undefined,
          mode === "sandbox" ? accountId : undefined
        );

        if (isDisposed) return;

        safeFit();
        const initialCols = Math.max(10, term.cols || 80);
        const initialRows = Math.max(4, term.rows || 24);

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/api/ws/terminal?ticket=${encodeURIComponent(
          ticketData.ticket
        )}&mode=${mode}&adapterId=${encodeURIComponent(adapterId)}&accountId=${encodeURIComponent(
          accountId
        )}&cols=${initialCols}&rows=${initialRows}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isDisposed) {
            ws.close();
            return;
          }
          setConnecting(false);
          safeFit();

          if (mode === "host") {
            term.writeln("\x1b[38;2;245;158;11m⚡ CONNECTED TO HOST SERVER TERMINAL (PRIVILEGED CONSOLE)\x1b[0m");
            term.writeln(
              "\x1b[90mNative OS shell running in host project root with fresh environment & dynamic PATH.\x1b[0m\r\n"
            );
          } else {
            term.writeln(`\x1b[38;2;99;102;241m🔒 Connected to Sandbox Jail: [${adapterId}/${accountId}]\x1b[0m\r\n`);
          }

          // Ensure backend PTY matches current dimensions
          const cols = Math.max(10, term.cols);
          const rows = Math.max(4, term.rows);
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
          term.focus();
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "data") {
              term.write(msg.data);
            } else if (msg.type === "error") {
              term.writeln(`\r\n\x1b[31m[Terminal Error]: ${msg.message}\x1b[0m\r\n`);
            }
          } catch {
            term.write(event.data);
          }
        };

        ws.onerror = () => {
          if (!isDisposed) {
            setErrorMessage("WebSocket connection error. Check server status.");
          }
        };

        ws.onclose = (evt) => {
          if (!isDisposed) {
            term.writeln(`\r\n\x1b[90m[Session terminated: code ${evt.code}]\x1b[0m\r\n`);
          }
        };

        term.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "data", data }));
          }
        });
      } catch (err: unknown) {
        if (!isDisposed) {
          const msg = err instanceof Error ? err.message : String(err);
          setErrorMessage(`Failed to obtain terminal ticket: ${msg}`);
          setConnecting(false);
        }
      }
    };

    initConnection();

    return () => {
      isDisposed = true;
      cancelAnimationFrame(raf1);
      if (roRaf) cancelAnimationFrame(roRaf);
      clearTimeout(timer1);
      clearTimeout(timer2);
      ro.disconnect();

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [mode, adapterId, accountId, sessionKey, safeFit]);

  const sendCommand = (cmd: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "data", data: cmd + "\r" }));
      termRef.current?.focus();
    }
  };

  const handleRestartTerminal = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setSessionKey((prev) => prev + 1);
  };

  return (
    <div
      className={`flex flex-col h-full rounded-xl overflow-hidden border ${
        mode === "host" ? "border-amber-500/40 bg-[#090B0F]" : "border-borderSubtle bg-[#090B0F]"
      }`}
    >
      {/* Control Bar */}
      <div
        className={`flex items-center justify-between px-4 py-2.5 border-b shrink-0 ${
          mode === "host" ? "bg-amber-950/20 border-amber-500/30" : "bg-surface border-borderSubtle"
        }`}
      >
        <div className="flex items-center space-x-3">
          {mode === "host" ? (
            <>
              <span className="flex items-center space-x-1.5 text-xs font-mono text-amber-300 font-bold">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>ELEVATED HOST SERVER CONSOLE</span>
              </span>
              <span className="text-[11px] font-mono text-amber-200/70 hidden sm:inline">
                (Full Host Machine Access: npm, pnpm, cargo, brew, scoop, agy)
              </span>
            </>
          ) : (
            <>
              <span className="text-xs font-mono text-brand font-medium">
                Jail: /sandboxes/{adapterId}/{accountId}
              </span>
              <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
                (Isolated $HOME & %USERPROFILE%)
              </span>
            </>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {mode === "host" ? (
            <>
              <button
                onClick={() => sendCommand("npm list -g --depth=0")}
                className="flex items-center space-x-1.5 px-2.5 py-1 text-xs bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-200 rounded-md transition font-medium"
                title="List global npm packages"
              >
                <Package className="w-3 h-3" />
                <span>npm -g</span>
              </button>
              <button
                onClick={() => sendCommand("node -v && pnpm -v")}
                className="flex items-center space-x-1.5 px-2.5 py-1 text-xs bg-surfaceHover hover:bg-borderSubtle text-slate-200 rounded-md border border-borderSubtle transition font-medium"
                title="Show node & pnpm versions"
              >
                <Code className="w-3 h-3 text-slate-400" />
                <span>Runtimes</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => sendCommand(`${adapterId} login`)}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs bg-brand hover:bg-brandHover text-white rounded-md transition font-medium"
              >
                <Play className="w-3 h-3" />
                <span>Login CLI</span>
              </button>
              <button
                onClick={() => sendCommand(`${adapterId} whoami`)}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs bg-surfaceHover hover:bg-borderSubtle text-slate-200 rounded-md border border-borderSubtle transition font-medium"
              >
                <UserCheck className="w-3 h-3" />
                <span>Whoami</span>
              </button>
            </>
          )}

          <button
            onClick={() => sendCommand("cls || clear")}
            className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-surfaceHover transition"
            title="Clear Screen (Keeps active shell session)"
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleRestartTerminal}
            disabled={connecting}
            className="flex items-center space-x-1.5 px-2.5 py-1 text-xs bg-surfaceHover hover:bg-borderSubtle text-slate-200 border border-borderSubtle rounded-md transition font-medium disabled:opacity-50"
            title="Restart Terminal Session: Kills previous shell and launches fresh shell with updated PATH"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-brand ${connecting ? "animate-spin" : ""}`} />
            <span>{connecting ? "Restarting..." : "Restart Terminal"}</span>
          </button>
        </div>
      </div>

      {/* Terminal Viewport Container (min-h-0 and overflow-hidden prevent flexbox stretching) */}
      <div
        className="relative flex-1 min-h-0 overflow-hidden p-3 bg-[#090B0F] cursor-text"
        onClick={() => termRef.current?.focus()}
      >
        {connecting && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-canvas/80 font-mono text-xs text-slate-400 space-x-2">
            <RefreshCw className="w-4 h-4 animate-spin text-brand" />
            <span>Exchanging security ticket & launching terminal...</span>
          </div>
        )}
        {errorMessage && (
          <div className="absolute top-4 left-4 right-4 z-20 p-3 rounded-lg bg-rose-950/80 border border-rose-500/50 text-rose-200 font-mono text-xs">
            {errorMessage}
          </div>
        )}
        <div ref={containerRef} className="h-full w-full overflow-hidden" />
      </div>
    </div>
  );
}
