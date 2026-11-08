import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Forget this device: the drive and its files stay in storage; this browser just
// stops being linked to them. The client clears the key and local copies itself.
export async function POST() {
  const jar = await cookies();
  jar.set("loft_uid", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return NextResponse.json({ ok: true });
}
