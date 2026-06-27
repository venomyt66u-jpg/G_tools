import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getTransactions } from "@/lib/db";

export async function GET(req: NextRequest) {
  const guard = requireSession(req); if (guard) return guard;
  return NextResponse.json({ transactions: getTransactions(300) });
}
