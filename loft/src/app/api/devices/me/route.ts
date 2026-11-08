import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { getDevice, saveDevice, type DeviceState } from "@/lib/devices";

const STATUSES = ["idle", "scanning", "uploading", "paused", "error"] as const;

// The device reports what it is doing: which folders, how far along, any trouble.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s?.deviceId) return unauthorized();
  const d = await getDevice(s.uid, s.deviceId);
  if (!d) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as Partial<DeviceState>;
  const folders = Array.isArray(body.folders)
    ? body.folders.slice(0, 50).map((f) => ({
        path: String(f.path ?? "").slice(0, 500),
        label: String(f.label ?? "").slice(0, 100),
        files: Number(f.files) || 0,
        bytes: Number(f.bytes) || 0,
        pending: Number(f.pending) || 0,
        failed: Number(f.failed) || 0,
        ...(f.lastUpload ? { lastUpload: Number(f.lastUpload) } : {}),
      }))
    : (d.state?.folders ?? []);
  const status = STATUSES.find((x) => x === body.status) ?? "idle";
  d.state = {
    status,
    detail: typeof body.detail === "string" ? body.detail.slice(0, 200) : undefined,
    folders,
    version: typeof body.version === "string" ? body.version.slice(0, 20) : d.state?.version,
    updatedAt: Date.now(),
  };
  d.lastSeen = Date.now();
  await saveDevice(d);
  return NextResponse.json({ ok: true, name: d.name });
}

export async function GET() {
  const s = await getSession();
  if (!s?.deviceId) return unauthorized();
  const d = await getDevice(s.uid, s.deviceId);
  if (!d) return unauthorized();
  return NextResponse.json({ id: d.id, name: d.name, platform: d.platform, kind: d.kind, state: d.state ?? null });
}
