import { useState, useEffect } from "react";
import { Activity, CheckCircle2, Trash2 } from "lucide-react";

interface StreamEventItem {
  id: string;
  type: string;
  timestamp: number;
  content: string;
  model?: string;
  provider?: string;
}

export function LiveInspectorView() {
  const [diffMode, setDiffMode] = useState(true);
  const [events, setEvents] = useState<StreamEventItem[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource("/api/admin/events");

      eventSource.onopen = () => {
        setConnected(true);
      };

      eventSource.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed.type === "connected") return;

          const item: StreamEventItem = {
            id: Math.random().toString(36).substring(7),
            type: parsed.type,
            timestamp: parsed.timestamp || Date.now(),
            content: parsed.data?.content || JSON.stringify(parsed.data),
            model: parsed.data?.model,
            provider: parsed.data?.provider,
          };

          setEvents((prev) => [...prev.slice(-100), item]);
        } catch {}
      };

      eventSource.onerror = () => {
        setConnected(false);
      };
    } catch {
      setConnected(false);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  return (
    <div className="p-8 flex flex-col h-full space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            <span>Live SSE & ANSI Stream Inspector</span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                connected
                  ? "bg-emerald-950/40 text-statusHealthy border-statusHealthy/30"
                  : "bg-amber-950/40 text-statusCooldown border-statusCooldown/30"
              }`}
            >
              {connected ? "LIVE EVENTSTREAM CONNECTED" : "RECONNECTING..."}
            </span>
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Inspect real-time byte frames from CLI processes side-by-side with sanitized OpenAI SSE chunks.
          </p>
        </div>

        <div className="flex items-center space-x-4 text-xs font-mono">
          <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={diffMode}
              onChange={(e) => setDiffMode(e.target.checked)}
              className="rounded bg-canvas border-borderSubtle text-brand focus:ring-0"
            />
            <span>ANSI Diff View (Highlight Stripped Codes)</span>
          </label>

          <button
            onClick={() => setEvents([])}
            className="flex items-center space-x-1 px-2.5 py-1 text-xs text-slate-400 hover:text-white rounded bg-surface border border-borderSubtle transition"
            title="Clear Stream History"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
        {/* Raw Process Chunks */}
        <div className="flex flex-col rounded-xl bg-surface border border-borderSubtle overflow-hidden">
          <div className="px-4 py-2.5 bg-[#181C26] border-b border-borderSubtle flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 font-medium">Process stdout Telemetry & Life Cycle</span>
            <span className="text-amber-400 text-[11px] font-mono">Real-Time Ingestion</span>
          </div>
          <div className="flex-1 p-4 bg-canvas text-xs font-mono text-slate-400 overflow-y-auto space-y-2">
            {events.length === 0 ? (
              <div className="text-slate-600 text-center py-12">
                No active execution events yet. Send a prompt from Chat Playground or an IDE.
              </div>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className="p-2.5 rounded bg-surface/60 border border-borderSubtle/50 space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span className="text-brand font-bold uppercase">{ev.type}</span>
                    <span>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-slate-200 break-words whitespace-pre-wrap font-mono">
                    {diffMode && ev.type === "chunk:delta" ? (
                      <span className="text-emerald-400">{ev.content}</span>
                    ) : (
                      ev.content
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Transformed SSE Chunks */}
        <div className="flex flex-col rounded-xl bg-surface border border-borderSubtle overflow-hidden">
          <div className="px-4 py-2.5 bg-[#181C26] border-b border-borderSubtle flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 font-medium">Emitted OpenAI SSE Event Frames</span>
            <span className="text-statusHealthy text-[11px] font-mono flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Sanitized Markdown Delivery</span>
            </span>
          </div>
          <div className="flex-1 p-4 bg-canvas text-xs font-mono text-slate-300 overflow-y-auto space-y-2">
            {events.filter(e => e.type === "chunk:delta").length === 0 ? (
              <div className="text-slate-600 text-center py-12">
                SSE chunks will stream here as LLM tokens are produced.
              </div>
            ) : (
              events.filter(e => e.type === "chunk:delta").map((ev) => (
                <div key={`sse-${ev.id}`} className="p-2 rounded bg-surface/60 border border-borderSubtle/50 text-xs font-mono">
                  <span className="text-brand font-bold">data:</span>{" "}
                  <span className="text-slate-300">{JSON.stringify({ choices: [{ delta: { content: ev.content } }] })}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
