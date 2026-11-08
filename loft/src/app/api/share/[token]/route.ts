import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { getFileStream } from "@/lib/telegram";
import { decryptingStream, importRawKey } from "@/lib/server-crypto";

// Public: the file behind a link, decrypted here. ?info=1 describes it instead.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const db = store();
  const ref = await db.kvGet<{ uid: string; fileId: string }>(`share:${token}`);
  if (!ref) return NextResponse.json({ error: "This link no longer works." }, { status: 404 });
  const [u, f] = await Promise.all([db.getUser(ref.uid), db.getFile(ref.uid, ref.fileId)]);
  if (!f || f.share?.token !== token) return NextResponse.json({ error: "This link no longer works." }, { status: 404 });
  const url = new URL(req.url);
  if (url.searchParams.get("info") === "1") {
    return NextResponse.json({ name: f.name, size: f.size, mime: f.mime, from: u.name ?? u.email ?? null });
  }
  if (f.encrypted && (u.protection === "passcode" || !u.key)) return NextResponse.json({ error: "This file is locked with a passcode; the link can't open it." }, { status: 409 });
  const cipher = await getFileStream(f);
  if (!cipher) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = f.encrypted ? decryptingStream(cipher as ReadableStream<Uint8Array>, await importRawKey(u.key!), !!f.parts?.length) : cipher;
  const inline = url.searchParams.get("inline") === "1";
  return new Response(body, {
    headers: {
      "content-type": f.mime || "application/octet-stream",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "cache-control": "private, no-store",
    },
  });
}
