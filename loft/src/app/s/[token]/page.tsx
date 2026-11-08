import Link from "next/link";
import { StashLockup } from "@/components/Logo";
import { fmtBytes } from "@/lib/format";
import { store } from "@/lib/store";

export const metadata = { title: "Stash — Shared file" };
// Every link is looked up on request; nothing here is prerendered.
export const instant = false;

// What a stranger sees: the file's name and size, one Download button, and a
// picture or PDF shown right here. Nothing else about the account.
export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = store();
  const ref = /^[A-Za-z0-9_-]{10,64}$/.test(token) ? await db.kvGet<{ uid: string; fileId: string }>(`share:${token}`) : null;
  const f = ref ? await db.getFile(ref.uid, ref.fileId) : null;
  const ok = !!f && f.share?.token === token;
  const u = ok && ref ? await db.getUser(ref.uid) : null;
  const locked = !!u && (u.protection === "passcode" || !u.key);
  const preview = ok && !locked && f && (f.mime.startsWith("image/") || f.mime === "application/pdf" || f.mime.startsWith("video/"));

  return (
    <main className="flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-3xl px-5 py-5">
        <Link href="/" aria-label="Stash home" className="inline-block">
          <StashLockup />
        </Link>
      </header>
      <section className="mx-auto w-full max-w-3xl px-5 pb-16">
        {!ok || !f ? (
          <div className="card p-6">
            <h1 className="text-2xl font-semibold">This link no longer works.</h1>
            <p className="mt-2 text-ink-2">The person who shared it may have removed it.</p>
          </div>
        ) : locked ? (
          <div className="card p-6">
            <h1 className="text-2xl font-semibold">{f.name}</h1>
            <p className="mt-2 text-ink-2">This file is locked with a passcode, so the link can&apos;t open it. Ask the person who shared it.</p>
          </div>
        ) : (
          <div className="card p-6">
            <h1 className="text-2xl font-semibold break-words">{f.name}</h1>
            <p className="mt-1 text-ink-2">
              {fmtBytes(f.size)}
              {u?.name ? ` · shared by ${u.name}` : ""}
            </p>
            <a href={`/api/share/${token}`} className="btn-primary mt-5 inline-flex" download={f.name}>
              Download
            </a>
            {preview && f.mime.startsWith("image/") && (
              <img src={`/api/share/${token}?inline=1`} alt={f.name} className="mt-6 max-h-[70vh] w-auto rounded-xl border border-line" />
            )}
            {preview && f.mime.startsWith("video/") && <video src={`/api/share/${token}?inline=1`} controls className="mt-6 max-h-[70vh] w-full rounded-xl border border-line" />}
            {preview && f.mime === "application/pdf" && <iframe src={`/api/share/${token}?inline=1`} title={f.name} className="mt-6 h-[70vh] w-full rounded-xl border border-line" />}
            <p className="mt-6 text-sm text-ink-3">
              Stash is free, unlimited, private storage.{" "}
              <Link href="/" className="underline underline-offset-4">
                Get your own
              </Link>
              .
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
