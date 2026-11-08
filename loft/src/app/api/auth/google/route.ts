import { NextResponse } from "next/server";
import { AUTH_ENABLED, beginOAuth } from "@/lib/auth";
import { requestOrigin } from "@/lib/public-url";

// Start "Sign in with Google". ?hint=<email> goes straight to that account;
// ?next=<path> is where to land afterwards.
export async function GET(req: Request) {
  if (!AUTH_ENABLED) return NextResponse.json({ error: "Sign-in isn't configured" }, { status: 503 });
  const url = new URL(req.url);
  const hint = url.searchParams.get("hint") ?? undefined;
  const next = url.searchParams.get("next") ?? "/drive";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/drive";
  return NextResponse.redirect(await beginOAuth(requestOrigin(req), { kind: "signin", next: safeNext }, { hint }));
}
