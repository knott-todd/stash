import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { newId, store } from "./store";

// Who is making this request. Identity is an account (Google sign-in); the
// browser holds only an opaque session id. Sessions end after 30 days unused,
// a new one is minted at every sign-in, and every session of an account can be
// ended at once ("sign out everywhere").

const SID = "stash_sid";
const LEGACY = "stash_uid"; // pre-account device identity; adopted into the account once
export const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_MS = 60 * 60 * 1000; // write lastSeen at most hourly

export type Session = { uid: string; createdAt: number; lastSeen?: number; legacyUid?: string; deviceId?: string };

export const sessionKey = (sid: string) => `sess:${sid}`;
const listKey = (uid: string) => `sessions:${uid}`;

export async function getSession(): Promise<Session | null> {
  // A linked device (Stash Desktop, the phone app) sends its token instead of a cookie.
  const auth = (await headers()).get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const { deviceForToken } = await import("./devices");
    const d = await deviceForToken(auth.slice(7).trim());
    return d ? { uid: d.uid, createdAt: d.createdAt, deviceId: d.id } : null;
  }
  const jar = await cookies();
  const sid = jar.get(SID)?.value;
  if (!sid) return null;
  const db = store();
  const s = await db.kvGet<Session>(sessionKey(sid));
  if (!s) return null;
  const seen = s.lastSeen ?? s.createdAt;
  if (Date.now() - seen > SESSION_IDLE_MS) {
    await forget(s.uid, sid);
    return null;
  }
  if (Date.now() - seen > TOUCH_MS) db.kvSet(sessionKey(sid), { ...s, lastSeen: Date.now() }).catch(() => {});
  return s;
}

// The signed-in account's id, or null. Routes answer 401 on null.
export async function getUid(): Promise<string | null> {
  return (await getSession())?.uid ?? null;
}

export function unauthorized() {
  return NextResponse.json({ error: "Sign in to continue.", signedIn: false }, { status: 401 });
}

// Start a session for an account: a fresh id every time (the old one, if any, is
// ended). Remembers the device's pre-account drive so it can be folded in once.
export async function startSession(uid: string) {
  const jar = await cookies();
  const old = jar.get(SID)?.value;
  if (old) {
    const prev = await store().kvGet<Session>(sessionKey(old));
    if (prev) await forget(prev.uid, old);
  }
  const sid = newId() + newId() + newId();
  const legacyUid = jar.get(LEGACY)?.value;
  const s: Session = { uid, createdAt: Date.now(), lastSeen: Date.now(), ...(legacyUid ? { legacyUid } : {}) };
  const db = store();
  await db.kvSet(sessionKey(sid), s);
  const list = (await db.kvGet<string[]>(listKey(uid))) ?? [];
  await db.kvSet(listKey(uid), [...list.filter((x) => x !== sid), sid].slice(-50));
  jar.set(SID, sid, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_IDLE_MS / 1000 });
  return s;
}

async function forget(uid: string, sid: string) {
  const db = store();
  await db.kvDelete(sessionKey(sid));
  const list = (await db.kvGet<string[]>(listKey(uid))) ?? [];
  if (list.includes(sid)) await db.kvSet(listKey(uid), list.filter((x) => x !== sid));
}

export async function endSession() {
  const jar = await cookies();
  const sid = jar.get(SID)?.value;
  if (sid) {
    const s = await store().kvGet<Session>(sessionKey(sid));
    if (s) await forget(s.uid, sid);
    else await store().kvDelete(sessionKey(sid));
  }
  jar.delete(SID);
}

// Every browser session of this account, including this one.
export async function endAllSessions(uid: string) {
  const db = store();
  const list = (await db.kvGet<string[]>(listKey(uid))) ?? [];
  await Promise.all(list.map((sid) => db.kvDelete(sessionKey(sid))));
  await db.kvDelete(listKey(uid));
  (await cookies()).delete(SID);
  return list.length;
}

export async function updateSession(patch: Partial<Session>) {
  const jar = await cookies();
  const sid = jar.get(SID)?.value;
  if (!sid) return;
  const s = await store().kvGet<Session>(sessionKey(sid));
  if (s) await store().kvSet(sessionKey(sid), { ...s, ...patch });
}

export async function clearLegacyCookie() {
  (await cookies()).delete(LEGACY);
}

// Sessions nobody has used for 30 days.
export async function sweepSessions(now = Date.now()) {
  const db = store();
  const rows = await db.kvList("sess:");
  let n = 0;
  for (const r of rows) {
    const s = r.value as Session;
    if (now - (s.lastSeen ?? s.createdAt) > SESSION_IDLE_MS) {
      await forget(s.uid, r.key.slice("sess:".length));
      n++;
    }
  }
  return n;
}
