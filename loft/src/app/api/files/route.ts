import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { db, newId, type LoftFile } from "@/lib/store";
import { putFile } from "@/lib/telegram";

export async function GET() {
  const uid = await getUid();
  return NextResponse.json({ files: db.filesFor(uid).map(pub) });
}

export async function POST(req: Request) {
  const uid = await getUid();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  // The browser sends ciphertext plus the original name and type; we never see the plaintext.
  const name = String(form.get("name") ?? file.name);
  const mime = String(form.get("mime") ?? file.type ?? "application/octet-stream");
  const encrypted = form.get("encrypted") === "1";
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "Files over 50 MB need the local Bot API server (coming soon)." }, { status: 413 });
  }
  const id = newId();
  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = await putFile(uid, id, encrypted ? `${name}.loft` : name, bytes);
  const f: LoftFile = {
    id,
    uid,
    name,
    size: Number(form.get("size") ?? file.size),
    mime,
    folder: String(form.get("folder") ?? ""),
    source: (String(form.get("source") ?? "upload") as LoftFile["source"]),
    createdAt: Date.now(),
    encrypted,
    ...stored,
  };
  db.addFile(f);
  return NextResponse.json({ file: pub(f) });
}

const pub = (f: LoftFile) => ({
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
