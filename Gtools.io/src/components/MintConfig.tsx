"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Panel, Btn, Input, Field, Skeleton } from "./ui";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/client";
import GasGauge, { type SpeedMode } from "./GasGauge";
import { PhaseInstrument } from "./PhaseInstrument";

const CHAINS = ["ethereum", "base", "arbitrum", "optimism", "polygon"] as const;

export default function MintConfig() {
  const { chain, setChain, analysis, setAnalysis, wallets, selectedWallets, toggleWallet, selectAll, clearSelection } = useStore();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // mint settings
  const [fnName, setFnName] = useState("");
  const [qty, setQty] = useState("1");
  const [priceEth, setPriceEth] = useState("");
  const [mode, setMode] = useState<SpeedMode>("fast");
  const [retry, setRetry] = useState("1");
  const [estimate, setEstimate] = useState<any>(null);
  const [minting, setMinting] = useState(false);
  const [outcomes, setOutcomes] = useState<any[]>([]);

  async function analyze() {
    setLoading(true); setErr(null); setAnalysis(null); setEstimate(null); setOutcomes([]);
    try {
      const r = await api("/api/analyze", { method: "POST", body: { input, chain } });
      if (r.error) { setErr(r.error); }
      else {
        setAnalysis(r);
        if (r.mintCandidates?.[0]) setFnName(r.mintCandidates[0].name);
        if (r.collection?.mintPriceEth) setPriceEth(r.collection.mintPriceEth);
      }
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }

  function buildParams() {
    if (!analysis) throw new Error("No analysis loaded");
    const cand = analysis.mintCandidates?.find((c: any) => c.name === fnName);
    // Build args heuristically: a single uint256 quantity is the common case.
    // For anything else the user must understand the function shape (shown in UI).
    let args: any[] = [];
    if (cand) {
      const ins = cand.inputs as { name: string; type: string }[];
      args = ins.map((i) => {
        if (i.type === "uint256") return qty;
        if (i.type === "address") return selectedWallets[0];
        if (i.type === "bytes32[]") return []; // proof must be supplied for gated phases
        if (i.type === "bool") return true;
        return "";
      });
    }
    const valueEth = (parseFloat(priceEth || "0") * parseInt(qty || "1")).toString();
    return {
      chain, contract: analysis.collection.address, abi: analysis.abi,
      functionName: fnName, args, valueEth, mode, retryCount: parseInt(retry || "0"),
    };
  }

  async function doEstimate() {
    if (!selectedWallets[0]) { setErr("Select at least one wallet"); return; }
    setErr(null);
    const r = await api("/api/mint/estimate", { method: "POST", body: { params: buildParams(), from: selectedWallets[0] } });
    setEstimate(r);
  }

  async function doMint() {
    if (!selectedWallets.length) { setErr("Select wallets to mint from"); return; }
    setMinting(true); setErr(null); setOutcomes([]);
    const r = await api("/api/mint", { method: "POST", body: { wallets: selectedWallets, params: buildParams() } });
    if (r.error) setErr(r.error); else setOutcomes(r.outcomes || []);
    setMinting(false);
  }

  const c = analysis?.collection;
  const cand = analysis?.mintCandidates?.find((x: any) => x.name === fnName);

  return (
    <div className="space-y-4">
      <Panel title="Mint Configuration" accent="#C6FF3A">
        <div className="flex gap-2 flex-wrap mb-3">
          {CHAINS.map((ch) => (
            <button key={ch} onClick={() => setChain(ch)}
              className={`mono text-[10px] uppercase px-3 py-1.5 rounded-md border transition-all ${chain === ch ? "border-acid/60 text-acid bg-acid/10" : "border-white/10 text-white/40 hover:text-white/70"}`}>
              {ch}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input placeholder="Contract address, OpenSea / Zora / Manifold / Highlight / mint URL…" value={input}
            onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && analyze()} />
          <Btn variant="primary" onClick={analyze} disabled={loading || !input}>{loading ? "ANALYZING…" : "ANALYZE"}</Btn>
        </div>
        {err && <p className="text-ember text-xs mt-2 mono">{err}</p>}
      </Panel>

      {loading && (
        <Panel><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div></Panel>
      )}

      <AnimatePresence>
        {c && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <Panel title="Collection" accent="#3AE8FF">
              <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-2xl font-bold">{c.name || "Unknown"} <span className="text-white/40 text-base mono">{c.symbol}</span></h3>
                <span className="mono text-[10px] px-2 py-1 rounded border border-white/10 text-white/50">{c.standard}{c.isProxy ? " · PROXY" : ""}{c.verified ? " · VERIFIED" : " · UNVERIFIED"}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ["Total Supply", c.totalSupply ?? "—"], ["Max Supply", c.maxSupply ?? "—"],
                  ["Remaining", c.remaining ?? "—"], ["Mint Price", c.mintPriceEth ? `${c.mintPriceEth} ETH` : "—"],
                  ["Chain", c.chain], ["Owner/Creator", c.owner ? `${c.owner.slice(0, 6)}…${c.owner.slice(-4)}` : "—"],
                ].map(([k, v]) => (
                  <div key={k as string} className="bg-black/20 rounded-lg p-3 border border-white/5">
                    <div className="mono text-[9px] uppercase text-white/40">{k}</div>
                    <div className="mono text-sm mt-1 truncate">{v as string}</div>
                  </div>
                ))}
              </div>
              <a href={c.explorerUrl} target="_blank" className="mono text-[10px] text-cyan mt-3 inline-block hover:underline">View on explorer ↗</a>
            </Panel>

            <Panel title="Phase Timeline" accent="var(--signal)">
              <PhaseInstrument
                phases={(analysis.phases?.phases ?? []).map((p: any) => ({
                  name: p.name, startTime: p.startTime ?? null, endTime: p.endTime ?? null,
                  priceEth: p.priceEth ?? null, requiresProof: !!p.requiresProof,
                }))}
                gasGwei={estimate?.ok ? estimate.maxFeePerGasGwei : null}
              />
              <p className="mono text-[10px] mt-2" style={{ color: "var(--ink-2)" }}>
                Live clock. The green marker is now; amber blocks are open phases, violet blocks require an allowlist proof. Phase data is read on-chain where the contract exposes it.
              </p>
            </Panel>

            <Panel title="Mint Phases" accent="#FF5C3A">
              {analysis.phases?.phases?.length ? (
                <div className="space-y-2">
                  {analysis.phases.phases.map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-black/20 rounded-lg p-3 border border-white/5">
                      <div>
                        <div className="font-bold text-sm">{p.name} {p.requiresProof && <span className="text-cyan mono text-[9px]">· ALLOWLIST</span>}</div>
                        <div className="mono text-[10px] text-white/40">
                          {p.startTime ? new Date(p.startTime * 1000).toLocaleString() : "—"} · limit {p.walletLimit ?? "—"}
                        </div>
                      </div>
                      <div className="mono text-sm text-acid">{p.priceEth ?? "—"} ETH</div>
                    </div>
                  ))}
                  <p className="mono text-[10px] text-white/40 mt-2">{analysis.phases.note}</p>
                </div>
              ) : (
                <div>
                  <p className="mono text-xs text-white/50">{analysis.phases?.note || "No standard phase schema detected."}</p>
                  {analysis.phases?.toggles?.length > 0 && (
                    <div className="mt-2 space-y-1">{analysis.phases.toggles.map((t: string, i: number) => <div key={i} className="mono text-[11px] text-cyan/80">{t}</div>)}</div>
                  )}
                </div>
              )}
            </Panel>

            <Panel title="Wallet Eligibility & Selection" accent="#C6FF3A">
              <div className="flex gap-2 mb-3">
                <Btn variant="ghost" onClick={selectAll}>SELECT ALL</Btn>
                <Btn variant="ghost" onClick={clearSelection}>CLEAR</Btn>
                <span className="mono text-[10px] text-white/40 self-center">{selectedWallets.length} selected</span>
              </div>
              {wallets.length === 0 ? <p className="mono text-xs text-white/40">No wallets imported. Add wallets in the Wallet Manager.</p> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {wallets.map((w) => {
                    const sel = selectedWallets.includes(w.address);
                    return (
                      <button key={w.id} onClick={() => toggleWallet(w.address)}
                        className={`text-left rounded-lg p-3 border transition-all ${sel ? "border-acid/50 bg-acid/5" : "border-white/8 hover:border-white/20"}`}>
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-sm">{w.label}</span>
                          {/* Eligibility is YELLOW/unknown by default — real eligibility requires the
                              phase's merkle/holder/balance rules, which vary per contract. */}
                          <span className="statusdot" style={{ background: "#E8C13A" }} title="Eligibility unknown — verify per phase" />
                        </div>
                        <div className="mono text-[10px] text-white/40">{w.address.slice(0, 10)}…{w.address.slice(-6)}</div>
                        {w.balances && <div className="mono text-[10px] text-cyan mt-1">{(+w.balances.eth).toFixed(4)} ETH</div>}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mono text-[10px] text-white/40 mt-3">
                Eligibility shows <span style={{ color: "#E8C13A" }}>yellow/unknown</span> by default. On-chain allowlist (merkle), holder, and balance checks are phase-specific and must be confirmed against the selected phase before minting a gated phase.
              </p>
            </Panel>

            <Panel title="Mint Execution Settings" accent="#3AE8FF">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Field label="Mint Function">
                  <select value={fnName} onChange={(e) => setFnName(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm w-full mono">
                    {analysis.mintCandidates?.map((m: any) => <option key={m.signature} value={m.name}>{m.signature}{m.payable ? " 💰" : ""}</option>)}
                    {!analysis.mintCandidates?.length && <option>no candidates</option>}
                  </select>
                </Field>
                <Field label="Quantity"><Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
                <Field label="Price / unit (ETH)"><Input value={priceEth} onChange={(e) => setPriceEth(e.target.value)} placeholder="0.0" /></Field>
                <Field label="Retry count"><Input type="number" min="0" value={retry} onChange={(e) => setRetry(e.target.value)} /></Field>
              </div>
              {cand && <p className="mono text-[10px] text-white/40 mb-3">Args mapped: {cand.inputs.map((i: any) => `${i.name || "?"}:${i.type}`).join(", ") || "none"}. {cand.inputs.some((i: any) => i.type === "bytes32[]") && <span className="text-cyan">Gated phase — supply a merkle proof manually for production use.</span>}</p>}

              <div className="my-4">
                <GasGauge
                  value={mode}
                  onChange={(m) => { setMode(m); if (estimate?.ok) doEstimate(); }}
                  estimate={estimate?.ok ? {
                    expectedGwei: estimate.expectedGwei,
                    maxFeeGwei: estimate.maxFeeGwei,
                    expectedCostEth: estimate.expectedCostEth,
                    maxCostEth: estimate.maxCostEth,
                  } : undefined}
                />
              </div>

              <div className="flex gap-2">
                <Btn onClick={doEstimate} disabled={!selectedWallets.length}>ESTIMATE GAS</Btn>
                <Btn variant="primary" onClick={doMint} disabled={minting || !selectedWallets.length}>{minting ? "MINTING…" : `MINT ${selectedWallets.length} WALLET(S)`}</Btn>
              </div>
              {estimate?.ok === false && <p className="text-ember mono text-xs mt-2">Estimate failed: {estimate.error}</p>}
              {outcomes.length > 0 && (
                <div className="mt-4 space-y-1">
                  {outcomes.map((o, i) => (
                    <div key={i} className="flex justify-between items-center bg-black/20 rounded-lg p-2 border border-white/5 mono text-[11px]">
                      <span>{o.walletAddress.slice(0, 8)}…{o.walletAddress.slice(-4)}</span>
                      <span style={{ color: o.status === "confirmed" ? "#C6FF3A" : o.status === "pending" ? "#3AE8FF" : "#FF5C3A" }}>{o.status}{o.error ? ` · ${o.error.slice(0, 40)}` : ""}</span>
                      {o.hash && <a className="text-cyan" target="_blank" href={`${c.explorerUrl.split("/address")[0]}/tx/${o.hash}`}>tx ↗</a>}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
