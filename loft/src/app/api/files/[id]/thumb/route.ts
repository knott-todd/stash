import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { store } from "@/lib/store";
import { objectStream, putFile, StorageBusy } from "@/lib/telegram";
import { busy } from "@/lib/files-api";
import { bumpRev } from "@/lib/rev";
import { limit } from "@/lib/ratelimit";

// The encrypted preview; the browser decrypts it like a one-piece file.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return unauthorized();
  const { id } = await params;
  const f = await store().getFile(s.uid, id);
  if (!f?.thumb) return NextResponse.json({ error: "no preview" }, { status: 404 });
  const stream = await objectStream(f.thumb);
  if (!stream) return NextResponse.json({ error: "no preview" }, { status: 404 });
  return new Response(stream, { headers: { "content-type": "application/octet-stream", "cache-control": "private, max-age=86400" } });
}

// Attach a preview made later (a grid view generating previews for older files).
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return unauthorized();
  const { id } = await params;
  const db = store();
  const f = await db.getFile(s.uid, id);
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  const hit = await limit("thumb", s.uid, 120, 60);
  if (hit) return hit;
  const form = await req.formData().catch(() => null);
  const t = form?.get("thumb");
  if (!(t instanceof File) || t.size === 0 || t.size > 512 * 1024) return NextResponse.json({ error: "bad preview" }, { status: 400 });
  try {
    const stored = await putFile(s.uid, `${id}.thumb`, `${f.name}.thumb.stash`, Buffer.from(await t.arrayBuffer()));
    f.thumb = { ...stored, size: t.size };
    await db.updateFile(f);
    await bumpRev(s.uid);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof StorageBusy) return busy(e);
    throw e;
  }
}
