"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Panel, Btn, Input, Field, Select, StatusBadge } from "./ui";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/client";

export default function NftTools() {
  const { chain, wallets } = useStore();
  const [contract, setContract] = useState("");
  const [wallet, setWallet] = useState("");
  const [scanning, setScanning] = useState(false);
  const [nfts, setNfts] = useState<any[]>([]);
  const [rarest, setRarest] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [standard, setStandard] = useState<"ERC721" | "ERC1155">("ERC721");

  // actions
  const [dest, setDest] = useState("");
  const [price, setPrice] = useState("");
  const [minOffer, setMinOffer] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);

  async function scan() {
    if (!wallet || !contract) { setErr("Pick a wallet and paste a collection address"); return; }
    setScanning(true); setErr(null); setNfts([]); setRarest(null); setResults([]);
    const r = await api("/api/nft/scan", { method: "POST", body: { wallet, contract, chain, withRarity: true } });
    if (r.error) setErr(r.error);
    else { setNfts(r.nfts || []); setRarest(r.rarest || null); }
    setScanning(false);
  }

  async function run(kind: "transfer" | "list" | "accept") {
    setRunning(kind); setErr(null); setResults([]);
    let r;
    if (kind === "transfer") {
      if (!dest) { setErr("Enter a destination address"); setRunning(null); return; }
      r = await api("/api/nft/transfer", { method: "POST", body: { fromWallet: wallet, toAddress: dest, contract, chain, standard } });
    } else if (kind === "list") {
      if (!price) { setErr("Enter a listing price"); setRunning(null); return; }
      r = await api("/api/nft/list", { method: "POST", body: { wallet, contract, chain, priceEth: price } });
    } else {
      r = await api("/api/nft/accept-offers", { method: "POST", body: { wallet, contract, chain, minEth: minOffer || undefined } });
    }
    if (r.error) setErr(r.error); else setResults(r.results || []);
    setRunning(null);
  }

  const done = results.filter((x) => x.status === "confirmed").length;
  const failed = results.filter((x) => x.status === "failed").length;
  const skipped = results.filter((x) => x.status === "skipped").length;

  return (
    <div className="space-y-4">
      <Panel title="NFT Tools — scan a collection you own" accent="var(--violet)">
        <div className="grid md:grid-cols-[1fr_1fr] gap-3 mb-3">
          <Field label="Wallet">
            <Select value={wallet} onChange={(e) => setWallet(e.target.value)}>
              <option value="">Select wallet…</option>
              {wallets.map((w) => <option key={w.id} value={w.address}>{w.label} · {w.address.slice(0, 8)}…</option>)}
            </Select>
          </Field>
          <Field label="Collection contract">
            <Input value={contract} onChange={(e) => setContract(e.target.value)} placeholder="0x… collection address" />
          </Field>
        </div>
        <div className="flex gap-2 items-center">
          <Btn variant="primary" onClick={scan} disabled={scanning}>{scanning ? "SCANNING…" : "SCAN HOLDINGS"}</Btn>
          {nfts.length > 0 && <span className="mono text-xs" style={{ color: "var(--ink-1)" }}>{nfts.length} owned in this collection</span>}
        </div>
        {err && <p className="mono text-xs mt-2" style={{ color: "var(--alert)" }}>{err}</p>}
      </Panel>

      {(scanning || nfts.length > 0) && (
        <Panel title="Holdings" accent="var(--ice)">
          {rarest && (
            <div className="panel-raised p-3 mb-3 flex items-center gap-3" style={{ borderColor: "rgba(139,124,246,0.4)" }}>
              <span className="mono text-[10px] uppercase px-2 py-1 rounded" style={{ background: "rgba(139,124,246,0.15)", color: "var(--violet)" }}>RAREST</span>
              <div className="mono text-sm">{rarest.name || `#${rarest.tokenId}`}</div>
              {rarest.rarityRank && <div className="mono text-xs ml-auto" style={{ color: "var(--ink-1)" }}>rank #{rarest.rarityRank}</div>}
            </div>
          )}
          {scanning ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-24" />)}</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-[40vh] overflow-auto pr-1">
              {nfts.map((n) => (
                <motion.div key={n.tokenId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="panel-raised p-2">
                  {n.image
                    ? <img src={n.image} alt={n.name || n.tokenId} className="w-full aspect-square object-cover rounded-md mb-1.5" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2"; }} />
                    : <div className="w-full aspect-square rounded-md mb-1.5 flex items-center justify-center" style={{ background: "var(--bg-0)" }}><span className="mono text-[10px]" style={{ color: "var(--ink-2)" }}>no image</span></div>}
                  <div className="mono text-[10px] truncate" style={{ color: "var(--ink-0)" }}>{n.name || `#${n.tokenId}`}</div>
                  {n.rarityRank && <div className="mono text-[9px]" style={{ color: "var(--violet)" }}>rank #{n.rarityRank}</div>}
                </motion.div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {nfts.length > 0 && (
        <Panel title="Batch actions — applies to all owned tokens above" accent="var(--amber)">
          <div className="space-y-4">
            {/* Transfer */}
            <div className="panel-raised p-3">
              <div className="eyebrow mb-2">Transfer all to one wallet</div>
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex-1 min-w-[200px]"><Field label="Destination address"><Input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="0x…" /></Field></div>
                <Field label="Standard"><Select value={standard} onChange={(e) => setStandard(e.target.value as any)} className="w-28"><option>ERC721</option><option>ERC1155</option></Select></Field>
                <Btn onClick={() => run("transfer")} disabled={running !== null}>{running === "transfer" ? "SENDING…" : "TRANSFER ALL"}</Btn>
              </div>
            </div>
            {/* List */}
            <div className="panel-raised p-3">
              <div className="eyebrow mb-2">List all on OpenSea at a fixed price</div>
              <div className="flex gap-2 items-end">
                <div className="flex-1"><Field label="Price per item (ETH)"><Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.05" /></Field></div>
                <Btn onClick={() => run("list")} disabled={running !== null}>{running === "list" ? "LISTING…" : "LIST ALL"}</Btn>
              </div>
            </div>
            {/* Accept offers */}
            <div className="panel-raised p-3">
              <div className="eyebrow mb-2">Accept best offer on each — until offers run out</div>
              <div className="flex gap-2 items-end">
                <div className="flex-1"><Field label="Minimum acceptable offer (ETH, optional)" hint="Leave empty to accept any best offer"><Input value={minOffer} onChange={(e) => setMinOffer(e.target.value)} placeholder="0.0" /></Field></div>
                <Btn onClick={() => run("accept")} disabled={running !== null}>{running === "accept" ? "ACCEPTING…" : "ACCEPT OFFERS"}</Btn>
              </div>
            </div>
          </div>

          {results.length > 0 && (
            <div className="mt-4">
              <div className="flex gap-3 mb-2 mono text-[11px]">
                <span style={{ color: "var(--signal)" }}>{done} done</span>
                <span style={{ color: "var(--ink-2)" }}>{skipped} skipped</span>
                <span style={{ color: "var(--alert)" }}>{failed} failed</span>
              </div>
              <div className="space-y-1 max-h-48 overflow-auto pr-1">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center justify-between panel-raised px-2.5 py-1.5">
                    <span className="mono text-[11px]">#{r.tokenId}</span>
                    <div className="flex items-center gap-2">
                      {r.error && <span className="mono text-[10px] truncate max-w-[200px]" style={{ color: "var(--ink-2)" }}>{r.error}</span>}
                      <StatusBadge status={r.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
