import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { accessTokenFor, fetchFile, isProvider } from "@/lib/providers";

// Streams or long listings: allow the function the time it needs.
export const maxDuration = 300;

// Proxies one file's bytes from the provider to the browser (which encrypts them).
export async function GET(req: Request, { params }: { params: Promise<{ p: string }> }) {
  const { p } = await params;
  const s = await getSession();
  if (!s) return unauthorized();
  if (!isProvider(p)) return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const token = await accessTokenFor(p, s.uid).catch(() => null);
  if (!token) return NextResponse.json({ error: "Not connected" }, { status: 401 });
  const r = await fetchFile(p, token, id);
  // 422: refused for good. 502: worth trying again.
  if (!r.ok || !r.body) {
    const retry = r.ok || r.status === 429 || r.status >= 500 || r.status === 408 || r.status === 401;
    return NextResponse.json({ error: `The provider returned ${r.status}` }, { status: retry ? 502 : 422 });
  }
  return new Response(r.body, { headers: { "content-type": r.headers.get("content-type") ?? "application/octet-stream" } });
}
