import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { store } from "@/lib/store";
import { DEMO, STAGED_MAX_BYTES } from "@/lib/telegram";
import { GOOGLE_ENABLED } from "@/lib/google";

export async function GET(req: Request) {
  // Names only, never values: which settings the running server can see.
  if (new URL(req.url).searchParams.get("diag") === "1") {
    const names = Object.keys(process.env).filter((k) => /^(TELEGRAM|BLOB|STASH|SMTP|MAIL|GOOGLE|DATABASE|PUBLIC|VERCEL_ENV|NODE_ENV)/.test(k)).sort();
    const present = Object.fromEntries(names.map((k) => [k, (process.env[k] ?? "").length > 0 ? "set" : "empty"]));
    // Which database host (first label only) and whether the value was pasted with quotes.
    const raw = process.env.DATABASE_URL ?? "";
    let dbHost = "unset";
    try { dbHost = raw ? new URL(raw.replace(/^"|"$/g, "")).host.split(".")[0] : "unset"; } catch { dbHost = "unparseable"; }
    return NextResponse.json({ present, demo: DEMO, blobUploads: !!process.env.BLOB_READ_WRITE_TOKEN, dbHost, dbQuoted: /^".*"$/.test(raw) });
  }
  const uid = await getUid();
  const db = store();
  const [u, files, migration] = await Promise.all([db.getUser(uid), db.filesFor(uid), db.getMigration(uid)]);
  const bytes = files.reduce((n, f) => n + f.size, 0);
  return NextResponse.json({
    linked: true,
    email: u.email ?? null,
    demo: DEMO,
    google: GOOGLE_ENABLED,
    // How the browser should send files: staged through the blob store on serverless hosts.
    blobUploads: !!process.env.BLOB_READ_WRITE_TOKEN,
    maxBytes: process.env.BLOB_READ_WRITE_TOKEN ? STAGED_MAX_BYTES : 50 * 1024 * 1024,
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
