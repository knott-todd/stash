import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { startUpload } from "@/lib/uploads";
import { limit } from "@/lib/ratelimit";

// Start an upload in pieces: the server issues the id every piece is recorded under.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return unauthorized();
  const hit = await limit("uploads", s.uid, 600, 60);
  if (hit) return hit;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name ? body.name : "file";
  return NextResponse.json({ upload: await startUpload(s.uid, name) });
}
