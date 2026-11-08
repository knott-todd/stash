import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUid } from "@/lib/session";
import { exchangeCode, isProvider, saveTokens } from "@/lib/providers";
import { requestOrigin } from "@/lib/public-url";

export async function GET(req: Request, { params }: { params: Promise<{ p: string }> }) {
  const { p } = await params;
  const origin = requestOrigin(req);
  if (!isProvider(p)) return NextResponse.redirect(`${origin}/drive`);
  const url = new URL(req.url);
  const jar = await cookies();
  const raw = jar.get(`stash_oauth_${p}`)?.value;
  jar.delete(`stash_oauth_${p}`);
  const uid = await getUid();
  let expected: { state: string; uid: string } | null = null;
  try {
    expected = raw ? JSON.parse(raw) : null;
  } catch {}
  const code = url.searchParams.get("code");
  if (!uid || !expected || expected.uid !== uid || expected.state !== url.searchParams.get("state") || !code || url.searchParams.get("error")) {
    return NextResponse.redirect(`${origin}/drive?connected=${p}&result=denied`);
  }
  try {
    await saveTokens(uid, p, await exchangeCode(p, origin, code));
    return NextResponse.redirect(`${origin}/drive?connected=${p}&result=ok`);
  } catch {
    return NextResponse.redirect(`${origin}/drive?connected=${p}&result=failed`);
  }
}
