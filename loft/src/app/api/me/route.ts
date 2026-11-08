import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { store } from "@/lib/store";
import { DEMO } from "@/lib/telegram";
import { MAX_BYTES } from "@/lib/files-limits";
import { GOOGLE_ENABLED } from "@/lib/google";
import { AUTH_ENABLED, newFileKey } from "@/lib/auth";

export async function GET(req: Request) {
  // Names only, never values: which settings the running server can see.
  if (new URL(req.url).searchParams.get("diag") === "1") {
    const names = Object.keys(process.env).filter((k) => /^(TELEGRAM|BLOB|STASH|SMTP|MAIL|GOOGLE|DATABASE|PUBLIC|VERCEL_ENV|NODE_ENV)/.test(k)).sort();
    const present = Object.fromEntries(names.map((k) => [k, (process.env[k] ?? "").length > 0 ? "set" : "empty"]));
    // Which database host (first label only) and whether the value was pasted with quotes.
    const raw = process.env.DATABASE_URL ?? "";
    let dbHost = "unset";
    try { dbHost = raw ? new URL(raw.replace(/^"|"$/g, "")).host.split(".")[0] : "unset"; } catch { dbHost = "unparseable"; }
    return NextResponse.json({ present, demo: DEMO, auth: AUTH_ENABLED, dbHost, dbQuoted: /^".*"$/.test(raw) });
  }
  const s = await getSession();
  if (!s) return NextResponse.json({ signedIn: false, auth: AUTH_ENABLED, demo: DEMO }, { status: 200 });
  const uid = s.uid;
  const db = store();
  const [u, files, migration] = await Promise.all([db.getUser(uid), db.filesFor(uid), db.getMigration(uid)]);
  const bytes = files.reduce((n, f) => n + f.size, 0);
  // A device from before accounts: how many files it holds, if the account is still empty.
  let legacy: { fileCount: number } | null = null;
  if (s.legacyUid && s.legacyUid !== uid && files.length === 0) {
    const n = (await db.filesFor(s.legacyUid)).length;
    legacy = { fileCount: n };
  }
  return NextResponse.json({
    signedIn: true,
    linked: true,
    email: u.email ?? null,
    name: u.name ?? null,
    picture: u.picture ?? null,
    key: u.key ?? null,
    legacy,
    demo: DEMO,
    google: GOOGLE_ENABLED,
    maxBytes: MAX_BYTES,
    googleConnected: !!u.google,
    fileCount: files.length,
    bytes,
    photoBackup: u.photoBackup ?? null,
    migration: migration ?? null,
  });
}

// Start fresh: forget every file and the key. The account itself stays.
export async function DELETE() {
  const s = await getSession();
  if (!s) return unauthorized();
  const db = store();
  await db.reset(s.uid);
  // A new key for whatever comes next.
  const u = await db.getUser(s.uid);
  u.key = newFileKey();
  await db.saveUser(u);
  return NextResponse.json({ ok: true });
}
