import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireUnlocked } from "@/lib/auth";
import { batchFund, type FundTarget } from "@/lib/fund";
import type { Address } from "viem";
import type { ChainKey } from "@/lib/chains";

export async function POST(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  const locked = requireUnlocked(); if (locked) return locked;
  const { master, chain, targets } = await req.json().catch(() => ({})) as
    { master: Address; chain: ChainKey; targets: FundTarget[] };
  if (!master || !chain || !targets?.length)
    return NextResponse.json({ error: "master, chain, targets required" }, { status: 400 });
  const results = await batchFund(master, chain, targets);
  return NextResponse.json({ results });
}
