import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { accessTokenFor, fetchFile } from "@/lib/google";

// Proxies one file's bytes from Google to the browser (which encrypts them).
export async function GET(req: Request) {
  const uid = await getUid();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const exportAs = url.searchParams.get("export") ?? undefined;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const token = await accessTokenFor(uid).catch(() => null);
  if (!token) return NextResponse.json({ error: "Google isn't connected" }, { status: 401 });
  const r = await fetchFile(token, id, exportAs);
  if (!r.ok || !r.body) return NextResponse.json({ error: `Google returned ${r.status}` }, { status: 502 });
  return new Response(r.body, { headers: { "content-type": r.headers.get("content-type") ?? "application/octet-stream" } });
}
