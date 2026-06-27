import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { isUnlocked } from "./vault";

/**
 * Single-user auth + hardening.
 *
 * Layers:
 *  - APP_PASSWORD gates the UI. On success we set an httpOnly, signed, expiring
 *    session cookie (HMAC-SHA256 over payload+expiry, constant-time verified).
 *  - The vault passphrase (separate) decrypts keys in-process only.
 *  - Brute-force protection: per-key attempt counter with exponential lockout,
 *    applied to both login and vault-unlock.
 *
 * This is a LOCAL single-user tool. Even hardened, do not expose it nakedly on
 * the public internet — put it behind the firewall/VPN as the docs say.
 */

const COOKIE = "gtools_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    // Fail loud in production; a weak secret defeats the whole scheme.
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set to a long random string");
    return "dev-insecure-secret-change-me";
  }
  return s;
}

function sign(value: string): string {
  const mac = crypto.createHmac("sha256", secret()).update(value).digest("hex");
  return `${value}.${mac}`;
}
function verifySig(signed: string | undefined): string | null {
  if (!signed) return null;
  const idx = signed.lastIndexOf(".");
  if (idx < 0) return null;
  const value = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expected = crypto.createHmac("sha256", secret()).update(value).digest("hex");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  } catch { return null; }
  return value;
}

export function makeSessionCookie(): string {
  const expiry = Date.now() + SESSION_TTL_MS;
  const nonce = crypto.randomBytes(8).toString("hex");
  return sign(`ok:${expiry}:${nonce}`);
}
export function sessionCookieName() { return COOKIE; }

function sessionValid(cookie: string | undefined): boolean {
  const payload = verifySig(cookie);
  if (!payload) return false;
  const parts = payload.split(":");
  if (parts[0] !== "ok") return false;
  const expiry = Number(parts[1]);
  if (!Number.isFinite(expiry) || Date.now() > expiry) return false;
  return true;
}

export function requireSession(req: NextRequest): NextResponse | null {
  if (!sessionValid(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function requireUnlocked(): NextResponse | null {
  if (!isUnlocked()) return NextResponse.json({ error: "Vault locked. Unlock with your passphrase first." }, { status: 423 });
  return null;
}

export function checkPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected || expected.length < 1) return false;
  // Hash both sides to fixed length so timingSafeEqual never throws on length diff.
  const a = crypto.createHash("sha256").update(password).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/* ---------- Brute-force lockout ---------- */
interface Attempt { count: number; lockedUntil: number; }
const attempts = new Map<string, Attempt>();
const MAX_ATTEMPTS = 5;
const BASE_LOCK_MS = 30_000;

export function rateLimit(key: string): { ok: boolean; retryAfterMs?: number } {
  const a = attempts.get(key);
  if (a && a.lockedUntil > Date.now()) return { ok: false, retryAfterMs: a.lockedUntil - Date.now() };
  return { ok: true };
}
export function recordFailure(key: string) {
  const a = attempts.get(key) ?? { count: 0, lockedUntil: 0 };
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) {
    // exponential: 30s, 60s, 120s, ...
    const over = a.count - MAX_ATTEMPTS;
    a.lockedUntil = Date.now() + BASE_LOCK_MS * Math.pow(2, over);
  }
  attempts.set(key, a);
}
export function recordSuccess(key: string) { attempts.delete(key); }

/** Best-effort client key for rate limiting (single-user, so coarse is fine). */
export function clientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
