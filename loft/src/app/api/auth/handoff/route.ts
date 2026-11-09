import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession, unauthorized } from "@/lib/session";
import { store } from "@/lib/store";
import { limit } from "@/lib/ratelimit";

// The phone app holds a device token, but a browser tab it opens (Google's consent page
// for the Drive import) cannot carry it. A handoff code is a one-time, five-minute stand-in
// for that token: the app asks for one, puts it in the URL it opens, and the auth route
// turns it back into the account. Used only to start the Drive connection.
export const HANDOFF_TTL_MS = 5 * 60 * 1000;
export const handoffKey = (code: string) => `handoff:${code}`;

export async function POST() {
  const s = await getSession();
  if (!s?.deviceId) return unauthorized();
  const hit = await limit("handoff", s.uid, 20, 600);
  if (hit) return hit;
  const code = randomBytes(18).toString("base64url");
  await store().kvSet(handoffKey(code), { uid: s.uid, createdAt: Date.now() });
  return NextResponse.json({ code, expiresInSeconds: HANDOFF_TTL_MS / 1000 });
}
