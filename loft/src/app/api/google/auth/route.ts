import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { beginOAuth } from "@/lib/auth";
import { GOOGLE_ENABLED } from "@/lib/google";
import { requestOrigin } from "@/lib/public-url";

// Connect Google Drive (read-only) to the signed-in account, for the migration.
export async function GET(req: Request) {
  if (!GOOGLE_ENABLED) return NextResponse.json({ error: "Google isn't configured" }, { status: 503 });
  const uid = await getUid();
  const origin = requestOrigin(req);
  if (!uid) return NextResponse.redirect(`${origin}/signin?next=${encodeURIComponent("/api/google/auth")}`);
  return NextResponse.redirect(await beginOAuth(origin, { kind: "drive", uid }));
}
