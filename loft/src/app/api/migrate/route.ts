import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { newId, store } from "@/lib/store";
import { GDRIVE_BYTES, GDRIVE_TOTAL, gdriveFiles } from "@/lib/demo-data";

// Simulated Google Drive migration, used only when Google isn't configured.
//   0–2.5 s  scanning (we "find" the files)
//   2.5–20 s copying, files materialise progressively
const SCAN_MS = 2500;
const COPY_MS = 17500;

export async function POST() {
  const uid = await getUid();
  const db = store();
  if (!(await db.getMigration(uid))) {
    await db.putMigration({
      uid,
      provider: "google-drive",
      startedAt: Date.now(),
      total: GDRIVE_TOTAL,
      bytes: GDRIVE_BYTES,
      copied: 0,
      done: false,
    });
  }
  return NextResponse.json(await status(uid));
}

export async function GET() {
  const uid = await getUid();
  return NextResponse.json(await status(uid));
}

async function status(uid: string) {
  const db = store();
  const m = await db.getMigration(uid);
  if (!m) return { phase: "idle" as const };
  const t = Date.now() - m.startedAt;
  if (t < SCAN_MS) return { phase: "scanning" as const, total: m.total, bytes: m.bytes };

  // How many of the representative files should exist by now.
  const frac = Math.min(1, (t - SCAN_MS) / COPY_MS);
  const target = Math.floor(frac * gdriveFiles.length);
  let changed = false;
  while (m.copied < target) {
    const g = gdriveFiles[m.copied];
    await db.addFile({
      id: newId(),
      uid,
      name: g.name,
      size: g.size,
      mime: g.mime,
      folder: g.folder,
      source: "google-drive",
      createdAt: Date.now(),
    });
    m.copied++;
    changed = true;
  }
  if (frac >= 1 && !m.done) {
    m.done = true;
    changed = true;
  }
  if (changed) await db.putMigration(m);
  return {
    phase: m.done ? ("done" as const) : ("copying" as const),
    total: m.total,
    bytes: m.bytes,
    copiedCount: Math.floor(frac * m.total),
    copiedBytes: Math.floor(frac * m.bytes),
    percent: Math.round(frac * 100),
  };
}
