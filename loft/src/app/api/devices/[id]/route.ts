import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { getDevice, revokeDevice, saveDevice } from "@/lib/devices";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return unauthorized();
  const { id } = await params;
  const d = await getDevice(s.uid, id);
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.name === "string" && body.name.trim()) d.name = body.name.trim().slice(0, 60);
  await saveDevice(d);
  return NextResponse.json({ ok: true });
}

// Unlink: the device's token stops working at once. Files it sent stay.
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return unauthorized();
  const { id } = await params;
  const ok = await revokeDevice(s.uid, id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not found" }, { status: 404 });
}
