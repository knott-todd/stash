import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUid } from "@/lib/session";
import { db, newId } from "@/lib/store";

// Device pairing. POST mints a one-time token for this device's drive; GET with
// ?t= makes the calling browser adopt that drive. The encryption key never comes
// here: the client puts it in the URL fragment, which the browser keeps to itself.

export async function POST(req: Request) {
  const uid = await getUid();
  db.user(uid);
  const { email } = await req.json().catch(() => ({}));
  const token = newId();
  db.get().tokens[token] = { token, uid, createdAt: Date.now(), used: false };
  if (typeof email === "string" && email.includes("@")) db.user(uid).email = email;
  db.save();
  return NextResponse.json({ token });
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
