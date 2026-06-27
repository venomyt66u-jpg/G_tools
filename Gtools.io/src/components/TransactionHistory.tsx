"use client";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Panel, Btn } from "./ui";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/client";

const EXPLORERS: Record<string, string> = {
  ethereum: "https://etherscan.io",
  base: "https://basescan.org",
  arbitrum: "https://arbiscan.io",
  optimism: "https://optimistic.etherscan.io",
  polygon: "https://polygonscan.com",
};

const KIND_LABEL: Record<string, string> = {
  mint: "Mint", fund: "Funding", list: "Listing", accept_offer: "Accept offer", transfer: "Transfer",
};
const KIND_COLOR: Record<string, string> = {
  mint: "var(--amber)", fund: "var(--violet)", list: "var(--ice)", accept_offer: "var(--signal)", transfer: "var(--ink-1)",
};
const STATUS_COLOR: Record<string, string> = {
  confirmed: "var(--signal)", pending: "var(--ice)", failed: "var(--alert)",
};

interface Tx {
  id: number; kind: string; chain: string; wallet_address: string | null;
  collection: string | null; hash: string | null; status: string; detail: string | null; created_at: number;
}

export default function TransactionHistory() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [auto, setAuto] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await api("/api/transactions");
    if (r.transactions) setTxs(r.transactions);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [auto, load]);

  const shown = txs.filter((t) => filter === "all" || (filter === "failed" ? t.status === "failed" : t.kind === filter));
  const counts = {
    all: txs.length,
    failed: txs.filter((t) => t.status === "failed").length,
    confirmed: txs.filter((t) => t.status === "confirmed").length,
    pending: txs.filter((t) => t.status === "pending").length,
  };

  function parseDetail(d: string | null): Record<string, unknown> | null {
    if (!d) return null;
    try { return JSON.parse(d); } catch { return { raw: d }; }
  }

  function exportCsv() {
    const rows = [["time", "kind", "chain", "status", "wallet", "collection", "hash", "detail"]];
    for (const t of txs) rows.push([
      new Date(t.created_at).toISOString(), t.kind, t.chain, t.status,
      t.wallet_address ?? "", t.collection ?? "", t.hash ?? "", (t.detail ?? "").replace(/\n/g, " "),
    ]);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `gtools-transactions-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel title="Activity — every transaction" accent="var(--signal)">
      {/* summary row */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {([["Total", counts.all, "var(--ink-1)"], ["Confirmed", counts.confirmed, "var(--signal)"], ["Pending", counts.pending, "var(--ice)"], ["Failed", counts.failed, "var(--alert)"]] as const).map(([label, n, c]) => (
          <div key={label} className="panel-raised px-3 py-2.5">
            <div className="eyebrow">{label}</div>
            <div className="mono text-2xl mt-0.5" style={{ color: c as string }}>{n}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div className="flex gap-1.5 mb-3 flex-wrap items-center">
        {[["all", "All"], ["failed", "Failed only"], ["mint", "Mints"], ["fund", "Funding"], ["list", "Listings"], ["accept_offer", "Offers"], ["transfer", "Transfers"]].map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className="mono text-[10px] uppercase px-2.5 py-1.5 rounded-md border transition-colors"
            style={filter === k ? { borderColor: "var(--line-2)", color: "var(--ink-0)", background: "var(--bg-2)" } : { borderColor: "var(--line)", color: "var(--ink-2)" }}>
            {label}
          </button>
        ))}
        <div className="ml-auto flex gap-1.5">
          <Btn variant="ghost" onClick={() => setAuto((a) => !a)}>{auto ? "● LIVE" : "○ PAUSED"}</Btn>
          <Btn variant="ghost" onClick={exportCsv}>EXPORT CSV</Btn>
        </div>
      </div>

      {/* list */}
      <div className="space-y-1.5 max-h-[60vh] overflow-auto pr-1">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-12" />)
        ) : shown.length === 0 ? (
          <div className="text-center py-10">
            <div className="mono text-sm" style={{ color: "var(--ink-2)" }}>No transactions yet.</div>
            <div className="mono text-[11px] mt-1" style={{ color: "var(--ink-2)" }}>Mints, funding, and listings will appear here as you run them.</div>
          </div>
        ) : shown.map((t) => {
          const detail = parseDetail(t.detail);
          const isOpen = expanded === t.id;
          const explorer = EXPLORERS[t.chain];
          const errMsg = detail?.error as string | undefined;
          return (
            <div key={t.id} className="panel-raised overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : t.id)} className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-[var(--bg-1)] transition-colors">
                <span className="statusdot shrink-0" style={{ background: STATUS_COLOR[t.status] ?? "var(--ink-2)" }} />
                <span className="mono text-[10px] uppercase px-1.5 py-0.5 rounded shrink-0" style={{ color: KIND_COLOR[t.kind] ?? "var(--ink-1)", border: `1px solid ${KIND_COLOR[t.kind] ?? "var(--line)"}33` }}>
                  {KIND_LABEL[t.kind] ?? t.kind}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mono text-xs truncate" style={{ color: "var(--ink-0)" }}>
                    {t.wallet_address ? `${t.wallet_address.slice(0, 6)}…${t.wallet_address.slice(-4)}` : "—"}
                    {detail?.tokenId ? <span style={{ color: "var(--ink-2)" }}> · #{String(detail.tokenId)}</span> : null}
                  </div>
                  <div className="mono text-[10px]" style={{ color: "var(--ink-2)" }}>
                    {new Date(t.created_at).toLocaleString()} · {t.chain}
                  </div>
                </div>
                <span className="mono text-[10px] uppercase shrink-0" style={{ color: STATUS_COLOR[t.status] ?? "var(--ink-2)" }}>{t.status}</span>
                <span className="mono text-[10px] shrink-0" style={{ color: "var(--ink-2)" }}>{isOpen ? "▲" : "▼"}</span>
              </button>
              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
                    <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: "var(--line)" }}>
                      {t.status === "failed" && errMsg && (
                        <div className="rounded-md p-2.5 mb-2" style={{ background: "rgba(240,86,58,0.08)", border: "1px solid rgba(240,86,58,0.25)" }}>
                          <div className="eyebrow" style={{ color: "var(--alert)" }}>Why it failed</div>
                          <div className="mono text-[11px] mt-1 break-words" style={{ color: "var(--ink-0)" }}>{errMsg}</div>
                        </div>
                      )}
                      <dl className="grid grid-cols-[80px_1fr] gap-y-1 gap-x-2">
                        {t.hash && (
                          <>
                            <dt className="eyebrow">Tx hash</dt>
                            <dd className="mono text-[11px] break-all">
                              {explorer ? <a href={`${explorer}/tx/${t.hash}`} target="_blank" rel="noreferrer" style={{ color: "var(--ice)" }} className="hover:underline">{t.hash} ↗</a> : t.hash}
                            </dd>
                          </>
                        )}
                        {t.collection && (
                          <>
                            <dt className="eyebrow">Collection</dt>
                            <dd className="mono text-[11px] break-all">
                              {explorer ? <a href={`${explorer}/address/${t.collection}`} target="_blank" rel="noreferrer" style={{ color: "var(--ice)" }} className="hover:underline">{t.collection.slice(0, 10)}…{t.collection.slice(-8)} ↗</a> : t.collection}
                            </dd>
                          </>
                        )}
                        {detail && Object.entries(detail).filter(([k]) => !["error", "tokenId"].includes(k)).map(([k, v]) => (
                          <>
                            <dt key={`${k}-dt`} className="eyebrow">{k}</dt>
                            <dd key={`${k}-dd`} className="mono text-[11px] break-all" style={{ color: "var(--ink-1)" }}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                          </>
                        ))}
                      </dl>
                      {!t.hash && t.status === "failed" && (
                        <div className="mono text-[10px] mt-2" style={{ color: "var(--ink-2)" }}>No transaction was broadcast — it failed before submission (e.g. gas estimation or vault locked).</div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
