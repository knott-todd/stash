import { NextResponse } from "next/server";
import { identityFromIdToken, newFileKey } from "@/lib/auth";
import { createDevice } from "@/lib/devices";
import { store } from "@/lib/store";
import { clientIp, limit } from "@/lib/ratelimit";

// Native sign-in from the phone app: Google's account picker on the phone hands the app
// an identity token; we verify it with Google (audience = this app's web client id),
// find or create the account, and link the phone in the same step. No code, no browser.
export async function POST(req: Request) {
  const hit = await limit("auth", await clientIp(), 30, 60);
  if (hit) return hit;
  const body = await req.json().catch(() => ({}));
  if (typeof body.idToken !== "string" || body.idToken.length > 4096) return NextResponse.json({ error: "idToken required" }, { status: 400 });
  let who;
  try {
    who = await identityFromIdToken(body.idToken);
  } catch {
    return NextResponse.json({ error: "Google didn't accept that sign-in. Try again." }, { status: 401 });
  }
  const db = store();
  const uid = `g:${who.sub}`;
  const u = await db.getUser(uid);
  u.email = who.email;
  u.name = who.name;
  u.picture = who.picture;
  u.key ??= newFileKey();
  await db.saveUser(u);
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Phone";
  const platform = typeof body.platform === "string" ? body.platform : "phone";
  const { device, token } = await createDevice(uid, name, platform, "phone");
  return NextResponse.json({ token, deviceId: device.id, email: u.email ?? null, protection: u.protection ?? null });
}
