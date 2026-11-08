import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { approveLink, peekLink } from "@/lib/devices";
import { store } from "@/lib/store";

// What is asking to be linked (GET) and the signed-in person's yes (POST).
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return unauthorized();
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const l = await peekLink(code);
  if (!l) return NextResponse.json({ error: "This code has expired. Start again on the device." }, { status: 404 });
  return NextResponse.json({ name: l.name, platform: l.platform, kind: l.kind, approved: !!l.approved });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.deviceId) return unauthorized();
  const { code } = await req.json().catch(() => ({}));
  if (typeof code !== "string") return NextResponse.json({ error: "code required" }, { status: 400 });
  const u = await store().getUser(s.uid);
  const d = await approveLink(code, s.uid, u.email ?? null);
  if (!d) return NextResponse.json({ error: "This code has expired. Start again on the device." }, { status: 404 });
  return NextResponse.json({ ok: true, device: { id: d.id, name: d.name } });
}
