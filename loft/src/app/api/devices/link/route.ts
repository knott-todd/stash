import { NextResponse } from "next/server";
import { collectLink, startLink } from "@/lib/devices";
import { requestOrigin } from "@/lib/public-url";

// A device asks to be linked: it gets a code to show, and polls until the
// signed-in browser approves it at /devices/link?code=.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "A device";
  const platform = typeof body.platform === "string" ? body.platform : "unknown";
  const kind = body.kind === "phone" ? "phone" : "desktop";
  const l = await startLink(name, platform, kind);
  return NextResponse.json({ ...l, url: `${requestOrigin(req)}/devices/link?code=${l.code}`, expiresInSeconds: 15 * 60 });
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("id") ?? "";
  const secret = u.searchParams.get("secret") ?? "";
  if (!id || !secret) return NextResponse.json({ error: "id and secret required" }, { status: 400 });
  return NextResponse.json(await collectLink(id, secret));
}
