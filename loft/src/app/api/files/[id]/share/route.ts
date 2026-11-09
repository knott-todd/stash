import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession, unauthorized } from "@/lib/session";
import { store } from "@/lib/store";
import { requestOrigin } from "@/lib/public-url";
import { bumpRev } from "@/lib/rev";
import { limit } from "@/lib/ratelimit";

// A public link for one file, from a browser or a linked device. Only on Standard
// accounts: the server must be able to decrypt for a stranger's browser, and on a
// Locked account it cannot.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return unauthorized();
  const hit = await limit("share", s.uid, 60, 60);
  if (hit) return hit;
  const { id } = await params;
  const db = store();
  const [u, f] = await Promise.all([db.getUser(s.uid), db.getFile(s.uid, id)]);
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (u.protection === "passcode" || !u.key) return NextResponse.json({ error: "Links aren't available while your files are locked with a passcode: Stash can't open them for anyone." }, { status: 409 });
  if (!f.share) {
    f.share = { token: randomBytes(18).toString("base64url"), createdAt: Date.now() };
    await db.updateFile(f);
    await db.kvSet(`share:${f.share.token}`, { uid: s.uid, fileId: f.id });
    await bumpRev(s.uid);
  }
  return NextResponse.json({ url: `${requestOrigin(req)}/s/${f.share.token}`, createdAt: f.share.createdAt });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return unauthorized();
  const { id } = await params;
  const db = store();
  const f = await db.getFile(s.uid, id);
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (f.share) {
    await db.kvDelete(`share:${f.share.token}`);
    delete f.share;
    await db.updateFile(f);
    await bumpRev(s.uid);
  }
  return NextResponse.json({ ok: true });
}
