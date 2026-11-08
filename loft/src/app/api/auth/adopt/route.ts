import { NextResponse } from "next/server";
import { clearLegacyCookie, getSession, unauthorized, updateSession } from "@/lib/session";
import { store } from "@/lib/store";

// One-time: a device that used Stash before accounts existed holds a drive and
// its key. On first sign-in, if the account is still empty, those files and that
// key become the account's. Otherwise the old drive is left where it is.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return unauthorized();
  const db = store();
  const { key } = await req.json().catch(() => ({}));
  let moved = 0;
  if (s.legacyUid && s.legacyUid !== s.uid) {
    const mine = await db.filesFor(s.uid);
    const theirs = await db.filesFor(s.legacyUid);
    if (mine.length === 0 && theirs.length > 0 && typeof key === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(key)) {
      moved = await db.moveFiles(s.legacyUid, s.uid);
      const u = await db.getUser(s.uid);
      u.key = key;
      await db.saveUser(u);
      await db.kvDelete(`glist:${s.legacyUid}`);
    }
  }
  await updateSession({ legacyUid: undefined });
  await clearLegacyCookie();
  return NextResponse.json({ ok: true, moved });
}
