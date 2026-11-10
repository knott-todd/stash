import { after, NextResponse } from "next/server";
import { headers } from "next/headers";
import { allRecordsEverywhere, kick, needsKick, runAndHandOver, runAuthorized } from "@/lib/copyjob";
import { isCopyProvider } from "@/lib/copy-types";
import { requestOrigin } from "@/lib/public-url";

export const maxDuration = 300;

// The copy job's own door. POST {uid, provider}: do one run, then hand over to the next.
// Answers at once and works after responding, so whoever knocked isn't kept waiting.
export async function POST(req: Request) {
  if (!runAuthorized((await headers()).get("authorization"))) return NextResponse.json({ error: "not here" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const uid = typeof body.uid === "string" ? body.uid : null;
  if (!uid || !isCopyProvider(body.provider)) return NextResponse.json({ error: "uid and provider required" }, { status: 400 });
  const origin = requestOrigin(req);
  const p = body.provider;
  after(() => runAndHandOver(origin, uid, p));
  return NextResponse.json({ ok: true }, { status: 202 });
}

// The watchdog (a schedule, or Vercel Cron): restart any copy whose runs went quiet.
export async function GET(req: Request) {
  if (!runAuthorized((await headers()).get("authorization"))) return NextResponse.json({ error: "not here" }, { status: 404 });
  const origin = requestOrigin(req);
  const stale = (await allRecordsEverywhere()).filter((x) => needsKick(x.rec));
  await Promise.all(stale.map((x) => kick(origin, x.uid, x.rec.provider)));
  return NextResponse.json({ ok: true, restarted: stale.length });
}
