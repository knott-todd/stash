import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { CHUNK_CIPHER_BYTES, newId } from "@/lib/store";
import { putObject, StorageBusy } from "@/lib/telegram";
import { busy } from "@/lib/files-api";

// One piece of a large file. The client encrypts the file in fixed-size pieces,
// sends each one here, then registers the whole list with POST /api/files.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return unauthorized();
  const form = await req.formData();
  const piece = form.get("piece");
  if (!(piece instanceof File) || piece.size === 0) return NextResponse.json({ error: "no piece" }, { status: 400 });
  if (piece.size > CHUNK_CIPHER_BYTES) return NextResponse.json({ error: "piece too large" }, { status: 413 });
  const name = String(form.get("name") ?? "file");
  const index = Number(form.get("index") ?? 0);
  try {
    const part = await putObject(s.uid, `${newId()}.p${index}`, `${name}.part${index}.stash`, Buffer.from(await piece.arrayBuffer()));
    return NextResponse.json({ part });
  } catch (e) {
    if (e instanceof StorageBusy) return busy(e);
    throw e;
  }
}
