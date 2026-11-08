import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { db } from "@/lib/store";

// Disconnect Google for this device: drops the tokens and the cached Drive
// listing so the next "Move my Google Drive" starts from Google's account chooser.
export async function DELETE() {
  const uid = await getUid();
  const u = db.user(uid);
  delete u.google;
  delete u.googleList;
  db.save();
  return NextResponse.json({ ok: true });
}
