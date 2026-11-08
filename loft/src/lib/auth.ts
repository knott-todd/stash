import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { exchangeCode, GOOGLE_ENABLED, googleAuthUrl } from "./google";
import { store, type User } from "./store";
import { startSession } from "./session";

// Sign in with Google. Google only tells us who the person is (OpenID: id,
// email, name, picture); nothing about their Drive. The account's file key is
// made here on first sign-in and kept on the account, so any device that signs
// in can open the files and signing out leaves nothing behind.

export const AUTH_ENABLED = GOOGLE_ENABLED;
const SIGNIN_SCOPE = "openid email profile";
const STATE_COOKIE = "stash_oauth";

export type OAuthState = { kind: "signin" | "drive"; nonce: string; next?: string; uid?: string };

// One short-lived cookie carries what the callback needs to trust the response.
export async function beginOAuth(origin: string, s: Omit<OAuthState, "nonce">, opts: { hint?: string; chooser?: boolean } = {}) {
  const state: OAuthState = { ...s, nonce: randomBytes(12).toString("base64url") };
  const jar = await cookies();
  jar.set(STATE_COOKIE, JSON.stringify(state), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  if (s.kind === "signin") {
    return googleAuthUrl(origin, state.nonce, {
      scope: SIGNIN_SCOPE,
      // A remembered account skips the chooser; otherwise Google shows it.
      prompt: opts.hint ? undefined : "select_account",
      loginHint: opts.hint,
      offline: false,
    });
  }
  // Drive access for the migration: the signed-in account is pre-selected, so Google
  // only asks for the Drive permission. "Use a different Google account" forces the chooser.
  return googleAuthUrl(origin, state.nonce, { offline: true, prompt: opts.chooser ? "select_account consent" : "consent", loginHint: opts.chooser ? undefined : opts.hint });
}

export async function takeOAuthState(nonce: string | null): Promise<OAuthState | null> {
  const jar = await cookies();
  const raw = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  if (!raw || !nonce) return null;
  try {
    const s = JSON.parse(raw) as OAuthState;
    return s.nonce === nonce ? s : null;
  } catch {
    return null;
  }
}

type Identity = { sub: string; email: string; name?: string; picture?: string };

// Ask Google who the token belongs to, rather than trusting the token's own claims.
async function identityFromIdToken(idToken: string): Promise<Identity> {
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  const j = await r.json();
  if (!r.ok || j.aud !== process.env.GOOGLE_CLIENT_ID || !j.sub || !j.email) throw new Error("bad id token");
  return { sub: j.sub, email: j.email, name: j.name, picture: j.picture };
}

export const newFileKey = () => randomBytes(16).toString("base64url"); // AES-128-GCM

export async function completeSignIn(origin: string, code: string): Promise<User> {
  const t = await exchangeCode(origin, code);
  if (!t.id_token) throw new Error("no id token");
  const who = await identityFromIdToken(t.id_token);
  const db = store();
  const uid = `g:${who.sub}`;
  const u = await db.getUser(uid);
  u.email = who.email;
  u.name = who.name;
  u.picture = who.picture;
  u.key ??= newFileKey();
  await db.saveUser(u);
  await startSession(uid);
  return u;
}
