import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/session";
import { partsOf } from "@/lib/uploads";

// Which pieces of an upload have arrived, so a client can resume after a drop.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return unauthorized();
  const { id } = await params;
  const got = await partsOf(s.uid, id);
  if (!got) return NextResponse.json({ error: "unknown upload" }, { status: 404 });
  return NextResponse.json({ pieces: [...got.parts.keys()].sort((a, b) => a - b), thumb: !!got.thumb });
}
