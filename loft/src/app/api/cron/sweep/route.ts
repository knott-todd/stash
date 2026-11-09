import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { sweepUploads } from "@/lib/uploads";
import { sweepLimits } from "@/lib/ratelimit";
import { sweepSessions } from "@/lib/session";
import { sweepLinks } from "@/lib/devices";

export const maxDuration = 300;

// Daily housekeeping, run by Vercel Cron (vercel.json). Vercel sends
// `Authorization: Bearer <CRON_SECRET>`; locally, without the secret set, it runs freely.
export async function GET() {
  const secret = process.env.CRON_SECRET;
  const auth = (await headers()).get("authorization");
  if (process.env.VERCEL && (!secret || auth !== `Bearer ${secret}`)) return NextResponse.json({ error: "not here" }, { status: 404 });
  const [uploads, limits, sessions, links] = await Promise.all([sweepUploads(), sweepLimits(), sweepSessions(), sweepLinks()]);
  return NextResponse.json({ ok: true, uploads, limits, sessions, links });
}
