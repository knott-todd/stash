import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getUid } from "@/lib/session";
import { authUrl, isProvider, PROVIDERS } from "@/lib/providers";
import { requestOrigin } from "@/lib/public-url";

// Connect another drive (read-only) to the signed-in account, for a move.
export async function GET(req: Request, { params }: { params: Promise<{ p: string }> }) {
  const { p } = await params;
  if (!isProvider(p) || !PROVIDERS[p].enabled) return NextResponse.json({ error: "That provider isn't set up" }, { status: 404 });
  const uid = await getUid();
  const origin = requestOrigin(req);
  if (!uid) return NextResponse.redirect(`${origin}/signin?next=${encodeURIComponent(`/api/providers/${p}/auth`)}`);
  const state = randomBytes(12).toString("base64url");
  (await cookies()).set(`stash_oauth_${p}`, JSON.stringify({ state, uid }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return NextResponse.redirect(authUrl(p, origin, state));
}
