import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getMarketData } from "@/lib/opensea";
import type { Address } from "viem";
import type { ChainKey } from "@/lib/chains";

export async function GET(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  const contract = req.nextUrl.searchParams.get("contract") as Address | null;
  const chain = (req.nextUrl.searchParams.get("chain") || "ethereum") as ChainKey;
  if (!contract) return NextResponse.json({ error: "contract required" }, { status: 400 });
  const data = await getMarketData(contract, chain);
  return NextResponse.json(data);
}
