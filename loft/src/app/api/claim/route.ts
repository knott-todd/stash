import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUid } from "@/lib/session";
import { db, newId } from "@/lib/store";
import { MAIL_ENABLED, sendDeviceLink } from "@/lib/mail";

// Device pairing. POST mints a one-time token for this device's drive and, with an
// email and mail configured, sends the link. GET with ?t= makes the calling browser
// adopt that drive. The encryption key never comes here: a QR carries it in the URL
// fragment; an email link relies on the recovery code entered on the new device.

export async function POST(req: Request) {
  const uid = await getUid();
  db.user(uid);
  const { email } = await req.json().catch(() => ({}));
  const token = newId();
  db.get().tokens[token] = { token, uid, createdAt: Date.now(), used: false };
  const hasEmail = typeof email === "string" && email.includes("@");
  if (hasEmail) db.user(uid).email = email;
  db.save();

  if (hasEmail && MAIL_ENABLED) {
    const h = req.headers;
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    try {
      await sendDeviceLink(email, `${proto}://${host}/claim/${token}`);
      return NextResponse.json({ token, sent: true });
    } catch (e) {
      return NextResponse.json({ token, sent: false, error: "Couldn't send the email. Here's the link instead." });
    }
  }
  return NextResponse.json({ token, sent: false });
}

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const tok = db.get().tokens[t];
  if (!tok || Date.now() - tok.createdAt > 1000 * 60 * 60 * 24) {
    return NextResponse.json({ ok: false, error: "This link has expired. Ask for a new one from the drive." }, { status: 400 });
  }
  const jar = await cookies();
  jar.set("loft_uid", tok.uid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return NextResponse.json({ ok: true });
}
