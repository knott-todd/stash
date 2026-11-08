import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { accessTokenFor, GOOGLE_ENABLED, listAll } from "@/lib/google";
import { db } from "@/lib/store";

// Everything in the user's Drive, with folder paths. The browser does the copying.
export async function GET() {
  const uid = await getUid();
  if (!GOOGLE_ENABLED) return NextResponse.json({ connected: false, configured: false });
  const token = await accessTokenFor(uid).catch(() => null);
  if (!token) return NextResponse.json({ connected: false, configured: true });
  try {
    // Listing a large Drive takes a minute or more; keep the result for an hour.
    const cache = db.user(uid).googleList;
    const files = cache && Date.now() - cache.at < 60 * 60 * 1000 ? cache.files : await listAll(token);
    if (!cache || cache.files !== files) {
      db.user(uid).googleList = { at: Date.now(), files };
      db.save();
    }
    const bytes = files.reduce((n, f) => n + f.size, 0);
    return NextResponse.json({ connected: true, configured: true, files, total: files.length, bytes });
  } catch (e) {
    return NextResponse.json({ connected: true, configured: true, error: String(e) }, { status: 502 });
  }
}
