import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { db } from "@/lib/store";
import { getFileStream } from "@/lib/telegram";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUid();
  const { id } = await params;
  const f = db.get().files.find((x) => x.id === id && x.uid === uid);
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  const stream = await getFileStream(f);
  if (!stream) {
    // Migrated demo files have no bytes behind them.
    return NextResponse.json({ error: "This file is a demo placeholder from the simulated migration." }, { status: 404 });
  }
  // Encrypted files come back as ciphertext; the browser decrypts them.
  return new Response(stream, {
    headers: {
      "content-type": f.encrypted ? "application/octet-stream" : f.mime,
      "content-disposition": `attachment; filename="${encodeURIComponent(f.name)}${f.encrypted ? ".loft" : ""}"`,
      "x-loft-encrypted": f.encrypted ? "1" : "0",
    },
  });
}
