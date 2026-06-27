import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { estimateMint, type MintParams } from "@/lib/mint";
import type { Address } from "viem";

export async function POST(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  const { params, from } = await req.json().catch(() => ({})) as { params: MintParams; from: Address };
  if (!params?.contract || !from) return NextResponse.json({ error: "params and from required" }, { status: 400 });
  const result = await estimateMint(params, from);
  return NextResponse.json(result);
}
