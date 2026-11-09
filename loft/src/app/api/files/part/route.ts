import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { CHUNK_CIPHER_BYTES, newId } from "@/lib/store";
import { putObject, StorageBusy } from "@/lib/telegram";
import { busy } from "@/lib/files-api";
import { getUpload, recordPart } from "@/lib/uploads";
import { limit, spendBudget } from "@/lib/ratelimit";

// Streams or long listings: allow the function the time it needs.
export const maxDuration = 300;

// One piece of a large file, recorded on the server under the upload it belongs
// to. The client never sees a storage pointer: it registers the upload id, and the
// server assembles the pieces from its own ledger.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return unauthorized();
  const hit = await limit("part", s.uid, 600, 60);
  if (hit) return hit;
  const form = await req.formData();
  const piece = form.get("piece");
  if (!(piece instanceof File) || piece.size === 0) return NextResponse.json({ error: "no piece" }, { status: 400 });
  if (piece.size > CHUNK_CIPHER_BYTES) return NextResponse.json({ error: "piece too large" }, { status: 413 });
  const upload = String(form.get("upload") ?? "");
  const head = await getUpload(s.uid, upload);
  if (!head) return NextResponse.json({ error: "Start the upload first (POST /api/uploads)." }, { status: 400 });
  const rawIndex = String(form.get("index") ?? "0");
  const index: number | "thumb" = rawIndex === "thumb" ? "thumb" : Number(rawIndex);
  if (index !== "thumb" && (!Number.isInteger(index) || index < 0 || index > 100_000)) return NextResponse.json({ error: "bad index" }, { status: 400 });
  const over = await spendBudget(s.uid, piece.size);
  if (over) return over;
  try {
    const part = await putObject(s.uid, `${newId()}.p${index}`, `${head.name}.part${index}.stash`, Buffer.from(await piece.arrayBuffer()));
    await recordPart(s.uid, upload, index, part);
    return NextResponse.json({ ok: true, index });
  } catch (e) {
    if (e instanceof StorageBusy) return busy(e);
    throw e;
  }
}
