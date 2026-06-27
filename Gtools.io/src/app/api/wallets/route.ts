import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireUnlocked } from "@/lib/auth";
import { encryptPrivateKey, deriveAddress } from "@/lib/vault";
import { insertWallet, listWallets, renameWallet, deleteWallet, setMaster, addLog } from "@/lib/db";
import { readAllBalances } from "@/lib/fund";
import type { ChainKey } from "@/lib/chains";

// GET: list wallets (NEVER returns enc_blob) + optional balances for a chain
export async function GET(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  const chain = (req.nextUrl.searchParams.get("chain") || "ethereum") as ChainKey;
  const withBalances = req.nextUrl.searchParams.get("balances") === "1";
  const wallets = listWallets().map((w) => ({ id: w.id, label: w.label, address: w.address, is_master: !!w.is_master }));
  if (!withBalances) return NextResponse.json({ wallets });
  try {
    const balances = await readAllBalances(chain);
    return NextResponse.json({ wallets: balances.map((b) => ({ id: b.id, label: b.label, address: b.address, is_master: b.is_master, balances: b.balances })) });
  } catch (e) {
    return NextResponse.json({ wallets, balanceError: (e as Error).message });
  }
}

// POST: import a wallet from a private key (encrypted at rest; key not stored raw)
export async function POST(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  const locked = requireUnlocked(); if (locked) return locked;
  const { label, privateKey } = await req.json().catch(() => ({}));
  if (!privateKey) return NextResponse.json({ error: "privateKey required" }, { status: 400 });
  let address: string;
  try { address = deriveAddress(privateKey); }
  catch { return NextResponse.json({ error: "Invalid private key" }, { status: 400 }); }
  try {
    const blob = encryptPrivateKey(privateKey);
    insertWallet({ label: label?.trim() || address.slice(0, 8), address, enc_blob: JSON.stringify(blob) });
    addLog({ level: "WALLET", wallet: label, message: `Imported wallet ${address}` });
    return NextResponse.json({ ok: true, address });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("UNIQUE")) return NextResponse.json({ error: "Wallet already imported" }, { status: 409 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH: rename or set master
export async function PATCH(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  const { id, label, master } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (typeof label === "string") renameWallet(id, label.trim());
  if (master === true) setMaster(id);
  return NextResponse.json({ ok: true });
}

// DELETE: remove a wallet record (encrypted key destroyed)
export async function DELETE(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  deleteWallet(id);
  return NextResponse.json({ ok: true });
}
