import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { beginOAuth } from "@/lib/auth";
import { GOOGLE_ENABLED } from "@/lib/google";
import { requestOrigin } from "@/lib/public-url";
import { store } from "@/lib/store";
import { handoffKey, HANDOFF_TTL_MS } from "@/app/api/auth/handoff/route";

// Connect Google Drive (read-only) to the signed-in account, for the migration.
// ?switch=1 shows Google's account chooser instead of the signed-in account.
export async function GET(req: Request) {
  if (!GOOGLE_ENABLED) return NextResponse.json({ error: "Google isn't configured" }, { status: 503 });
  const origin = requestOrigin(req);
  const url = new URL(req.url);
  // From the phone app: a one-time handoff code stands in for the device token (see /api/auth/handoff).
  const handoff = url.searchParams.get("handoff");
  let uid: string | null = null;
  let fromApp = false;
  if (handoff && /^[A-Za-z0-9_-]{16,40}$/.test(handoff)) {
    const db = store();
    const h = await db.kvGet<{ uid: string; createdAt: number }>(handoffKey(handoff));
    await db.kvDelete(handoffKey(handoff));
    if (h && Date.now() - h.createdAt < HANDOFF_TTL_MS) {
      uid = h.uid;
      fromApp = true;
    } else return NextResponse.redirect("stash://drive-connected?result=expired");
  } else uid = await getUid();
  if (!uid) return NextResponse.redirect(`${origin}/signin?next=${encodeURIComponent("/api/google/auth")}`);
  const chooser = url.searchParams.get("switch") === "1";
  const u = await store().getUser(uid);
  return NextResponse.redirect(await beginOAuth(origin, { kind: "drive", uid, ...(fromApp ? { next: "app" } : {}) }, { hint: u.email, chooser }));
}
