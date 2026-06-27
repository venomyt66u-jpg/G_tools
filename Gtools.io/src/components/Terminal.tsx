"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Panel, Btn, Input } from "./ui";
import { api } from "@/lib/client";

const LEVELS = ["ALL", "INFO", "SUCCESS", "WARNING", "ERROR", "BLOCKCHAIN", "MINT", "WALLET", "LISTING"];
const COLOR: Record<string, string> = {
  INFO: "#8FB8FF", SUCCESS: "#C6FF3A", WARNING: "#E8C13A", ERROR: "#FF5C3A",
  BLOCKCHAIN: "#3AE8FF", MINT: "#C6FF3A", WALLET: "#B98FFF", LISTING: "#FF9F3A",
};

export default function Terminal() {
  const [logs, setLogs] = useState<any[]>([]);
  const [level, setLevel] = useState("ALL");
  const [q, setQ] = useState("");
  const [auto, setAuto] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await api(`/api/logs?level=${level}&q=${encodeURIComponent(q)}&limit=800`);
    if (r.logs) setLogs(r.logs);
  }, [level, q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(load, 2500); // live polling; a WS upgrade is documented in README
    return () => clearInterval(t);
  }, [auto, load]);

  function exportLogs() {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `gtools-logs-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel title="Terminal & Log Center" accent="#3AE8FF" className="h-full flex flex-col">
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {LEVELS.map((l) => (
          <button key={l} onClick={() => setLevel(l)} className={`mono text-[9px] uppercase px-2 py-1 rounded border ${level === l ? "border-white/40 text-white bg-white/10" : "border-white/10 text-white/40"}`} style={level === l && COLOR[l] ? { color: COLOR[l], borderColor: COLOR[l] } : {}}>{l}</button>
        ))}
      </div>
      <div className="flex gap-2 mb-3">
        <Input placeholder="Search logs…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Btn variant="ghost" onClick={() => setAuto((a) => !a)}>{auto ? "● LIVE" : "○ PAUSED"}</Btn>
        <Btn variant="ghost" onClick={exportLogs}>EXPORT</Btn>
      </div>
      <div ref={boxRef} className="flex-1 overflow-auto bg-black/40 rounded-lg border border-white/5 p-3 font-[var(--font-display)] text-[11px] space-y-1 min-h-[300px] max-h-[60vh]">
        {logs.length === 0 ? <p className="text-white/30 mono">No log entries.</p> : logs.map((l) => (
          <div key={l.id} className="flex gap-2 items-start hover:bg-white/[0.03] px-1 rounded">
            <span className="text-white/30 shrink-0">{new Date(l.created_at).toLocaleTimeString()}</span>
            <span className="shrink-0 font-bold" style={{ color: COLOR[l.level] || "#fff" }}>[{l.level}]</span>
            {l.wallet && <span className="text-white/50 shrink-0">{l.wallet}</span>}
            <span className="text-white/80">{l.message}</span>
            {l.tx_hash && <span className="text-cyan/70 shrink-0 ml-auto">{l.tx_hash.slice(0, 10)}…</span>}
          </div>
        ))}
      </div>
    </Panel>
  );
}
