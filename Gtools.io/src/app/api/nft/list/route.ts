import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireUnlocked } from "@/lib/auth";
import { batchList } from "@/lib/nft";

export async function POST(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  const locked = requireUnlocked(); if (locked) return locked;
  const { wallet, contract, chain, priceEth, tokenIds } = await req.json().catch(() => ({}));
  if (!wallet || !contract || !chain || priceEth == null)
    return NextResponse.json({ error: "wallet, contract, chain, priceEth required" }, { status: 400 });
  const results = await batchList({ wallet, contract, chain, priceEth: Number(priceEth), tokenIds });
  return NextResponse.json({ results });
}
