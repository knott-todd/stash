import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { authUrl, GOOGLE_ENABLED } from "@/lib/google";

function originOf(req: Request) {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  if (!GOOGLE_ENABLED) return NextResponse.json({ error: "Google isn't configured" }, { status: 503 });
  const uid = await getUid();
  return NextResponse.redirect(authUrl(originOf(req), uid));
}
