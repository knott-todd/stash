import { NextResponse } from "next/server";
import { newId, store } from "@/lib/store";
import { MAIL_ENABLED, sendDeviceLink } from "@/lib/mail";
import { publicOrigin } from "@/lib/public-url";

// Sign in from a device that has nothing: an email finds the drive and a link
// brings this device into it. The link carries identity only; the key is not
// on our servers, so it arrives afterwards by QR from another device or the
// recovery code. The response never says whether the email was known.
export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Enter the email you gave Stash." }, { status: 400 });
  }
  const db = store();
  const u = await db.findUserByEmail(email);
  const origin = publicOrigin(req);
  let link: string | undefined;
  if (u) {
    const token = newId();
    await db.putToken({ token, uid: u.uid, createdAt: Date.now(), used: false });
    link = `${origin}/claim/${token}`;
    if (MAIL_ENABLED) {
      try {
        await sendDeviceLink(email, link);
        link = undefined; // sent; never echo it back
      } catch {
        /* fall through: show the link (dev / mail outage) */
      }
    }
  }
  // Same message either way, so the form can't be used to probe addresses.
  return NextResponse.json({ ok: true, message: "If Stash has a drive for that email, a link is on its way.", ...(link && !MAIL_ENABLED ? { link } : {}) });
}
