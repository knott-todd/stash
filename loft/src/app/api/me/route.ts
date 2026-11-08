import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { store } from "@/lib/store";
import { DEMO } from "@/lib/telegram";
import { GOOGLE_ENABLED } from "@/lib/google";

export async function GET() {
  const uid = await getUid();
  const db = store();
  const [u, files, migration] = await Promise.all([db.getUser(uid), db.filesFor(uid), db.getMigration(uid)]);
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
    migration: migration ?? null,
  });
}

// Start fresh: forget this device's drive entirely.
export async function DELETE() {
  const uid = await getUid();
  await store().reset(uid);
  return NextResponse.json({ ok: true });
}
