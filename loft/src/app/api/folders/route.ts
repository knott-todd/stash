import { NextResponse } from "next/server";
import { bumpRev } from "@/lib/rev";
import { getSession, unauthorized } from "@/lib/session";
import { store } from "@/lib/store";

// Folders exist implicitly through the files in them. An empty folder someone
// just made is remembered here until a file lands in it.
const key = (uid: string) => `folders:${uid}`;
const clean = (p: unknown) => String(p ?? "").split("/").map((s) => s.trim()).filter(Boolean).join("/").slice(0, 500);

export async function GET() {
  const s = await getSession();
  if (!s) return unauthorized();
  return NextResponse.json({ folders: (await store().kvGet<string[]>(key(s.uid))) ?? [] });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const path = clean(body.path);
  if (!path) return NextResponse.json({ error: "name required" }, { status: 400 });
  const db = store();
  const list = (await db.kvGet<string[]>(key(s.uid))) ?? [];
  if (!list.includes(path)) await db.kvSet(key(s.uid), [...list, path].slice(0, 2000));
  await bumpRev(s.uid);
  return NextResponse.json({ ok: true, path });
}

// Forget an explicit folder (its files, if any, are moved or trashed by the caller).
export async function DELETE(req: Request) {
  const s = await getSession();
  if (!s) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const path = clean(body.path);
  const db = store();
  const list = (await db.kvGet<string[]>(key(s.uid))) ?? [];
  await db.kvSet(key(s.uid), list.filter((p) => p !== path && !p.startsWith(path + "/")));
  await bumpRev(s.uid);
  return NextResponse.json({ ok: true });
}
