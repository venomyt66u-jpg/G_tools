import { NextRequest, NextResponse } from "next/server";
import { checkPassword, makeSessionCookie, sessionCookieName, rateLimit, recordFailure, recordSuccess, clientKey } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const key = `login:${clientKey(req)}`;
  const rl = rateLimit(key);
  if (!rl.ok) return NextResponse.json({ error: `Too many attempts. Try again in ${Math.ceil((rl.retryAfterMs ?? 0) / 1000)}s.` }, { status: 429 });

  const { password } = await req.json().catch(() => ({}));
  if (!password || !checkPassword(password)) {
    recordFailure(key);
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  recordSuccess(key);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookieName(), makeSessionCookie(), {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 60 * 60 * 12,
  });
  return res;
}
