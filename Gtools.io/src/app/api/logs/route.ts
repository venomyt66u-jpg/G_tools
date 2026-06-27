import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getLogs } from "@/lib/db";

export async function GET(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  const level = req.nextUrl.searchParams.get("level") || undefined;
  const q = req.nextUrl.searchParams.get("q") || undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") || 500);
  return NextResponse.json({ logs: getLogs({ level, q, limit }) });
}
