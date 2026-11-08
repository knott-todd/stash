import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { accessTokenFor, fetchFile, isProvider } from "@/lib/providers";

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
  if (!r.ok || !r.body) return NextResponse.json({ error: `The provider returned ${r.status}` }, { status: 502 });
  return new Response(r.body, { headers: { "content-type": r.headers.get("content-type") ?? "application/octet-stream" } });
}
