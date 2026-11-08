import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { store } from "@/lib/store";
import { exchangeCode } from "@/lib/google";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const uid = await getUid();
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");
  // Send the user back to the address they came in through (tunnel, domain or localhost),
  // not the server's internal origin.
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? url.host;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  if (denied || !code || state !== uid) {
    return NextResponse.redirect(`${origin}/drive?google=denied`);
  }
  try {
    const t = await exchangeCode(origin, code);
    const db = store();
    const u = await db.getUser(uid);
    u.google = {
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? u.google?.refreshToken,
      expiresAt: Date.now() + t.expires_in * 1000,
    };
    await db.saveUser(u);
    return NextResponse.redirect(`${origin}/drive?google=ok`);
  } catch {
    return NextResponse.redirect(`${origin}/drive?google=failed`);
  }
}
