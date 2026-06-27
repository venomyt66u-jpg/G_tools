import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireUnlocked } from "@/lib/auth";
import { mintFromWallets, type MintParams } from "@/lib/mint";
import { autoFlip, type FlipAction } from "@/lib/opensea";
import type { Address } from "viem";

export async function POST(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  const locked = requireUnlocked(); if (locked) return locked;
  const body = await req.json().catch(() => ({}));
  const { wallets, params, flip } = body as {
    wallets: Address[]; params: MintParams; flip?: FlipAction;
  };
  if (!wallets?.length || !params?.contract || !params?.functionName || !params?.abi) {
    return NextResponse.json({ error: "wallets, params.contract, params.functionName, params.abi required" }, { status: 400 });
  }

  const outcomes = await mintFromWallets(wallets, params);

  // Auto-flip on success. Note: we don't reliably know the minted tokenId from a
  // generic mint receipt without decoding Transfer logs; flip here is best-effort
  // and applies only when the caller supplies a tokenId mapping later. For now we
  // report mint outcomes and let the flip step be driven from the Auto-Flip panel.
  let flipResults: unknown[] = [];
  if (flip && flip.type !== "none") {
    flipResults = [{ note: "Auto-flip requires the minted tokenId. Trigger flips from the Auto-Flip panel after confirming token IDs from the mint receipts." }];
    void autoFlip;
  }

  return NextResponse.json({ outcomes, flipResults });
}
