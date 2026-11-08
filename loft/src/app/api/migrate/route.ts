import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { db, newId } from "@/lib/store";
import { GDRIVE_BYTES, GDRIVE_TOTAL, gdriveFiles } from "@/lib/demo-data";

// Simulated Google Drive migration. Timeline from startedAt:
//   0–2.5 s  scanning (we "find" the files)
//   2.5–20 s copying, files materialise progressively
// Real adapter would list via Drive API and stream each file through putFile().
const SCAN_MS = 2500;
const COPY_MS = 17500;

export async function POST() {
  const uid = await getUid();
  const d = db.get();
  if (!d.migrations[uid]) {
    d.migrations[uid] = {
      uid,
      provider: "google-drive",
      startedAt: Date.now(),
      total: GDRIVE_TOTAL,
      bytes: GDRIVE_BYTES,
      copied: 0,
      done: false,
    };
    db.save();
  }
  return NextResponse.json(status(uid));
}

export async function GET() {
  const uid = await getUid();
  return NextResponse.json(status(uid));
}

function status(uid: string) {
  const d = db.get();
  const m = d.migrations[uid];
  if (!m) return { phase: "idle" as const };
  const t = Date.now() - m.startedAt;
  if (t < SCAN_MS) return { phase: "scanning" as const, total: m.total, bytes: m.bytes };

  // How many of the representative files should exist by now.
  const frac = Math.min(1, (t - SCAN_MS) / COPY_MS);
  const target = Math.floor(frac * gdriveFiles.length);
  while (m.copied < target) {
    const g = gdriveFiles[m.copied];
    db.addFile({
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
  }
  if (frac >= 1 && !m.done) {
    m.done = true;
    db.save();
  }
  return {
    phase: m.done ? ("done" as const) : ("copying" as const),
    total: m.total,
    bytes: m.bytes,
    copiedCount: Math.floor(frac * m.total),
    copiedBytes: Math.floor(frac * m.bytes),
    percent: Math.round(frac * 100),
  };
}
