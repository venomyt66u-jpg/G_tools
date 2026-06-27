"use client";
import { useState, useEffect, useCallback } from "react";
import { Panel, Btn, Input, Field, StatusBadge } from "./ui";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/client";

export default function WalletManager() {
  const { chain, wallets, setWallets } = useStore();
  const [label, setLabel] = useState("");
  const [pk, setPk] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadingBal, setLoadingBal] = useState(false);

  // funding
  const [amount, setAmount] = useState("0.05");
  const [fundResults, setFundResults] = useState<any[]>([]);
  const [funding, setFunding] = useState(false);
  const [dest, setDest] = useState<string[]>([]);

  const refresh = useCallback(async (withBal = false) => {
    if (withBal) setLoadingBal(true);
    const r = await api(`/api/wallets?chain=${chain}${withBal ? "&balances=1" : ""}`);
    if (r.wallets) setWallets(r.wallets);
    setLoadingBal(false);
  }, [chain, setWallets]);

  useEffect(() => { refresh(false); }, [refresh]);

  async function importWallet() {
    setBusy(true); setErr(null);
    const r = await api("/api/wallets", { method: "POST", body: { label, privateKey: pk } });
    if (r.error) setErr(r.error); else { setPk(""); setLabel(""); refresh(false); }
    setBusy(false);
  }
  async function rename(id: number) {
    const l = prompt("New label:"); if (l) { await api("/api/wallets", { method: "PATCH", body: { id, label: l } }); refresh(false); }
  }
  async function del(id: number) {
    if (confirm("Delete this wallet record? The encrypted key will be destroyed.")) { await api(`/api/wallets?id=${id}`, { method: "DELETE" }); refresh(false); }
  }
  async function makeMaster(id: number) { await api("/api/wallets", { method: "PATCH", body: { id, master: true } }); refresh(false); }

  const master = wallets.find((w) => w.is_master);
  async function fund() {
    if (!master) { setErr("Designate a master funding wallet first"); return; }
    if (!dest.length) { setErr("Select destination wallets"); return; }
    setFunding(true); setErr(null);
    const targets = dest.map((address) => ({ address, amountEth: amount }));
    const r = await api("/api/fund", { method: "POST", body: { master: master.address, chain, targets } });
    if (r.error) setErr(r.error); else setFundResults(r.results || []);
    setFunding(false); refresh(true);
  }

  return (
    <div className="space-y-4">
      <Panel title="Import Wallet" accent="#C6FF3A">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Label (e.g. A1)"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="A1" /></Field>
          <div className="md:col-span-2"><Field label="Private key (encrypted at rest, never leaves this machine)">
            <Input type="password" value={pk} onChange={(e) => setPk(e.target.value)} placeholder="0x…" />
          </Field></div>
        </div>
        <div className="mt-3"><Btn variant="primary" onClick={importWallet} disabled={busy || !pk}>{busy ? "ENCRYPTING…" : "IMPORT"}</Btn></div>
        {err && <p className="text-ember text-xs mt-2 mono">{err}</p>}
      </Panel>

      <Panel title="Wallets" accent="#3AE8FF">
        <div className="flex gap-2 mb-3"><Btn onClick={() => refresh(true)} disabled={loadingBal}>{loadingBal ? "LOADING BALANCES…" : "REFRESH BALANCES"}</Btn></div>
        {wallets.length === 0 ? <p className="mono text-xs text-white/40">No wallets yet.</p> : (
          <div className="space-y-2">
            {wallets.map((w) => (
              <div key={w.id} className="flex items-center justify-between bg-black/20 rounded-lg p-3 border border-white/5 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={dest.includes(w.address)} onChange={() => setDest((d) => d.includes(w.address) ? d.filter((x) => x !== w.address) : [...d, w.address])} />
                  <div>
                    <div className="font-bold text-sm flex items-center gap-2">{w.label}{w.is_master && <span className="mono text-[9px] px-1.5 py-0.5 rounded bg-acid/20 text-acid">MASTER</span>}</div>
                    <div className="mono text-[10px] text-white/40">{w.address.slice(0, 12)}…{w.address.slice(-8)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {w.balances && (
                    <div className="text-right mono text-[11px]">
                      <div className="text-cyan">{(+w.balances.eth).toFixed(4)} ETH</div>
                      <div className="text-white/40">{(+w.balances.weth).toFixed(4)} WETH · {w.balances.nftCount ?? "?"} NFTs</div>
                    </div>
                  )}
                  <div className="flex gap-1">
                    <Btn variant="ghost" onClick={() => rename(w.id)}>RENAME</Btn>
                    {!w.is_master && <Btn variant="ghost" onClick={() => makeMaster(w.id)}>SET MASTER</Btn>}
                    <Btn variant="danger" onClick={() => del(w.id)}>DEL</Btn>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Funding — Batch Send from Master" accent="#FF5C3A">
        {!master ? <p className="mono text-xs text-white/40">Designate a master funding wallet above (SET MASTER).</p> : (
          <>
            <p className="mono text-[11px] text-white/50 mb-3">Source: <span className="text-acid">{master.label}</span> ({master.address.slice(0, 8)}…). Select destination wallets (checkboxes above), set amount, send.</p>
            <div className="flex gap-2 items-end">
              <Field label="ETH per wallet"><Input value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Btn variant="primary" onClick={fund} disabled={funding || !dest.length}>{funding ? "SENDING…" : `FUND ${dest.length} WALLET(S)`}</Btn>
            </div>
            {fundResults.length > 0 && (
              <div className="mt-3 space-y-1">
                {fundResults.map((r, i) => (
                  <div key={i} className="flex justify-between bg-black/20 rounded p-2 border border-white/5 mono text-[11px]">
                    <span>{r.to.slice(0, 10)}…{r.to.slice(-6)}</span><StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
