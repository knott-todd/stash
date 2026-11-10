import { NextResponse } from "next/server";
import { getUid, unauthorized } from "@/lib/session";
import { store } from "@/lib/store";
import { stopCopy } from "@/lib/copyjob";

// Disconnect Google for this device: drops the tokens and the cached Drive
// listing so the next "Move my Google Drive" starts from Google's account chooser.
export async function DELETE() {
  const uid = await getUid();
  if (!uid) return unauthorized();
  const db = store();
  const u = await db.getUser(uid);
  delete u.google;
  delete u.googleList;
  await db.saveUser(u);
  await db.kvDelete(`glist:${uid}`);
  // Without access the copy can't go on; it waits, stopped, with its count of what's left.
  await stopCopy(uid, "google-drive");
  return NextResponse.json({ ok: true });
}
