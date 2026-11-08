import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { newId, store } from "./store";

// Who is making this request. Identity is an account (Google sign-in); the
// browser holds only an opaque session id. Signing out deletes the session.

const SID = "stash_sid";
const LEGACY = "stash_uid"; // pre-account device identity; adopted into the account once
const YEAR = 60 * 60 * 24 * 365;

export type Session = { uid: string; createdAt: number; legacyUid?: string; deviceId?: string };

export const sessionKey = (sid: string) => `sess:${sid}`;

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
  const s = await store().kvGet<Session>(sessionKey(sid));
  return s ?? null;
}

// The signed-in account's id, or null. Routes answer 401 on null.
export async function getUid(): Promise<string | null> {
  return (await getSession())?.uid ?? null;
}

export function unauthorized() {
  return NextResponse.json({ error: "Sign in to continue.", signedIn: false }, { status: 401 });
}

// Start a session for an account. Remembers the device's pre-account drive, if
// any, so it can be folded into the account on first sight.
export async function startSession(uid: string) {
  const jar = await cookies();
  const sid = newId() + newId() + newId();
  const legacyUid = jar.get(LEGACY)?.value;
  const s: Session = { uid, createdAt: Date.now(), ...(legacyUid ? { legacyUid } : {}) };
  await store().kvSet(sessionKey(sid), s);
  jar.set(SID, sid, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: YEAR });
  return s;
}

export async function endSession() {
  const jar = await cookies();
  const sid = jar.get(SID)?.value;
  if (sid) await store().kvDelete(sessionKey(sid));
  jar.delete(SID);
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
