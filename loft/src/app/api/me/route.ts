import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { store } from "@/lib/store";
import { DEMO } from "@/lib/telegram";
import { MAX_BYTES } from "@/lib/files-limits";
import { GOOGLE_ENABLED } from "@/lib/google";
import { connected as providersConnected, PROVIDERS } from "@/lib/providers";
import { AUTH_ENABLED, newFileKey } from "@/lib/auth";
import { STAGE } from "@/lib/stage";
import { after } from "next/server";
import { allRecords, FAKE_DRIVE, kick, needsKick } from "@/lib/copyjob";
import { requestOrigin } from "@/lib/public-url";

export async function GET(req: Request) {
  // Names only, never values: which settings the running server can see.
  if (new URL(req.url).searchParams.get("diag") === "1") {
    const names = Object.keys(process.env)
      .filter((k) => /^(TELEGRAM|BLOB|STASH|SMTP|MAIL|GOOGLE|DATABASE|PUBLIC|NEXT_PUBLIC|VERCEL_ENV|NODE_ENV)/.test(k))
      .sort();
    const present = Object.fromEntries(names.map((k) => [k, (process.env[k] ?? "").length > 0 ? "set" : "empty"]));
    // Which database host (first label only) and whether the value was pasted with quotes.
    const raw = process.env.DATABASE_URL ?? "";
    let dbHost = "unset";
    try {
      dbHost = raw ? new URL(raw.replace(/^"|"$/g, "")).host.split(".")[0] : "unset";
    } catch {
      dbHost = "unparseable";
    }
    const quoted = raw.startsWith('"') && raw.endsWith('"');
    return NextResponse.json({ present, stage: STAGE, demo: DEMO, auth: AUTH_ENABLED, dbHost, dbQuoted: quoted });
  }
  const s = await getSession();
  if (!s) return NextResponse.json({ signedIn: false, auth: AUTH_ENABLED, demo: DEMO }, { status: 200 });
  const uid = s.uid;
  const db = store();
  const [u, stats, migration, copies] = await Promise.all([db.getUser(uid), db.fileStats(uid), db.getMigration(uid), allRecords(uid)]);
  // Every page load doubles as a watchdog for a server-side copy whose runs went quiet.
  const stale = copies.filter((c) => needsKick(c));
  if (stale.length) {
    const origin = requestOrigin(req);
    after(() => Promise.all(stale.map((c) => kick(origin, uid, c.provider))));
  }
  // A device from before accounts: how many files it holds, if the account is still empty.
  let legacy: { fileCount: number } | null = null;
  if (s.legacyUid && s.legacyUid !== uid && stats.count === 0) {
    legacy = { fileCount: (await db.fileStats(s.legacyUid)).count };
  }
  return NextResponse.json({
    signedIn: true,
    linked: true,
    email: u.email ?? null,
    name: u.name ?? null,
    picture: u.picture ?? null,
    // Standard: the key itself. Passcode: only the wrapped copy; the browser asks for the passcode.
    protection: u.protection ?? null,
    key: u.protection === "passcode" ? null : (u.key ?? null),
    keyWrapped: u.protection === "passcode" ? (u.keyWrapped ?? null) : null,
    legacy,
    demo: DEMO,
    google: GOOGLE_ENABLED,
    // Other drives: offered when the server has keys for them, connected once the user said yes.
    providers: {
      dropbox: { enabled: PROVIDERS.dropbox.enabled, connected: providersConnected(u).dropbox },
      onedrive: { enabled: PROVIDERS.onedrive.enabled, connected: providersConnected(u).onedrive },
    },
    maxBytes: MAX_BYTES,
    googleConnected: FAKE_DRIVE || !!u.google,
    fileCount: stats.count,
    bytes: stats.bytes,
    photoBackup: u.photoBackup ?? null,
    migration: migration ?? null,
    // Moves from other drives: one record each, kept on the server so any page and device sees it.
    copies,
  });
}

// Start fresh: forget every file and the key. The account itself stays.
export async function DELETE() {
  const s = await getSession();
  if (!s) return unauthorized();
  const db = store();
  await db.reset(s.uid);
  // A new key for whatever comes next, in standard keeping.
  const u = await db.getUser(s.uid);
  u.key = newFileKey();
  delete u.keyWrapped;
  u.protection = "standard";
  await db.saveUser(u);
  return NextResponse.json({ ok: true });
}
