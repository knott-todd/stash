import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { listDevices, publicDevice } from "@/lib/devices";
import { store } from "@/lib/store";

// Every linked device, with what it has sent so far.
export async function GET() {
  const s = await getSession();
  if (!s) return unauthorized();
  const [devices, files] = await Promise.all([listDevices(s.uid), store().filesFor(s.uid)]);
  const byDevice = new Map<string, { files: number; bytes: number }>();
  for (const f of files) {
    if (!f.deviceId) continue;
    const e = byDevice.get(f.deviceId) ?? { files: 0, bytes: 0 };
    e.files++;
    e.bytes += f.size;
    byDevice.set(f.deviceId, e);
  }
  const phoneFiles = files.filter((f) => f.source === "phone").length;
  return NextResponse.json({ devices: devices.map((d) => publicDevice(d, byDevice.get(d.id) ?? { files: 0, bytes: 0 })), phoneFiles });
}
