import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { scanOwned, attachRarity } from "@/lib/nft";
import type { Address } from "viem";
import type { ChainKey } from "@/lib/chains";

export async function POST(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  const { wallet, contract, chain, withRarity } = await req.json().catch(() => ({})) as
    { wallet: Address; contract: Address; chain: ChainKey; withRarity?: boolean };
  if (!wallet || !contract || !chain) return NextResponse.json({ error: "wallet, contract, chain required" }, { status: 400 });
  try {
    let nfts = await scanOwned(wallet, contract, chain);
    if (withRarity && nfts.length) nfts = await attachRarity(nfts, contract, chain);
    const rarest = nfts.filter(n => n.rarityRank).sort((a,b)=>a.rarityRank!-b.rarityRank!)[0] ?? null;
    return NextResponse.json({ count: nfts.length, nfts, rarest });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
