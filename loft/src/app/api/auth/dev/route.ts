import { NextResponse } from "next/server";
import { newFileKey } from "@/lib/auth";
import { startSession } from "@/lib/session";
import { store } from "@/lib/store";

// Local testing only: a session without Google. Refused unless STASH_DEV_SIGNIN
// is set, and never on Vercel.
export async function POST(req: Request) {
  if (!process.env.STASH_DEV_SIGNIN || process.env.VERCEL) return NextResponse.json({ error: "not here" }, { status: 404 });
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !email.includes("@")) return NextResponse.json({ error: "email required" }, { status: 400 });
  const db = store();
  const uid = `dev:${email.toLowerCase()}`;
  const u = await db.getUser(uid);
  u.email = email;
  u.name = email.split("@")[0];
  u.key ??= newFileKey();
  await db.saveUser(u);
  await startSession(uid);
  return NextResponse.json({ ok: true, uid });
}
