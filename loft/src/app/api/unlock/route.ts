import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUid } from "@/lib/session";
import { newId, store } from "@/lib/store";

// Device approval relay. The "asker" (a device with no key, maybe no drive yet)
// posts a one-time public key and shows a code. The "approver" (a device that
// holds the key) scans it, seals the key to that public key and posts the
// ciphertext. When the asker collects it, it also becomes a member of the
// approver's drive. The server stores the public key and ciphertext only; it
// cannot open either. Requests live 10 minutes and are collected once.

type Req = { askerUid: string; askerPub: string; createdAt: number; answer?: { approverUid: string; approverPub: string; iv: string; ct: string } };
const TTL = 10 * 60 * 1000;
const key = (id: string) => `unlock:${id}`;

export async function POST(req: Request) {
  const uid = await getUid();
  const body = await req.json().catch(() => ({}));
  const db = store();

  if (body.action === "ask") {
    if (typeof body.askerPub !== "string" || body.askerPub.length > 400) return NextResponse.json({ error: "bad key" }, { status: 400 });
    const id = newId() + newId();
    await db.kvSet(key(id), { askerUid: uid, askerPub: body.askerPub, createdAt: Date.now() } satisfies Req);
    return NextResponse.json({ id });
  }

  if (body.action === "answer") {
    const r = await db.kvGet<Req>(key(String(body.id)));
    if (!r || Date.now() - r.createdAt > TTL) return NextResponse.json({ error: "This code has expired. Start again on the other device." }, { status: 410 });
    // A device that already has a drive with files can only be unlocked by that same drive;
    // a fresh device (sign-in) may be handed any drive by the device that approves it.
    if (r.askerUid !== uid) {
      const existing = await db.filesFor(r.askerUid);
      if (existing.length > 0) return NextResponse.json({ error: "That code belongs to a different drive." }, { status: 403 });
    }
    const { approverPub, iv, ct } = body;
    if ([approverPub, iv, ct].some((v) => typeof v !== "string" || v.length > 2000)) return NextResponse.json({ error: "bad answer" }, { status: 400 });
    r.answer = { approverUid: uid, approverPub, iv, ct };
    await db.kvSet(key(String(body.id)), r);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

// The asker polls here. On answer it joins the approver's drive and the request is deleted.
export async function GET(req: Request) {
  const uid = await getUid();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const db = store();
  const r = await db.kvGet<Req>(key(id));
  if (!r || r.askerUid !== uid) return NextResponse.json({ state: "gone" });
  if (Date.now() - r.createdAt > TTL) {
    await db.kvDelete(key(id));
    return NextResponse.json({ state: "expired" });
  }
  if (!r.answer) return NextResponse.json({ state: "waiting" });
  await db.kvDelete(key(id));
  if (r.answer.approverUid !== uid) {
    const jar = await cookies();
    jar.set("stash_uid", r.answer.approverUid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  const { approverPub, iv, ct } = r.answer;
  return NextResponse.json({ state: "answered", approverPub, iv, ct });
}
