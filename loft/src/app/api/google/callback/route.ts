import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { store } from "@/lib/store";
import { exchangeCode } from "@/lib/google";
import { completeSignIn, takeOAuthState } from "@/lib/auth";
import { requestOrigin } from "@/lib/public-url";
import { clientIp, limit } from "@/lib/ratelimit";

// One callback for both Google flows; the state cookie says which.
export async function GET(req: Request) {
  const hit = await limit("auth", await clientIp(), 30, 60);
  if (hit) return hit;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const denied = url.searchParams.get("error");
  const origin = requestOrigin(req);
  const state = await takeOAuthState(url.searchParams.get("state"));

  if (!state) return NextResponse.redirect(`${origin}/signin?error=expired`);

  if (state.kind === "signin") {
    if (denied || !code) return NextResponse.redirect(`${origin}/signin?error=denied`);
    try {
      await completeSignIn(origin, code);
      return NextResponse.redirect(`${origin}${state.next ?? "/drive"}`);
    } catch {
      return NextResponse.redirect(`${origin}/signin?error=failed`);
    }
  }

  // Drive connection for the migration. From the phone app the state (our own httpOnly cookie,
  // nonce-checked) names the account and the result goes back to the app.
  const fromApp = state.next === "app";
  const back = (result: string) => NextResponse.redirect(fromApp ? `stash://drive-connected?result=${result}` : `${origin}/drive?google=${result}`);
  const uid = fromApp ? (state.uid ?? null) : await getUid();
  if (denied || !code || !uid || state.uid !== uid) return back("denied");
  try {
    const t = await exchangeCode(origin, code);
    const db = store();
    const u = await db.getUser(uid);
    u.google = { accessToken: t.access_token, refreshToken: t.refresh_token ?? u.google?.refreshToken, expiresAt: Date.now() + t.expires_in * 1000 };
    await db.saveUser(u);
    return back("ok");
  } catch {
    return back("failed");
  }
}
