import { NextResponse } from "next/server";
import { endSession } from "@/lib/session";

// Sign out: the session is gone from the server and the browser. The browser
// drops the key and its local copies itself. Files stay in the account.
export async function POST() {
  await endSession();
  return NextResponse.json({ ok: true });
}
