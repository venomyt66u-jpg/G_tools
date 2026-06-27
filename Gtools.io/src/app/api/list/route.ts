import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireUnlocked } from "@/lib/auth";
import { autoFlip, type FlipAction } from "@/lib/opensea";
import type { Address } from "viem";
import type { ChainKey } from "@/lib/chains";

export async function POST(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  const locked = requireUnlocked(); if (locked) return locked;
  const { walletAddress, chain, contract, tokenId, action } = await req.json().catch(() => ({})) as
    { walletAddress: Address; chain: ChainKey; contract: Address; tokenId: string; action: FlipAction };
  if (!walletAddress || !chain || !contract || !tokenId || !action)
    return NextResponse.json({ error: "walletAddress, chain, contract, tokenId, action required" }, { status: 400 });
  const result = await autoFlip({ walletAddress, chain, contract, tokenId, action });
  return NextResponse.json(result);
}
