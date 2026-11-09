import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { store, type WrappedKey } from "@/lib/store";

// How the account's file key is kept.
//   standard  Stash holds the key; any signed-in device gets it.
//   passcode  Stash holds only a passcode-wrapped copy it cannot open.
// Switching is done by whichever client holds the plain key at that moment, a browser
// or a linked device: to lock, it sends the wrapped key; to unlock, it sends the plain
// key back (a Locked device only has it after the passcode).

const isWrapped = (w: unknown): w is WrappedKey => {
  const x = w as WrappedKey;
  return !!x && typeof x === "object" && [x.salt, x.iv, x.ct].every((s) => typeof s === "string" && s.length > 0 && s.length < 400) && Number.isInteger(x.iter) && x.iter >= 100_000 && x.iter <= 5_000_000;
};

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const db = store();
  const u = await db.getUser(s.uid);
  if (body.mode === "standard") {
    if (u.protection === "passcode") {
      if (typeof body.key !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(body.key)) return NextResponse.json({ error: "key required" }, { status: 400 });
      u.key = body.key;
      delete u.keyWrapped;
    }
    u.protection = "standard";
  } else if (body.mode === "passcode") {
    if (!isWrapped(body.keyWrapped)) return NextResponse.json({ error: "wrapped key required" }, { status: 400 });
    u.keyWrapped = { salt: body.keyWrapped.salt, iv: body.keyWrapped.iv, ct: body.keyWrapped.ct, iter: body.keyWrapped.iter, ...(typeof body.keyWrapped.hint === "string" ? { hint: body.keyWrapped.hint.slice(0, 60) } : {}) };
    delete u.key;
    u.protection = "passcode";
  } else {
    return NextResponse.json({ error: "mode must be standard or passcode" }, { status: 400 });
  }
  await db.saveUser(u);
  return NextResponse.json({ ok: true, protection: u.protection });
}
