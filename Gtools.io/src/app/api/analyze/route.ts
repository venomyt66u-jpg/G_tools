import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { parseTarget } from "@/lib/parse";
import { analyzeContract } from "@/lib/analyze";
import { detectPhases } from "@/lib/phases";
import { addLog } from "@/lib/db";
import type { ChainKey } from "@/lib/chains";
import type { Address } from "viem";

export async function POST(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  const { input, chain: chainOverride } = await req.json().catch(() => ({}));
  if (!input) return NextResponse.json({ error: "Provide a contract address or mint URL" }, { status: 400 });

  const parsed = parseTarget(input);
  const chain: ChainKey = (chainOverride || parsed.chain || "ethereum") as ChainKey;

  if (!parsed.address) {
    return NextResponse.json({
      error: "Could not extract a contract address from that input. Paste the contract address directly, or a URL that contains it.",
      parsed,
    }, { status: 422 });
  }

  addLog({ level: "INFO", collection: parsed.address, message: `Analyzing ${parsed.source} on ${chain}` });
  try {
    const analysis = await analyzeContract(parsed.address as Address, chain);
    const phases = analysis.abi ? await detectPhases(parsed.address as Address, chain, analysis.abi) : { family: "unknown", phases: [] };
    addLog({ level: "SUCCESS", collection: parsed.address, message: `Analyzed ${analysis.collection.name ?? parsed.address} (${analysis.collection.standard})` });
    return NextResponse.json({ parsed, ...analysis, phases });
  } catch (e) {
    addLog({ level: "ERROR", collection: parsed.address, message: `Analysis failed: ${(e as Error).message}` });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
