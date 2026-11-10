import { after, NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { store } from "@/lib/store";
import { connected as othersConnected } from "@/lib/providers";
import { allRecords, FAKE_DRIVE, forgetCopy, isQuiet, reportCopy, runAndHandOver, startCopy, stopCopy } from "@/lib/copyjob";
import { isCopyProvider, type CopyProvider } from "@/lib/copy-types";
import { requestOrigin } from "@/lib/public-url";

// A run may happen inside these requests (after the answer is sent): give it the time.
export const maxDuration = 300;

// Moves from other drives, as the person sees them: where each copy is, and the buttons.
//   GET                                  every copy's record
//   POST {provider, action: "start"}     list the drive again and copy what's new
//   POST {provider, action: "resume"}    carry on (set-aside files get another go)
//   POST {provider, action: "stop"}      the only thing that ends a copy
//   POST {provider, action: "forget"}    switching accounts: drop the queue and record
//   POST {provider, action: "report", …} the browser copy (passcode accounts) says where it is

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return unauthorized();
  const copies = await allRecords(s.uid);
  // An open page keeps its copy going: quiet for 90 s (a run ended and the handover didn't
  // happen), the next run starts right here. The lease stops two runs at once.
  const origin = requestOrigin(req);
  const quiet = copies.filter((c) => isQuiet(c, 90_000));
  if (quiet.length) after(() => Promise.all(quiet.map((c) => runAndHandOver(origin, s.uid, c.provider))));
  return NextResponse.json({ copies });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const p = body.provider;
  if (!isCopyProvider(p)) return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  const origin = requestOrigin(req);

  if (body.action === "stop") return NextResponse.json({ copy: await stopCopy(s.uid, p) });
  if (body.action === "forget") {
    await forgetCopy(s.uid, p);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "report") return NextResponse.json({ copy: await reportCopy(s.uid, p, body.status ?? {}) });

  if (body.action === "start" || body.action === "resume") {
    const u = await store().getUser(s.uid);
    if (!isConnected(u, p)) return NextResponse.json({ error: "not connected", reconnect: true }, { status: 409 });
    // Standard accounts copy on the server; passcode accounts can only copy in a browser.
    const mode = u.protection === "passcode" ? "browser" : "server";
    const copy = await startCopy(s.uid, p, mode, { relist: body.action === "start" });
    // The first run happens in this request, so starting never depends on the handover.
    if (mode === "server") after(() => runAndHandOver(origin, s.uid, p));
    return NextResponse.json({ copy });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

function isConnected(u: Awaited<ReturnType<ReturnType<typeof store>["getUser"]>>, p: CopyProvider) {
  if (p === "google-drive") return FAKE_DRIVE || !!u.google;
  return othersConnected(u)[p];
}
