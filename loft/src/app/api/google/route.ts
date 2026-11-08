import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { store } from "@/lib/store";

// Disconnect Google for this device: drops the tokens and the cached Drive
// listing so the next "Move my Google Drive" starts from Google's account chooser.
export async function DELETE() {
  const uid = await getUid();
  const db = store();
  const u = await db.getUser(uid);
  delete u.google;
  delete u.googleList;
  await db.saveUser(u);
  return NextResponse.json({ ok: true });
}
