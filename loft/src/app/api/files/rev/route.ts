import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { getRev } from "@/lib/rev";

// The catalogue's revision: a few bytes for pollers, so the full list is only
// fetched when something changed.
export async function GET() {
  const s = await getSession();
  if (!s) return unauthorized();
  return NextResponse.json({ rev: await getRev(s.uid) }, { headers: { "cache-control": "no-store" } });
}
