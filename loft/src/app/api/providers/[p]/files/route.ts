import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { accessTokenFor, isProvider, listAll, PROVIDERS, type Listed } from "@/lib/providers";
import { store } from "@/lib/store";

// Streams or long listings: allow the function the time it needs.
export const maxDuration = 300;

// Everything in the connected drive, with folder paths; cached for an hour.
export async function GET(_: Request, { params }: { params: Promise<{ p: string }> }) {
  const { p } = await params;
  const s = await getSession();
  if (!s) return unauthorized();
  if (!isProvider(p) || !PROVIDERS[p].enabled) return NextResponse.json({ connected: false, configured: false });
  const token = await accessTokenFor(p, s.uid).catch(() => null);
  if (!token) return NextResponse.json({ connected: false, configured: true });
  try {
    const db = store();
    const key = `plist:${p}:${s.uid}`;
    const cache = await db.kvGet<{ at: number; files: Listed[] }>(key);
    let files = cache && Date.now() - cache.at < 60 * 60 * 1000 ? cache.files : null;
    if (!files) {
      files = await listAll(p, token);
      await db.kvSet(key, { at: Date.now(), files });
    }
    return NextResponse.json({ connected: true, configured: true, files, total: files.length, bytes: files.reduce((n, f) => n + f.size, 0) });
  } catch (e) {
    return NextResponse.json({ connected: true, configured: true, error: String(e) }, { status: 502 });
  }
}

// Disconnect.
export async function DELETE(_: Request, { params }: { params: Promise<{ p: string }> }) {
  const { p } = await params;
  const s = await getSession();
  if (!s) return unauthorized();
  if (!isProvider(p)) return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  const { disconnect } = await import("@/lib/providers");
  await disconnect(s.uid, p);
  const { stopCopy } = await import("@/lib/copyjob");
  await stopCopy(s.uid, p);
  return NextResponse.json({ ok: true });
}
