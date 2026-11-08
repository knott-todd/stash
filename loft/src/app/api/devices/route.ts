import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { listDevices, publicDevice } from "@/lib/devices";
import { store } from "@/lib/store";

// Every linked device, with what it has sent so far.
export async function GET() {
  const s = await getSession();
  if (!s) return unauthorized();
  // Counts come from an aggregate, never from reading every row.
  const [devices, stats] = await Promise.all([listDevices(s.uid), store().fileStats(s.uid)]);
  return NextResponse.json({ devices: devices.map((d) => publicDevice(d, stats.byDevice[d.id] ?? { files: 0, bytes: 0 })), phoneFiles: stats.bySource.phone ?? 0 });
}
