import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { accessTokenFor, GOOGLE_ENABLED, listAll, type GFile } from "@/lib/google";
import { store } from "@/lib/store";

// Everything in the user's Drive, with folder paths. The browser does the copying.
export async function GET() {
  const uid = await getUid();
  if (!GOOGLE_ENABLED) return NextResponse.json({ connected: false, configured: false });
  const token = await accessTokenFor(uid).catch(() => null);
  if (!token) return NextResponse.json({ connected: false, configured: true });
  try {
    // Listing a large Drive takes a minute or more; keep the result for an hour.
    // The listing can be tens of MB; it lives in its own entry so routine
    // requests that load the user never carry it.
    const db = store();
    const cache = await db.kvGet<{ at: number; files: GFile[] }>(`glist:${uid}`);
    let files = cache && Date.now() - cache.at < 60 * 60 * 1000 ? cache.files : null;
    if (!files) {
      files = await listAll(token);
      await db.kvSet(`glist:${uid}`, { at: Date.now(), files });
    }
    const bytes = files.reduce((n, f) => n + f.size, 0);
    return NextResponse.json({ connected: true, configured: true, files, total: files.length, bytes });
  } catch (e) {
    return NextResponse.json({ connected: true, configured: true, error: String(e) }, { status: 502 });
  }
}
