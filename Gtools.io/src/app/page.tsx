"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Panel, Btn, Input, Field } from "@/components/ui";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/client";
import MintConfig from "@/components/MintConfig";
import WalletManager from "@/components/WalletManager";
import NftTools from "@/components/NftTools";
import TransactionHistory from "@/components/TransactionHistory";
import Terminal from "@/components/Terminal";

type Tab = "mint" | "wallets" | "nft" | "activity";
const TABS: { key: Tab; label: string }[] = [
  { key: "mint", label: "Mint" },
  { key: "wallets", label: "Wallets" },
  { key: "nft", label: "NFT Tools" },
  { key: "activity", label: "Activity" },
];

export default function Page() {
  const { authed, unlocked, setAuthed, setUnlocked } = useStore();
  const [tab, setTab] = useState<Tab>("mint");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api("/api/auth/unlock").then((r) => {
      if (r.unlocked !== undefined) { setAuthed(true); setUnlocked(r.unlocked); }
      setReady(true);
    }).catch(() => setReady(true));
  }, [setAuthed, setUnlocked]);

  if (!ready) return <BootScreen />;
  if (!authed) return <Gate kind="login" onDone={() => setAuthed(true)} />;
  if (!unlocked) return <Gate kind="unlock" onDone={() => setUnlocked(true)} />;

  return (
    <main className="max-w-[1500px] mx-auto px-4 md:px-7 py-5 md:py-6">
      <Header />
      <div className="grid lg:grid-cols-[1fr_440px] gap-5 mt-5">
        <div className="min-w-0">
          <nav className="flex gap-1 mb-4 p-1 panel" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className="relative flex-1 mono text-[11px] tracking-wide uppercase py-2 rounded-lg transition-colors"
                style={tab === t.key ? { color: "var(--bg-0)" } : { color: "var(--ink-1)" }}>
                {tab === t.key && (
                  <motion.span layoutId="tabPill" className="absolute inset-0 rounded-lg" style={{ background: "var(--amber)" }} transition={{ type: "spring", stiffness: 380, damping: 30 }} />
                )}
                <span className="relative z-10">{t.label}</span>
              </button>
            ))}
          </nav>

          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              {tab === "mint" && <MintConfig />}
              {tab === "wallets" && <WalletManager />}
              {tab === "nft" && <NftTools />}
              {tab === "activity" && <TransactionHistory />}
            </motion.div>
          </AnimatePresence>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start"><Terminal /></aside>
      </div>

      <footer className="mono text-[10px] mt-10 text-center pb-6" style={{ color: "var(--ink-2)" }}>
        G_Tools · single-user · runs locally · keys encrypted at rest · not financial advice · test on a testnet before mainnet
      </footer>
    </main>
  );
}

function Header() {
  const { setUnlocked } = useStore();
  return (
    <header className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <Wordmark />
        <div className="hidden sm:block h-8 w-px" style={{ background: "var(--line)" }} />
        <p className="hidden sm:block eyebrow">NFT Minting Automation Suite</p>
      </div>
      <Btn variant="ghost" onClick={async () => { await api("/api/auth/unlock", { method: "POST", body: { action: "lock" } }); setUnlocked(false); }}>
        Lock vault
      </Btn>
    </header>
  );
}

function Wordmark() {
  return (
    <div className="flex items-baseline gap-0.5">
      <span className="display text-2xl font-bold tracking-tight" style={{ color: "var(--ink-0)" }}>G</span>
      <span className="display text-2xl font-bold" style={{ color: "var(--amber)" }}>_</span>
      <span className="display text-2xl font-bold tracking-tight" style={{ color: "var(--ink-0)" }}>Tools</span>
    </div>
  );
}

function BootScreen() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.4, repeat: Infinity }}>
        <Wordmark />
      </motion.div>
    </main>
  );
}

function Gate({ kind, onDone }: { kind: "login" | "unlock"; onDone: () => void }) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!val) return;
    setBusy(true); setErr(null);
    if (kind === "login") {
      const r = await api("/api/auth/login", { method: "POST", body: { password: val } });
      if (r.ok) onDone(); else setErr(r.error || "Incorrect password");
    } else {
      const r = await api("/api/auth/unlock", { method: "POST", body: { passphrase: val } });
      if (r.unlocked) onDone(); else setErr(r.error || "Could not unlock");
    }
    setBusy(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-sm">
        <div className="flex justify-center mb-6"><Wordmark /></div>
        <Panel>
          <p className="eyebrow mb-1">{kind === "login" ? "Authenticate" : "Unlock wallet vault"}</p>
          <p className="mono text-[11px] mb-5" style={{ color: "var(--ink-2)" }}>
            {kind === "login" ? "Enter your app password to continue." : "Your passphrase decrypts wallet keys in memory for this session."}
          </p>
          <Field label={kind === "login" ? "App password" : "Vault passphrase"}>
            <Input type="password" value={val} autoFocus onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••••" />
          </Field>
          <div className="mt-4"><Btn variant="primary" onClick={submit} disabled={busy || !val} className="w-full">{busy ? "…" : kind === "login" ? "Enter" : "Unlock"}</Btn></div>
          {err && <p className="mono text-[11px] mt-3" style={{ color: "var(--alert)" }}>{err}</p>}
          {kind === "unlock" && (
            <p className="mono text-[10px] mt-4 leading-relaxed" style={{ color: "var(--ink-2)" }}>
              The passphrase is never stored. Treat it like a seed phrase — if you lose it, imported keys can't be recovered from this app.
            </p>
          )}
        </Panel>
      </motion.div>
    </main>
  );
}
