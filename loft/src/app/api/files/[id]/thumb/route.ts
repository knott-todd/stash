import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { store } from "@/lib/store";
import { objectStream } from "@/lib/telegram";

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
  const body = await req.json().catch(() => ({}));
  const t = body.thumb;
  if (!t || typeof t.size !== "number" || !(t.tg?.fileId || typeof t.blob === "string")) return NextResponse.json({ error: "bad preview" }, { status: 400 });
  f.thumb = t;
  await db.updateFile(f);
  return NextResponse.json({ ok: true });
}
