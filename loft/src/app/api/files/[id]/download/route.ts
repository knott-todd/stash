import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { store } from "@/lib/store";
import { getFileStream } from "@/lib/telegram";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return unauthorized();
  const { id } = await params;
  const f = await store().getFile(s.uid, id);
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  const stream = await getFileStream(f);
  if (!stream) {
    // Migrated demo files have no bytes behind them.
    return NextResponse.json({ error: "This file is a demo placeholder from the simulated migration." }, { status: 404 });
  }
  // Encrypted files come back as ciphertext; the browser decrypts them, piece by
  // piece when the file was sent in pieces.
  return new Response(stream, {
    headers: {
      "content-type": f.encrypted ? "application/octet-stream" : f.mime,
      "content-disposition": `attachment; filename="${encodeURIComponent(f.name)}${f.encrypted ? ".stash" : ""}"`,
      "x-stash-encrypted": f.encrypted ? "1" : "0",
      "x-stash-chunked": f.parts?.length ? "1" : "0",
    },
  });
}
