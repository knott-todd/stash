import { NextResponse } from "next/server";
import fs from "node:fs";
import { getUid } from "@/lib/session";
import { db } from "@/lib/store";
import { deleteStored } from "@/lib/telegram";

// Rename / move (PATCH) and trash (DELETE) one file.

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUid();
  const { id } = await params;
  const f = db.get().files.find((x) => x.id === id && x.uid === uid);
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.name === "string" && body.name.trim()) f.name = body.name.trim().slice(0, 255);
  if (typeof body.folder === "string") f.folder = body.folder.replace(/^\/+|\/+$/g, "");
  db.save();
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUid();
  const { id } = await params;
  const d = db.get();
  const i = d.files.findIndex((x) => x.id === id && x.uid === uid);
  if (i < 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [f] = d.files.splice(i, 1);
  db.save();
  // Best effort: remove the bytes too. The index entry is already gone either way.
  if (f.blob) fs.rm(f.blob, { force: true }, () => {});
  if (f.tg) deleteStored(f.tg.messageId).catch(() => {});
  return NextResponse.json({ ok: true });
}
