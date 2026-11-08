import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { newId, store } from "@/lib/store";

// Device approval relay. A device that can list files but has no key (the
// "asker") posts a one-time public key; a device that has the key (the
// "approver", same drive) encrypts the key to it and posts the ciphertext;
// the asker collects it. The server stores only the public key and the
// ciphertext, which it cannot open. Requests live 10 minutes.

type Req = { uid: string; askerPub: string; createdAt: number; answer?: { approverPub: string; iv: string; ct: string } };
const TTL = 10 * 60 * 1000;
const key = (id: string) => `unlock:${id}`;

export async function POST(req: Request) {
  const uid = await getUid();
  const body = await req.json().catch(() => ({}));
  const db = store();

  if (body.action === "ask") {
    if (typeof body.askerPub !== "string" || body.askerPub.length > 400) return NextResponse.json({ error: "bad key" }, { status: 400 });
    const id = newId() + newId();
    await db.kvSet(key(id), { uid, askerPub: body.askerPub, createdAt: Date.now() } satisfies Req);
    return NextResponse.json({ id });
  }

  if (body.action === "answer") {
    const r = await db.kvGet<Req>(key(String(body.id)));
    if (!r || Date.now() - r.createdAt > TTL) return NextResponse.json({ error: "This code has expired. Start again on the other device." }, { status: 410 });
    // Only a device already on the same drive may approve.
    if (r.uid !== uid) return NextResponse.json({ error: "That code belongs to a different drive." }, { status: 403 });
    const { approverPub, iv, ct } = body;
    if ([approverPub, iv, ct].some((v) => typeof v !== "string" || v.length > 2000)) return NextResponse.json({ error: "bad answer" }, { status: 400 });
    r.answer = { approverPub, iv, ct };
    await db.kvSet(key(String(body.id)), r);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

// The asker polls here. Once the answer is collected the request is deleted.
export async function GET(req: Request) {
  const uid = await getUid();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const db = store();
  const r = await db.kvGet<Req>(key(id));
  if (!r || r.uid !== uid) return NextResponse.json({ state: "gone" });
  if (Date.now() - r.createdAt > TTL) {
    await db.kvDelete(key(id));
    return NextResponse.json({ state: "expired" });
  }
  if (!r.answer) return NextResponse.json({ state: "waiting" });
  await db.kvDelete(key(id));
  return NextResponse.json({ state: "answered", ...r.answer });
}
