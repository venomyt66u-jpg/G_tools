import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireUnlocked } from "@/lib/auth";
import { batchTransfer } from "@/lib/nft";
import type { Address } from "viem";
import type { ChainKey } from "@/lib/chains";

export async function POST(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  const locked = requireUnlocked(); if (locked) return locked;
  const { fromWallet, toAddress, contract, chain, standard, tokenIds } = await req.json().catch(() => ({}));
  if (!fromWallet || !toAddress || !contract || !chain || !standard)
    return NextResponse.json({ error: "fromWallet, toAddress, contract, chain, standard required" }, { status: 400 });
  const results = await batchTransfer({ fromWallet, toAddress, contract, chain, standard, tokenIds });
  return NextResponse.json({ results });
}
