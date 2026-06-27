import { NextRequest, NextResponse } from "next/server";
import { requireSession, rateLimit, recordFailure, recordSuccess, clientKey } from "@/lib/auth";
import { unlockVault, lockVault, isUnlocked } from "@/lib/vault";

export async function POST(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  const { passphrase, action } = await req.json().catch(() => ({}));
  if (action === "lock") { lockVault(); return NextResponse.json({ unlocked: false }); }

  const key = `unlock:${clientKey(req)}`;
  const rl = rateLimit(key);
  if (!rl.ok) return NextResponse.json({ error: `Too many attempts. Try again in ${Math.ceil((rl.retryAfterMs ?? 0) / 1000)}s.` }, { status: 429 });

  try {
    unlockVault(passphrase);
    recordSuccess(key);
    return NextResponse.json({ unlocked: true });
  } catch (e) {
    recordFailure(key);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  return NextResponse.json({ unlocked: isUnlocked() });
}
