import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { CHUNK_CIPHER_BYTES, newId, store, type StashFile, type StoredPart } from "@/lib/store";
import { putFile, StorageBusy } from "@/lib/telegram";
import { busy, isPart, ONE_PIECE_MAX, pub } from "@/lib/files-api";

export async function GET() {
  const s = await getSession();
  if (!s) return unauthorized();
  const files = await store().filesFor(s.uid);
  return NextResponse.json({ files: files.map(pub) });
}

// Two shapes: multipart with the whole ciphertext in the body (small files), or
// JSON listing the pieces already stored through /api/files/part (large files).
export async function POST(req: Request) {
  try {
    return await upload(req);
  } catch (e) {
    if (e instanceof StorageBusy) return busy(e);
    throw e;
  }
}


async function upload(req: Request) {
  const s = await getSession();
  if (!s) return unauthorized();
  const uid = s.uid;
  const id = newId();
  let meta: Record<string, string>;
  let stored: Pick<StashFile, "tg" | "blob" | "parts" | "thumb">;

  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    meta = body;
    const parts = body.parts;
    if (!Array.isArray(parts) || !parts.length || !parts.every(isPart)) return NextResponse.json({ error: "no pieces" }, { status: 400 });
    // Every piece but the last must be the standard size, or no reader can split the stream.
    if (parts.slice(0, -1).some((p: StoredPart) => p.size !== CHUNK_CIPHER_BYTES)) return NextResponse.json({ error: "pieces must be the standard size" }, { status: 400 });
    stored = { parts, ...(isPart(body.thumb) ? { thumb: body.thumb } : {}) };
  } else {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
    if (file.size > ONE_PIECE_MAX * 1.2) return NextResponse.json({ error: "Send files over 4 MB in pieces." }, { status: 413 });
    meta = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string") as [string, string][]);
    meta.name ??= file.name;
    meta.size ??= String(file.size);
    const bytes = Buffer.from(await file.arrayBuffer());
    stored = await putFile(uid, id, meta.encrypted === "1" ? `${meta.name}.stash` : meta.name, bytes);
    const thumb = form.get("thumb");
    if (thumb instanceof File && thumb.size > 0 && thumb.size <= 512 * 1024) {
      const t = await putFile(uid, `${id}.thumb`, `${meta.name}.thumb.stash`, Buffer.from(await thumb.arrayBuffer()));
      stored.thumb = { ...t, size: thumb.size };
    }
  }

  const f: StashFile = {
    id,
    uid,
    name: String(meta.name).slice(0, 255),
    size: Number(meta.size ?? 0),
    mime: String(meta.mime ?? "application/octet-stream"),
    folder: String(meta.folder ?? "").replace(/^\/+|\/+$/g, ""),
    source: (["upload", "google-drive", "phone", "desktop"].includes(String(meta.source)) ? meta.source : "upload") as StashFile["source"],
    createdAt: Date.now(),
    ...(Number(meta.modifiedAt) > 0 ? { modifiedAt: Number(meta.modifiedAt) } : {}),
    ...(s.deviceId ? { deviceId: s.deviceId } : {}),
    encrypted: meta.encrypted === "1",
    ...stored,
  };
  await store().addFile(f);
  return NextResponse.json({ file: pub(f) });
}

// Move several files at once (drag to a folder, "Move to…").
export async function PATCH(req: Request) {
  const s = await getSession();
  if (!s) return unauthorized();
  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.ids) || typeof body.folder !== "string") return NextResponse.json({ error: "ids and folder required" }, { status: 400 });
  const folder = body.folder.replace(/^\/+|\/+$/g, "");
  const db = store();
  let moved = 0;
  for (const id of body.ids.slice(0, 500)) {
    const f = await db.getFile(s.uid, String(id));
    if (!f) continue;
    f.folder = folder;
    await db.updateFile(f);
    moved++;
  }
  return NextResponse.json({ ok: true, moved });
}

