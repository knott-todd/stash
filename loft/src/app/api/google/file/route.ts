import { NextResponse } from "next/server";
import { getUid, unauthorized } from "@/lib/session";
import { accessTokenFor, fetchFile, googleRefusal } from "@/lib/google";
import { FAKE_DRIVE, fakeDownload } from "@/lib/copyjob";

// Streams or long listings: allow the function the time it needs.
export const maxDuration = 300;

// Proxies one file's bytes from Google to the browser (which encrypts them).
export async function GET(req: Request) {
  const uid = await getUid();
  if (!uid) return unauthorized();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const exportAs = url.searchParams.get("export") ?? undefined;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (FAKE_DRIVE) return fakeDownload(id);
  const token = await accessTokenFor(uid).catch(() => null);
  if (!token) return NextResponse.json({ error: "Google isn't connected" }, { status: 401 });
  const r = await fetchFile(token, id, exportAs);
  // 422: Google refused this file for good (gone, too large to export). 502: worth trying again.
  if (!r.ok || !r.body) {
    const { retry, reason } = r.ok ? { retry: true, reason: "empty" } : await googleRefusal(r);
    return NextResponse.json({ error: `Google: ${reason}` }, { status: retry ? 502 : 422 });
  }
  return new Response(r.body, { headers: { "content-type": r.headers.get("content-type") ?? "application/octet-stream" } });
}
