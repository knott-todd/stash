import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUid } from "@/lib/session";
import { db, newId } from "@/lib/store";
import { MAIL_ENABLED, sendDeviceLink } from "@/lib/mail";
import { publicOrigin } from "@/lib/public-url";

// Device pairing. POST mints a one-time token for this device's drive and, with an
// email and mail configured, sends the link. GET with ?t= makes the calling browser
// adopt that drive. A QR carries the key in the URL fragment with no server involved.
// An email link also carries the key in the fragment: the key passes through here
// only to be written into the message, and is never stored or logged.

export async function POST(req: Request) {
  const uid = await getUid();
  db.user(uid);
  const { email, key } = await req.json().catch(() => ({}));
  const token = newId();
  db.get().tokens[token] = { token, uid, createdAt: Date.now(), used: false };
  const hasEmail = typeof email === "string" && email.includes("@");
  if (hasEmail) db.user(uid).email = email;
  db.save();

  const origin = publicOrigin(req);
  if (hasEmail && MAIL_ENABLED) {
    try {
      const fragment = typeof key === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(key) ? `#k=${key}` : "";
      await sendDeviceLink(email, `${origin}/claim/${token}${fragment}`);
      return NextResponse.json({ token, sent: true, origin });
    } catch {
      return NextResponse.json({ token, sent: false, origin, error: "Couldn't send the email. Here's the link instead." });
    }
  }
  return NextResponse.json({ token, sent: false, origin });
}

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const tok = db.get().tokens[t];
  const jar = await cookies();
  const already = jar.get("loft_uid")?.value === tok?.uid;
  // Single use and 24 h, except for the device that already adopted it (a refresh).
  if (!tok || Date.now() - tok.createdAt > 1000 * 60 * 60 * 24 || (tok.used && !already)) {
    return NextResponse.json({ ok: false, error: "This link has expired. Ask for a new one from the drive." }, { status: 400 });
  }
  tok.used = true;
  db.save();
  jar.set("loft_uid", tok.uid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return NextResponse.json({ ok: true });
}
