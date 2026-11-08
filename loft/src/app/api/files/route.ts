import { NextResponse } from "next/server";
import { getUid, unauthorized } from "@/lib/session";
import { newId, store, type StashFile } from "@/lib/store";
import { putFile, putFileFromUrl, STAGED_MAX_BYTES, StorageBusy } from "@/lib/telegram";

export async function GET() {
  const uid = await getUid();
  if (!uid) return unauthorized();
  const files = await store().filesFor(uid);
  return NextResponse.json({ files: files.map(pub) });
}

// Two shapes: multipart with the ciphertext in the body, or JSON with a blobUrl
// the browser already staged (serverless hosts cap request bodies).
export async function POST(req: Request) {
  try {
    return await upload(req);
  } catch (e) {
    if (e instanceof StorageBusy) {
      const mins = Math.max(1, Math.ceil(e.retryAfterSeconds / 60));
      return NextResponse.json(
        { error: `Storage is busy right now. Try again in about ${mins} minute${mins > 1 ? "s" : ""}.`, retryAfter: e.retryAfterSeconds },
        { status: 503, headers: { "retry-after": String(e.retryAfterSeconds) } },
      );
    }
    throw e;
  }
}

async function upload(req: Request) {
  const uid = await getUid();
  if (!uid) return unauthorized();
  const id = newId();
  let meta: Record<string, string>;
  let stored: { tg?: StashFile["tg"]; blob?: string };

  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    meta = body;
    if (typeof body.blobUrl !== "string") return NextResponse.json({ error: "no file" }, { status: 400 });
    if (Number(body.size) > STAGED_MAX_BYTES) {
      return NextResponse.json({ error: `Files over ${Math.round(STAGED_MAX_BYTES / 1024 / 1024)} MB aren't supported yet.` }, { status: 413 });
    }
    stored = await putFileFromUrl(uid, id, `${body.name}.stash`, body.blobUrl);
  } else {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "Files over 50 MB aren't supported yet." }, { status: 413 });
    }
    meta = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string") as [string, string][]);
    meta.name ??= file.name;
    meta.size ??= String(file.size);
    const bytes = Buffer.from(await file.arrayBuffer());
    stored = await putFile(uid, id, meta.encrypted === "1" ? `${meta.name}.stash` : meta.name, bytes);
  }

  const f: StashFile = {
    id,
    uid,
    name: String(meta.name),
    size: Number(meta.size ?? 0),
    mime: String(meta.mime ?? "application/octet-stream"),
    folder: String(meta.folder ?? ""),
    source: (meta.source as StashFile["source"]) ?? "upload",
    createdAt: Date.now(),
    encrypted: meta.encrypted === "1",
    ...stored,
  };
  await store().addFile(f);
  return NextResponse.json({ file: pub(f) });
}

const pub = (f: StashFile) => ({
  id: f.id,
  name: f.name,
  size: f.size,
  mime: f.mime,
  folder: f.folder,
  source: f.source,
  createdAt: f.createdAt,
  encrypted: !!f.encrypted,
  stored: !!(f.tg || f.blob), // placeholder rows from the simulated migration have no bytes
});
