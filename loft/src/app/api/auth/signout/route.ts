import { NextResponse } from "next/server";
import { endAllSessions, endSession, getSession } from "@/lib/session";

// Sign out: the session is gone from the server and the browser. The browser
// drops the key and its local copies itself. Files stay in the account.
// ?all=1 ends every browser session of the account (a lost laptop, a shared PC), from a
// browser or a linked device; devices keep their own access and are unlinked on Devices.
export async function POST(req: Request) {
  const all = new URL(req.url).searchParams.get("all") === "1";
  const s = await getSession();
  if (all && s) {
    const n = await endAllSessions(s.uid);
    return NextResponse.json({ ok: true, ended: n });
  }
  if (s?.deviceId) return NextResponse.json({ ok: true }); // a device signs out by unlinking itself
  await endSession();
  return NextResponse.json({ ok: true });
}
