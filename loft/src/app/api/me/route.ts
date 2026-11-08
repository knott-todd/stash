import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { db } from "@/lib/store";
import { DEMO } from "@/lib/telegram";
import { GOOGLE_ENABLED } from "@/lib/google";

export async function GET() {
  const uid = await getUid();
  const u = db.user(uid);
  const files = db.filesFor(uid);
  const bytes = files.reduce((n, f) => n + f.size, 0);
  return NextResponse.json({
    linked: true,
    email: u.email ?? null,
    demo: DEMO,
    google: GOOGLE_ENABLED,
    googleConnected: !!u.google,
    fileCount: files.length,
    bytes,
    photoBackup: u.photoBackup ?? null,
    migration: db.get().migrations[uid] ?? null,
  });
}

// Demo helper: wipe this device's data so the flow can be shown from scratch.
export async function DELETE() {
  const uid = await getUid();
  db.reset(uid);
  return NextResponse.json({ ok: true });
}
