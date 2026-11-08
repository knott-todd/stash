import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { newId, store } from "@/lib/store";
import { phonePhotos } from "@/lib/demo-data";

// Simulated camera-roll backup (demo mode only): ~0.4 s per photo, materialised on poll.
const PER_PHOTO_MS = 400;

export async function POST(req: Request) {
  const uid = await getUid();
  const db = store();
  const u = await db.getUser(uid);
  const body = await req.json().catch(() => ({}));
  if (body.action === "new-photo") {
    // "Took a new photo" → it backs up without any action from the user.
    u.photoBackup = u.photoBackup ?? { on: true, total: 0, startedAt: Date.now() };
    u.photoBackup.total += 1;
    await db.saveUser(u);
    return NextResponse.json(await status(uid));
  }
  if (!u.photoBackup) {
    u.photoBackup = { on: true, total: phonePhotos.length, startedAt: Date.now() };
    await db.saveUser(u);
  }
  return NextResponse.json(await status(uid));
}

export async function GET() {
  const uid = await getUid();
  return NextResponse.json(await status(uid));
}

async function status(uid: string) {
  const db = store();
  const u = await db.getUser(uid);
  const pb = u.photoBackup;
  if (!pb) return { on: false, total: 0, uploaded: 0 };
  const existing = (await db.filesFor(uid)).filter((f) => f.source === "phone");
  const target = Math.min(pb.total, Math.floor((Date.now() - pb.startedAt) / PER_PHOTO_MS));
  for (let i = existing.length; i < target; i++) {
    const p = phonePhotos[i % phonePhotos.length];
    await db.addFile({
      id: newId(),
      uid,
      name: i < phonePhotos.length ? p.name : `IMG_${5100 + i}.HEIC`,
      size: p.size,
      mime: "image/heic",
      folder: "Phone photos",
      source: "phone",
      createdAt: Date.now(),
    });
  }
  const uploaded = Math.max(existing.length, target);
  return { on: pb.on, total: pb.total, uploaded, done: uploaded >= pb.total };
}
