import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireUnlocked } from "@/lib/auth";
import { acceptAllOffers } from "@/lib/nft";

export async function POST(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  const locked = requireUnlocked(); if (locked) return locked;
  const { wallet, contract, chain, minEth, tokenIds } = await req.json().catch(() => ({}));
  if (!wallet || !contract || !chain)
    return NextResponse.json({ error: "wallet, contract, chain required" }, { status: 400 });
  const results = await acceptAllOffers({ wallet, contract, chain, minEth: minEth != null ? Number(minEth) : undefined, tokenIds });
  return NextResponse.json({ results });
}
