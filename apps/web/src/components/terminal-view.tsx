import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { terminalWsUrl } from "../api.js";

interface TerminalViewProps {
  target: string;
  reconnectKey: number;
}

export function TerminalView({ target, reconnectKey }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "Consolas, Menlo, monospace",
      theme: {
        background: "#0a0a0a",
        foreground: "#e5e5e5",
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    const cols = term.cols;
    const rows = term.rows;
    const ws = new WebSocket(terminalWsUrl(target, cols, rows));

    ws.addEventListener("message", (event) => {
      term.write(typeof event.data === "string" ? event.data : "");
    });

    ws.addEventListener("open", () => {
      term.focus();
    });

    ws.addEventListener("close", () => {
      term.writeln("\r\n[connection closed]");
    });

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      ws.close();
      term.dispose();
    };
  }, [target, reconnectKey]);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-[400px] w-full overflow-hidden rounded border border-neutral-800 bg-neutral-950 p-1"
    />
  );
}
