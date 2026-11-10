import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { sweepUploads } from "@/lib/uploads";
import { sweepLimits } from "@/lib/ratelimit";
import { sweepSessions } from "@/lib/session";
import { sweepLinks } from "@/lib/devices";
import { allRecordsEverywhere, kick, needsKick } from "@/lib/copyjob";
import { requestOrigin } from "@/lib/public-url";

export const maxDuration = 300;

// Daily housekeeping, run by Vercel Cron (vercel.json). Vercel sends
// `Authorization: Bearer <CRON_SECRET>`; locally, without the secret set, it runs freely.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = (await headers()).get("authorization");
  if (process.env.VERCEL && (!secret || auth !== `Bearer ${secret}`)) return NextResponse.json({ error: "not here" }, { status: 404 });
  const [uploads, limits, sessions, links] = await Promise.all([sweepUploads(), sweepLimits(), sweepSessions(), sweepLinks()]);
  // Also a watchdog for copies from other drives whose runs went quiet.
  const stale = (await allRecordsEverywhere()).filter((x) => needsKick(x.rec));
  await Promise.all(stale.map((x) => kick(requestOrigin(req), x.uid, x.rec.provider)));
  return NextResponse.json({ ok: true, uploads, limits, sessions, links, copiesRestarted: stale.length });
}
