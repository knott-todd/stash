import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { store } from "@/lib/store";
import { deleteObjects } from "@/lib/telegram";
import { bumpRev } from "@/lib/rev";

// Rename / move (PATCH) and trash (DELETE) one file.

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return unauthorized();
  const { id } = await params;
  const db = store();
  const f = await db.getFile(s.uid, id);
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.name === "string" && body.name.trim()) f.name = body.name.trim().slice(0, 255);
  if (typeof body.folder === "string") f.folder = body.folder.replace(/^\/+|\/+$/g, "");
  await db.updateFile(f);
  await bumpRev(s.uid);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return unauthorized();
  const { id } = await params;
  const f = await store().deleteFile(s.uid, id);
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Best effort: remove the bytes too. The index entry is already gone either way.
  deleteObjects(f).catch(() => {});
  await bumpRev(s.uid);
  return NextResponse.json({ ok: true });
}
